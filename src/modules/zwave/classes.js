/*global module*/

"use strict";

var homework = undefined;
var zwave = undefined;
var cnt = 0;

const Devices = {
    "Multilevel Scene Switch": function(nodeid, nodeinfo) {
        this._initValues(this);
    }
};

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
            hwval.update(value.value);
        }
    },
    _removeValue: function(value) {
    },
    createHomeworkDevice: function() {
        var hwdev = new homework.Device("Multilevel Scene Switch " + (++cnt));
        for (var k in this._values) {
            let v = this._values[k];
            let hwval = new homework.Device.Value("level", { off: 0, on: 100 }, [0, 100]);
            hwval._valueUpdated = function() {
                try {
                    zwave.setValue(v.node_id, v.class_id, v.instance, v.index, hwval.raw);
                } catch (e) {
                    homework.Console.error("error updating value", e);
                }
            };
            hwval._fittefaen = v.node_id;
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

const Classes = {
    init: function(hw, zw, cfg) {
        homework = hw;
        zwave = zw;
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
