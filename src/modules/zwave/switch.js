/*global module,setInterval,clearInterval*/

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
            if (this._pending === undefined || value.value == this._pending.value) {
                if (this._pending && "interval" in this._pending)
                    clearInterval(this._pending.interval);
                this._pending = undefined;
                hwval.update(value.value);
            } else {
                this._pending.lastValue = value.value;
                if (this._pending.interval === undefined) {
                    this._pending.key = [value.node_id, value.class_id, value.instance, value.index];
                    this._pending.fired = 0;
                    this._pending.interval = setInterval(() => {
                        if (++this._pending.fired > 10) {
                            clearInterval(this._pending.interval);
                            hwval.update(this._pending.lastValue);
                            this._pending = undefined;
                        } else {
                            var k = this._pending.key;
                            data.zwave.refreshValue(k[0], k[1], k[2], k[3]);
                        }
                    }, 500);
                    data.zwave.refreshValue(value.node_id, value.class_id, value.instance, value.index);
                }
            }
        }
    },
    _removeValue: function(value) {
    },
    createHomeworkDevice: function(type, uuid) {
        var hwdev = new data.homework.Device(type, uuid);
        if (!hwdev.name)
            hwdev.name = "Binary Scene Switch " + (++Switch.cnt);
        for (var k in this._values) {
            let v = this._values[k];
            let hwval = new data.homework.Device.Value("value", { off: false, on: true });
            hwval._valueUpdated = (val) => {
                try {
                    if (typeof val === "boolean") {
                        this._pending = { value: val };
                        data.zwave.setValue(v.node_id, v.class_id, v.instance, v.index, val);
                    } else if (typeof val === "number") {
                        this._pending = { value: (val != 0) };
                        data.zwave.setValue(v.node_id, v.class_id, v.instance, v.index, (val != 0));
                    } else {
                        data.homework.Console.error("unknown value type", typeof val);
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
    },
    updateHomeworkDevice: function() {
        // create outstanding values
        for (var k in this._values) {
            if (k in this._hwvalues)
                continue;
            let v = this._values[k];
            let hwval = new data.homework.Device.Value("value", { off: false, on: true });
            hwval._valueUpdated = (val) => {
                data.homework.Console.log("1 GOT VALUE", val);
                try {
                    if (typeof val === "boolean") {
                        this._pending = { value: val };
                        data.zwave.setValue(v.node_id, v.class_id, v.instance, v.index, val);
                    } else if (typeof val === "number") {
                        this._pending = { value: (val != 0) };
                        data.zwave.setValue(v.node_id, v.class_id, v.instance, v.index, (val != 0));
                    } else {
                        data.homework.Console.error("unknown value type", typeof val);
                    }
                } catch (e) {
                    data.homework.Console.error("error updating value", e);
                }
            };
            hwval.update(v.value);
            this._hwvalues[k] = hwval;
            this._hwdevice.addValue(hwval);
        }
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
