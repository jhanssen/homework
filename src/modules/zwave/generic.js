/*global module*/

"use strict";

const data = {
    homework: undefined,
    zwave: undefined
};

function Generic(nodeid, nodeinfo)
{
    this._initValues(this);
    this.nodeid = nodeid;
    this.type = nodeinfo.type;
}

Generic.dcnt = 0;
Generic.vcnt = 0;

Generic.ClassIds = {
    49: "Temperature", // read only
    67: "Setpoint",
    64: "Mode",
    66: "Operating State", // read only
    69: "Fan State", // read only
    68: "Fan Mode"
};

Generic.acceptable = function(val)
{
    return val.genre == "user" && !val.write_only;
};

Generic.createValue = function(v)
{
    var name = v.label;
    if (!(typeof name === "string") || !name.length) {
        if (v.class_id in Generic.ClassIds)
            name = Generic.ClassIds[v.class_id];
        else
            name = "Unknown:" + v.class_id + " " + (++Generic.vcnt);
    }
    var values, range;
    if (v.type == "list") {
        values = Object.create(null);
        for (var val in v.values) {
            values[v.values[val]] = v.values[val];
        }
        if (v.max > v.min)
            range = [v.min, v.max];
    }
    const hwv = new data.homework.Device.Value(name, values, range, v);
    if (!v.read_only) {
        hwv._valueUpdated = function(val) {
            try {
                if (v.type == "decimal" || v.type == "byte")
                    val = parseInt(val);
                data.zwave.setValue(v.node_id, v.class_id, v.instance, v.index, val);
            } catch (e) {
                data.homework.Console.error("error updating value", e);
            }
        };
    }
    return hwv;
};

Generic.prototype = {
    _acceptValue: function(value) {
        if (Generic.acceptable(value))
            return true;
        return false;
    },
    _changeValue: function(value) {
        // find the homework value
        if (value.value_id in this._hwvalues) {
            var hwval = this._hwvalues[value.value_id];
            hwval.update(value.value);
        }
    },
    _removeValue: function(value) {
    },
    createHomeworkDevice: function(type, uuid, devices) {
        var hwdev = new data.homework.Device(type, uuid);
        if (!hwdev.name) {
            var n = this.type;
            if (!(typeof n === "string") || !n.length)
                n = "Generic";
            hwdev.name = n + " " + (++Generic.dcnt);
        }
        for (var k in this._values) {
            let v = this._values[k];
            let hwval = Generic.createValue(v);
            hwval.update(v.value);
            this._hwvalues[k] = hwval;
            hwdev.addValue(hwval);
        }

        devices.fixupValues(hwdev);

        this._hwdevice = hwdev;
        data.homework.addDevice(hwdev);
    },
    updateHomeworkDevice: function(devices) {
        // create outstanding values
        for (var k in this._values) {
            if (k in this._hwvalues)
                continue;
            let v = this._values[k];
            let hwval = Generic.createValue(v);
            hwval.update(v.value);
            this._hwvalues[k] = hwval;
            this._hwdevice.addValue(hwval);
        }

        devices.fixupValues(this._hwdevice);
    }
};

module.exports = {
    init: function(devices) {
        data.homework = devices.homework;
        data.zwave = devices.zwave;

        var ctor = function(nodeid, nodeinfo) {
            return new Generic(nodeid, nodeinfo);
        };
        devices.registerDevice(ctor, Generic.prototype);
    }
};
