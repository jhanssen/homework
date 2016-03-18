/*global module*/

"use strict";

const data = {
    homework: undefined,
    zwave: undefined
};

function Sensor(nodeid, nodeinfo)
{
    this._initValues(this);
    this.nodeid = nodeid;
}

Sensor.cnt = 0;

Sensor.prototype = {
    _acceptValue: function(value) {
        // sensor readings
        if (value.class_id == 49 && (value.type == "byte" || value.type == "decimal") && value.genre == "user" && value.read_only)
            return true;
        // battery
        if (value.class_id == 128 && value.genre == "user")
            return true;
        // alarm
        if (value.class_id == 113 && value.genre == "user" && value.index == 10)
            return true;
        return false;
    },
    _changeValue: function(value) {
        // find the homework value
        if (value.value_id in this._hwvalues) {
            var hwval = this._hwvalues[value.value_id];
            switch (value.class_id) {
            case 49:
            case 128:
                hwval.update(value.value);
                break;
            case 113:
                hwval.update(value.value > 0);
                break;
            }
        }
    },
    _removeValue: function(value) {
    },
    _createValue(v) {
        var hwval;
        switch (v.class_id) {
        case 49:
        case 128:
            hwval = new data.homework.Device.Value(v.label);
            hwval._valueType = "number";
            hwval.update(v.value);
            break;
        case 113:
            hwval = new data.homework.Device.Value("Motion");
            hwval._valueType = "boolean";
            hwval.update(v.value > 0);
            break;
        }
        return hwval;
    },
    createHomeworkDevice: function(type, uuid) {
        var hwdev = new data.homework.Device(data.homework.Type.Sensor, uuid);
        if (!hwdev.name)
            hwdev.name = "MultiSensor " + (++Sensor.cnt);
        for (var k in this._values) {
            let hwval = this._createValue(this._values[k]);
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
            let hwval = this._createValue(this._values[k]);
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
            if (nodeinfo.manufacturerid == "0x0086" && nodeinfo.producttype == "0x0102" && nodeinfo.productid == "0x0064") {
            // if (nodeinfo.type == "Home Security Sensor") {
                return new Sensor(nodeid, nodeinfo);
            }
            return undefined;
        };
        devices.registerDevice(ctor, Sensor.prototype);
    }
};
