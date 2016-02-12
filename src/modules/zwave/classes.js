/*global module,setInterval,clearInterval,require*/

"use strict";

var data = undefined;

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

const devices = {
    _devices: [],
    _homework: undefined,
    _zwave: undefined,

    get homework() { return this._homework; },
    get zwave() { return this._zwave; },

    registerDevice: function(creator, proto) {
        if (proto)
            valueify(proto);
        this._devices.push(creator);
    },
    create: function(nodeid, nodeinfo, values) {
        for (var i = 0; i < this._devices.length; ++i) {
            var dev = this._devices[i](nodeid, nodeinfo);
            if (dev) {
                for (var j in values) {
                    dev.addValue(values[j]);
                }

                var uuid;
                if (typeof data === "object" && dev.nodeid in data)
                    uuid = data[dev.nodeid];

                dev.createHomeworkDevice(uuid);
                return dev;
            }
        }
        return undefined;
    }
};


const Classes = {
    init: function(hw, zw, cfg, dt) {
        data = dt;

        devices._homework = hw;
        devices._zwave = zw;

        require("./dimmer.js").init(devices);
        require("./switch.js").init(devices);
        require("./thermostat.js").init(devices);
    },
    createDevice: function(nodeid, nodeinfo, values) {
        return devices.create(nodeid, nodeinfo, values);
    }
};

module.exports = Classes;
