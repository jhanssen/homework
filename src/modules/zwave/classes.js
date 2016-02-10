/*global module,setInterval,clearInterval*/

"use strict";

var homework = undefined;
var zwave = undefined;
var data = undefined;

const Devices = {
    "Multilevel Scene Switch": function(nodeid, nodeinfo) {
        this._initValues(this);
        this._pending = undefined;
        this.nodeid = nodeid;
    },
    "Binary Scene Switch": function(nodeid, nodeinfo) {
        this._initValues(this);
        this.nodeid = nodeid;
    }
};

Devices["Multilevel Scene Switch"].cnt = 0;
Devices["Multilevel Scene Switch"].prototype = {
    _acceptValue: function(value) {
        if (value.class_id == 38 && value.type == "byte" && value.genre == "user"
            && !value.read_only && !value.write_only)
            return true;
        return false;
    },
    _changeValue: function(value) {
        // find the homework value
        if (value.value_id in this._hwvalues) {
            var hwval = this._hwvalues[value.value_id];
            // some dimmers like to report intermediate values while dimming so if
            // that happens we'll poll for a bit to see if we get the final value later
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
                            zwave.refreshValue(k[0], k[1], k[2], k[3]);
                        }
                    }, 500);
                    zwave.refreshValue(value.node_id, value.class_id, value.instance, value.index);
                }
            }
        }
    },
    _removeValue: function(value) {
    },
    createHomeworkDevice: function() {
        var uuid;
        if (this.nodeid in data)
            uuid = data[this.nodeid];
        var hwdev = new homework.Device(uuid);
        hwdev.name = "Multilevel Scene Switch " + (++Devices["Multilevel Scene Switch"].cnt);
        for (var k in this._values) {
            let v = this._values[k];
            let hwval = new homework.Device.Value("level", { off: 0, on: 100 }, [0, 100]);
            hwval._zwave = v;
            hwval._valueUpdated = (val) => {
                try {
                    this._pending = { value: val };
                    zwave.setValue(v.node_id, v.class_id, v.instance, v.index, val);
                } catch (e) {
                    homework.Console.error("error updating value", e);
                }
            };
            hwval.update(v.value);
            this._hwvalues[k] = hwval;
            hwdev.addValue(hwval);
        }

        this._hwdevice = hwdev;
        homework.addDevice(hwdev);
    }
};

Devices["Binary Scene Switch"].cnt = 0;
Devices["Binary Scene Switch"].prototype = {
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
    createHomeworkDevice: function() {
        var uuid;
        if (this.nodeid in data)
            uuid = data[this.nodeid];
        var hwdev = new homework.Device(uuid);
        hwdev.name = "Binary Scene Switch " + (++Devices["Binary Scene Switch"].cnt);
        for (var k in this._values) {
            let v = this._values[k];
            let hwval = new homework.Device.Value("value", { off: false, on: true });
            hwval._valueUpdated = function(val) {
                try {
                    if (typeof v === "boolean") {
                        zwave.setValue(v.node_id, v.class_id, v.instance, v.index, val);
                    } else if (typeof v === "number") {
                        zwave.setValue(v.node_id, v.class_id, v.instance, v.index, (val != 0));
                    }
                } catch (e) {
                    homework.Console.error("error updating value", e);
                }
            };
            hwval.update(v.value);
            this._hwvalues[k] = hwval;
            hwdev.addValue(hwval);
        }

        this._hwdevice = hwdev;
        homework.addDevice(hwdev);
    }
};

function valueify(obj) {
    obj.changeValue = function(value) {
        if (value.value_id in this._values) {
            this._values[value.value_id] = value;
            this._changeValue(value);
            //this._emit("valueChanged", value);
        }
    };
    obj.addValue = function(value) {
        if (this._acceptValue(value)) {
            this._values[value.value_id] = value;
        }
    };
    obj.removeValue = function(key) {
        if (key in this._values) {
            var v = this._values[key];
            this._removeValue(v);
            delete this._values[key];
            //this._emit("valueRemoved", v);
        }
    };
    obj.homework = function() {
        return this._hwdevice;
    };
    obj._initValues = function() {
        this._hwdevice = undefined;
        this._values = Object.create(null);
        this._hwvalues = Object.create(null);
    };
};

valueify(Devices["Multilevel Scene Switch"].prototype);
valueify(Devices["Binary Scene Switch"].prototype);

const Classes = {
    init: function(hw, zw, cfg, dt) {
        homework = hw;
        zwave = zw;
        data = dt;
    },
    createDevice: function(nodeid, nodeinfo, values) {
        if (nodeinfo.type in Devices) {
            var dev = new Devices[nodeinfo.type](nodeid, nodeinfo);
            for (var i in values) {
                dev.addValue(values[i]);
            }
            dev.createHomeworkDevice();
            return dev;
        }
        return undefined;
    }
};

module.exports = Classes;
