/*global module*/

"use strict";

const data = {
    homework: undefined,
    zwave: undefined
};

function Thermostat(nodeid, nodeinfo)
{
    this._initValues(this);
    this.nodeid = nodeid;
}

Thermostat.cnt = 0;

Thermostat.ClassIds = {
    49: "Temperature", // read only
    67: "Setpoint",
    64: "Mode",
    66: "Operating State", // read only
    69: "Fan State", // read only
    68: "Fan Mode"
};

Thermostat.acceptable = function(val)
{
    return val.genre == "user" && !val.write_only;
};

Thermostat.createValue = function(v)
{
    var name = v.label;
    if (!(typeof name === "string") || !name.length)
        name = Thermostat.ClassIds[v.class_id];
    var values, range;
    if (v.type == "list") {
        values = Object.create(null);
        for (var val in v.values) {
            values[v.values[val]] = v.values[val];
        }
        if (v.max > v.min)
            range = [v.min, v.max];
    }
    const hwv = new data.homework.Device.Value(name, values, range);
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

Thermostat.prototype = {
    _acceptValue: function(value) {
        if (value.class_id in Thermostat.ClassIds && Thermostat.acceptable(value))
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
    createHomeworkDevice: function(uuid) {
        var hwdev = new data.homework.Device(uuid);
        if (!hwdev.name)
            hwdev.name = "Thermostat " + (++Thermostat.cnt);
        for (var k in this._values) {
            let v = this._values[k];
            let hwval = Thermostat.createValue(v);
            hwval.update(v.value);
            this._hwvalues[k] = hwval;
            hwdev.addValue(hwval);
        }

        this._hwdevice = hwdev;
        data.homework.addDevice(hwdev);
    }
};

module.exports = {
    init: function(devices) {
        data.homework = devices.homework;
        data.zwave = devices.zwave;

        var ctor = function(nodeid, nodeinfo) {
            if (nodeinfo.type == "General Thermostat V2") {
                return new Thermostat(nodeid, nodeinfo);
            }
            return undefined;
        };
        devices.registerDevice(ctor, Thermostat.prototype);
    }
};
