/*global module,require*/
const utils = require("./utils.js");
const uuid = require("node-uuid");

const data = {
    homework: undefined
};

function Device(u)
{
    this._values = Object.create(null);
    if (u)
        this._uuid = u;
    else
        this._uuid = uuid.v1();
}

Device.prototype = {
    _name: undefined,
    _values: undefined,

    set name(name) {
        this._name = name;
    },
    get name() {
        return this._name;
    },
    get values() {
        return this._values;
    },
    get uuid() {
        return this._uuid;
    },

    addValue: function(v) {
        this._values[v.name] = v;
    },
    removeValue: function(name) {
        delete this._values[name];
    }
};

Device.Value = function(name, values, range)
{
    this._name = name;
    this._values = values;
    this._range = range;
    this._initOns();
};

Device.Value.prototype = {
    _name: undefined,
    _value: undefined,
    _values: undefined,
    _range: undefined,
    _valueUpdated: undefined,

    get name() {
        return this._name;
    },
    get values() {
        return this._values;
    },
    get range() {
        return this._range;
    },
    get value() {
        // see if our value maps to one of our values
        if (typeof this._values === "object") {
            for (var k in this._values) {
                if (this._values[k] === this._value)
                    return k;
            }
        }

        return this._value;
    },
    get raw() {
        return this._value;
    },
    set value(v) {
        // see if this value maps to one of our values
        if (typeof this._values === "object" && v in this._values) {
            v = this._values[v];
        }

        if (typeof this._valueUpdated === "function")
            this._valueUpdated(v);
        else
            this._value = v;
    },

    update: function(v) {
        if (this._value == v)
            return;
        this._value = v;
        data.homework.Console.log("device value changed to", this._value);
        this._emit("changed", this.value);
    }
};

utils.onify(Device.Value.prototype);

Device.Event = function()
{
    //console.log("deviceevent ctor", arguments);
    if (arguments.length < 3) {
        throw "Device event needs at least three arguments";
    }
    this._initOns();

    // find the device
    const devs = data.homework.devices;
    var dev;
    for (var i = 0; i < devs.length; ++i) {
        if (devs[i].name === arguments[0])
            dev = devs[i];
    }
    if (dev == undefined) {
        throw "No device named " + arguments[0];
    }
    this._device = dev;

    // find the device value
    const valname = arguments[1];
    if (valname in dev.values) {
        this._value = dev.values[valname];
        this._equals = arguments[2];

        this._value.on("changed", (v) => {
            if (this._equals == v)
                this._emit("triggered");
        });
    } else {
        throw "No device value named " + arguments[1] + " for device " + arguments[0];
    }
};

Device.Event.prototype = {
    _device: undefined,
    _value: undefined,
    _equals: undefined,

    get device() {
        return this._device;
    },
    get value() {
        return this._value;
    },
    get equals() {
        return this._equals;
    },

    check: function() {
        return this._value.value == this._equals;
    },
    serialize: function() {
        return { type: "DeviceEvent", deviceName: this._device.name, valueName: this._value.name, value: this._equals };
    }
};

utils.onify(Device.Event.prototype);

Device.Action = function()
{
    //console.log("deviceaction ctor", arguments);
    if (arguments.length < 3) {
        throw "Device action needs at least three arguments";
    }

    // find the device
    const devs = data.homework.devices;
    var dev;
    for (var i = 0; i < devs.length; ++i) {
        if (devs[i].name === arguments[0])
            dev = devs[i];
    }
    if (dev == undefined) {
        throw "No device named " + arguments[0];
    }
    this._device = dev;
    this._initOns();

    // find the device value
    var valname = arguments[1];
    if (valname in dev.values) {
        this._value = dev.values[valname];
        this._equals = arguments[2];
    } else {
        throw "No device value named " + arguments[1] + " for device " + arguments[0];
    }
};

Device.Action.prototype = {
    _device: undefined,
    _value: undefined,
    _equals: undefined,

    get device() {
        return this._device;
    },
    get value() {
        return this._value;
    },
    get equals() {
        return this._equals;
    },

    trigger: function() {
        this._value.value = this._equals;
    },
    serialize: function() {
        return { type: "DeviceAction", deviceName: this._device.name, valueName: this._value.name, value: this._equals };
    }
};

utils.onify(Device.Action.prototype);

function eventCompleter()
{
    var ret = [], i;
    const devs = data.homework.devices;
    if (arguments.length === 0) {
        for (i = 0; i < devs.length; ++i) {
            ret.push(devs[i].name);
        }
    } else {
        // find the device in question
        var dev;
        for (i = 0; i < devs.length; ++i) {
            if (devs[i].name === arguments[0])
                dev = devs[i];
        }
        if (dev !== undefined) {
            var args = utils.strip(arguments);
            if (args.length === 1) {
                return Object.keys(dev.values);
            } else if (args.length === 2) {
                // find the value
                var valname = args[1];
                if (valname in dev.values) {
                    var val = dev.values[valname];
                    return val.values ? Object.keys(val.values) : [];
                }
            }
        }
    }
    return ret;
}

var actionCompleter = eventCompleter;

function eventDeserializer(e)
{
    if (!(typeof e === "object"))
        return null;

    if (e.type !== "DeviceEvent")
        return null;

    try {
        var event = new Device.Event(e.deviceName, e.valueName, e.value);
    } catch (e) {
        return null;
    }
    return event;
}

function actionDeserializer(a)
{
    if (!(typeof a === "object"))
        return null;

    if (a.type !== "DeviceAction")
        return null;

    try {
        var action = new Device.Action(a.deviceName, a.valueName, a.value);
    } catch (e) {
        return null;
    }
    return action;
}

Device.init = function(homework)
{
    data.homework = homework;
    homework.registerEvent("Device", Device.Event, eventCompleter, eventDeserializer);
    homework.registerAction("Device", Device.Action, actionCompleter, actionDeserializer);
};

module.exports = Device;
