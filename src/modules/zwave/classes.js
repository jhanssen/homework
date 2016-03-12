/*global module,setInterval,clearInterval,setTimeout,clearTimeout,require*/

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
            if (this._hwdevice) {
                this._scheduleUpdateValues();
            }
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
        this._updateTimer = undefined;
    };
    obj._scheduleUpdateValues = function() {
        if (!this.updateHomeworkDevice)
            return;
        if (this._updateTimer)
            clearTimeout(this._updateTimer);
        this._updateTimer = setTimeout(() => {
            this._updateTimer = undefined;
            this.updateHomeworkDevice(devices);
        }, 1000);
    };
};

const devices = {
    _devices: [],
    _homework: undefined,
    _zwave: undefined,

    get homework() { return this._homework; },
    get zwave() { return this._zwave; },

    init: function(hw, zw) {
        devices._homework = hw;
        devices._zwave = zw;
    },
    registerDevice: function(creator, proto) {
        if (proto)
            valueify(proto);
        this._devices.push(creator);
    },
    fixupValues: function(device) {
        if (typeof device.values !== "object" || device.values === null)
            return;
        var clock = {
            values: Object.create(null),

            add: function(k, v) {
                this.values[k] = v;
            },
            fixup: function(device, homework) {
                const keys = Object.keys(this.values);
                // console.log("fixup", keys);
                if (keys.length == 3 || keys.length == 4) {
                    var day, hour, minute, second;
                    for (let k in this.values) {
                        let hwval = this.values[k];
                        let handle = this.values[k].handle;
                        // console.log("key", k);
                        // console.log("handle", handle);
                        switch (handle.index) {
                        case 0:
                            day = { key: k, val: handle, hw: hwval };
                            break;
                        case 1:
                            hour = { key: k, val: handle, hw: hwval };
                            break;
                        case 2:
                            minute = { key: k, val: handle, hw: hwval };
                            break;
                        case 3:
                            second = { key: k, val: handle, hw: hwval };
                            break;
                        }
                    }
                    // console.log("here 1", day, hour, minute, second);
                    if (day && hour && minute) {
                        var valueData = {
                            day: day.val,
                            hour: hour.val,
                            minute: minute.val,
                            second: second ? second.val : undefined,

                            toString: function() {
                                return this.day.value + " " + this.hour.value + ":" + this.minute.value + (this.second ? ":" + this.second.value : "");
                            }
                        };
                        device.removeValue(day.key);
                        device.removeValue(hour.key);
                        device.removeValue(minute.key);
                        if (second) {
                            device.removeValue(second.key);
                        }
                        const val = new homework.Device.Value("clock");

                        day.hw.on("changed", function() {
                            val.value = valueData.toString();
                        });
                        hour.hw.on("changed", function() {
                            val.value = valueData.toString();
                        });
                        minute.hw.on("changed", function() {
                            val.value = valueData.toString();
                        });
                        if (second) {
                            second.hw.on("changed", function() {
                                val.value = valueData.toString();
                            });
                        }
                        val.value = valueData.toString();

                        val._valueUpdated = function(v) {
                            var rxs = [
                                { rx: /^([0-9]+):([0-9]+)$/, keys: ["hour", "minute"] },
                                { rx: /^([0-9]+):([0-9]+):([0-9]+)$/, keys: ["hour", "minute", "second"] },
                                { rx: /^([A-Za-z]+)$/, keys: ["day"] }
                            ];
                            var update = function(obj) {
                                if ("day" in obj && day)
                                    day.hw.value = obj.day;
                                if ("hour" in obj && hour)
                                    hour.hw.value = obj.hour;
                                if ("minute" in obj && minute)
                                    minute.hw.value = obj.minute;
                                if ("second" in obj && second)
                                    second.hw.value = obj.second;
                            };

                            switch (typeof v) {
                            case "string":
                                // console.log("value is", v);
                                for (var i = 0; i < rxs.length; ++i) {
                                    var keys = rxs[i].keys;
                                    var res = rxs[i].rx.exec(v);
                                    // console.log("trying", rxs[i].rx);
                                    // console.log(res);
                                    // if (res instanceof Array) {
                                    //     console.log(res.length, keys.length);
                                    // } else {
                                    //     console.log("not array", typeof res);
                                    // }
                                    if (res instanceof Array && res.length === keys.length + 1) {
                                        var obj = {};
                                        for (var j = 0; j < keys.length; ++j) {
                                            obj[keys[j]] = res[j + 1];
                                        }
                                        // console.log("updating", obj);
                                        update(obj);
                                        break;
                                    }
                                }
                                break;
                            default:
                                break;
                            }
                        };
                        device.addValue(val);
                    }
                }
            }
        };
        var vals = device.values;
        for (var value in vals) {
            var val = vals[value];
            if (val instanceof Array) {
                // rename and reinsert
                device.removeValue(value);
                for (var v = 0; v < val.length; ++v) {
                    if (!val[v].handle)
                        continue;
                    val[v].name = value + "-" + val[v].handle.instance + "-" + val[v].handle.index;
                    device.addValue(val[v]);
                }
                continue;
            }
            if (!val.handle)
                continue;
            if (val.handle.class_id == 129) {
                clock.add(value, val);
            }
        }
        clock.fixup(device, this.homework);
    },
    create: function(type, nodeid, nodeinfo, values) {
        for (var i = 0; i < this._devices.length; ++i) {
            var dev = this._devices[i](nodeid, nodeinfo);
            if (dev) {
                for (var j in values) {
                    dev.addValue(values[j]);
                }

                // var uuid;
                // if (typeof data === "object" && dev.nodeid in data)
                //     uuid = data[dev.nodeid];

                dev.createHomeworkDevice(type, "zwave:" + dev.nodeid, this);
                return dev;
            }
        }
        return undefined;
    }
};


const Classes = {
    init: function(hw, zw, cfg, dt) {
        data = dt;

        devices.init(hw, zw);

        require("./dimmer.js").init(devices);
        require("./switch.js").init(devices);
        require("./multisensor6.js").init(devices);
        require("./generic.js").init(devices);
    },
    deviceName: function(nodeid) { return "zwave:" + nodeid; },
    createDevice: function(type, nodeid, nodeinfo, values) {
        return devices.create(type, nodeid, nodeinfo, values);
    }
};

module.exports = Classes;
