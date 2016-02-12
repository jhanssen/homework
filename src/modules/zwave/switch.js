/*global module*/

"use strict";

const data = {
    homework: undefined,
    zwave: undefined
};

function Switch(nodeid, nodeinfo)
{
    this._initValues(this);
    this._pending = undefined;
    this.nodeid = nodeid;
}

Switch.cnt = 0;

Switch.prototype = {
    _acceptValue: function(value) {
        if (value.class_id == 37 && value.type == "bool" && value.genre == "user"
            && !value.read_only && !value.write_only)
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
            hwdev.name = "Binary Scene Switch " + (++Switch.cnt);
        for (var k in this._values) {
            let v = this._values[k];
            let hwval = new data.homework.Device.Value("value", { off: false, on: true });
            hwval._valueUpdated = function(val) {
                try {
                    if (typeof val === "boolean") {
                        data.zwave.setValue(v.node_id, v.class_id, v.instance, v.index, val);
                    } else if (typeof val === "number") {
                        data.zwave.setValue(v.node_id, v.class_id, v.instance, v.index, (val != 0));
                    }
                } catch (e) {
                    data.homework.Console.error("error updating value", e);
                }
            };
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
            if (nodeinfo.type == "Binary Scene Switch") {
                return new Switch(nodeid, nodeinfo);
            }
            return undefined;
        };
        devices.registerDevice(ctor, Switch.prototype);
    }
};
