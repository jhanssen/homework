/*global module,require*/
const utils = require("./utils.js");
const uuid = require("node-uuid");
const devices = [];

const data = {
    homework: undefined,
    data: undefined
};

function stringAsType(a) {
    if (typeof a === "string") {
        // int?
        if (parseInt(a) == a)
            return parseInt(a);
        if (parseFloat(a) == a)
            return parseFloat(a);
        switch (a) {
        case "true":
            return true;
        case "false":
            return false;
        }
    }
    return a;
}

function Device(t, u)
{
    if (typeof t !== "number") {
        console.trace("invalid type", t);
        throw "Device type needs to be a number";
    }
    this._name = undefined;
    this._type = t;
    this._values = Object.create(null);
    if (u) {
        this._uuid = u;
        if (typeof data.data === "object" && typeof data.data[u] === "object") {
            this._name = data.data[u].name;
        }
    } else {
        this._uuid = uuid.v1();
    }
}

Device.Type = {
    Dimmer: 0,
    Light: 1,
    Fan: 2,
    Thermostat: 3,
    Clapper: 4,
    RGBWLed: 5,
    Sensor: 6,
    Unknown: 99
};

Device.prototype = {
    _name: undefined,
    _values: undefined,
    _type: undefined,

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
    get type() {
        return this._type;
    },

    addValue: function(v, keep) {
        if (keep && v.name in this._values) {
            if (!(this._values[v.name] instanceof Array)) {
                this._values[v.name] = [this._values[v.name]];
            }
            this._values[v.name].push(v);
        } else {
            this._values[v.name] = v;
        }
        v._device = this;
    },
    removeValue: function(name) {
        delete this._values[name];
    }
};

Device.Value = function(name, data)
{
    this._name = name;
    if (data instanceof Object) {
        this._values = data.values;
        this._range = data.range;
        this._handle = data.handle;
        this._units = data.units;
        this._readOnly = data.readOnly || false;
    } else {
        this._readOnly = false;
    }
    this._device = undefined;
    this._initOns();
};

Device.Value.prototype = {
    _name: undefined,
    _value: undefined,
    _values: undefined,
    _range: undefined,
    _units: undefined,
    _valueUpdated: undefined,
    _readOnly: undefined,
    _handle: undefined,
    _device: undefined,

    get name() {
        return this._name;
    },
    set name(n) {
        this._name = n;
    },
    get units() {
        return this._units;
    },
    set units(u) {
        this._units = u;
    },
    get values() {
        return this._values;
    },
    get range() {
        return this._range;
    },
    get handle() {
        return this._handle;
    },
    get device() {
        return this._device;
    },
    get readOnly() {
        return this._readOnly;
    },
    get type() {
        return (typeof this._valueType === "function") ? this._valueType() : this._valueType;
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

    rawValue: function(v) {
        if (typeof this._values === "object" && v in this._values) {
            return this._values[v];
        }
        return v;
    },

    trigger: function() {
        this.update(true);
        this._value = false;
    },

    update: function(v) {
        if (this._value == v)
            return;
        this._value = v;
        data.homework.Console.log("device value", this.name, "changed to", this._value, "for device", (this.device ? this.device.name : "(not set)"));
        data.homework.valueUpdated(this);
        this._emit("changed", this.value);
    },

    _valueType: "array"
};

utils.onify(Device.Value.prototype);

Device.Event = function()
{
    var args = [].slice.apply(arguments);
    //console.log("deviceevent ctor", arguments);
    if (args.length < 4) {
        throw "Device event needs at least four arguments";
    }
    if (args[2] === "range") {
        if (args.length < 5) {
            if (args.length == 4 && args[3] instanceof Array && args[3].length === 2) {
                args.push(args[3][1]);
                args[3] = args[3][0];
            } else {
                throw "Device range event needs at least five arguments";
            }
        }
    } else if (args[2] !== "is") {
        throw "Device event type needs to be either 'is' or 'range'";
    }

    this._initOns();

    // find the device
    const devs = data.homework.devices;
    var dev, i;
    for (i = 0; i < devs.length; ++i) {
        if (devs[i].uuid === args[0])
            dev = devs[i];
    }
    if (!dev) {
        for (i = 0; i < devs.length; ++i) {
            if (devs[i].name === args[0])
                dev = devs[i];
        }
    }
    if (dev == undefined) {
        throw "No device named " + args[0];
    }
    this._device = dev;
    this._eventType = undefined;

    // find the device value
    const valname = args[1];
    if (valname in dev.values) {
        this._value = dev.values[valname];
        if (args[2] === "is") {
            this._equals = stringAsType(args[3]);
            this._eventType = "is";
        } else {
            this._equals = [stringAsType(args[3]), stringAsType(args[4])];
            this._eventType = "range";
        }

        this._value.on("changed", (v) => {
            if (this._eventType === "is" && stringAsType(v) == this._equals) {
                this._emit("triggered", this);
            } else if (this._eventType === "range") {
                const vt = stringAsType(this._value.rawValue(v));
                if (vt >= this._value.rawValue(this._equals[0]) && vt <= this._value.rawValue(this._equals[1])) {
                    this._emit("triggered", this);
                }
            }
        });
    } else {
        throw "No device value named " + args[1] + " for device " + args[0];
    }
};

Device.Event.prototype = {
    _device: undefined,
    _value: undefined,
    _equals: undefined,
    _eventType: undefined,

    get device() {
        return this._device;
    },
    get value() {
        return this._value;
    },
    get equals() {
        return this._equals;
    },
    get eventType() {
        return this._eventType;
    },

    check: function() {
        if (this._eventType === "is" && stringAsType(this._value.value) == this._equals) {
            return true;
        } else if (this._eventType === "range") {
            const vt = stringAsType(this._value.raw);
            if (vt >= this._value.rawValue(this._equals[0]) && vt <= this._value.rawValue(this._equals[1])) {
                return true;
            }
        }
        return false;
    },
    serialize: function() {
        return { type: "DeviceEvent", deviceUuid: this._device.uuid, valueName: this._value.name, eventType: this._eventType, value: this._equals };
    },
    format: function() {
        if (this._eventType === "is")
            return ["Device", this._device.name, this._value.name, "is", this._equals];
        else
            return ["Device", this._device.name, this._value.name, "range", this._equals[0], this._equals[1]];
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
    var dev, i;
    for (i = 0; i < devs.length; ++i) {
        if (devs[i].uuid === arguments[0])
            dev = devs[i];
    }
    if (!dev) {
        for (i = 0; i < devs.length; ++i) {
            if (devs[i].name === arguments[0])
                dev = devs[i];
        }
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
        this._equals = stringAsType(arguments[2]);
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

    trigger: function(pri) {
        if (pri === data.homework.rulePriorities.Medium)
            this._value.value = this._equals;
    },
    serialize: function() {
        return { type: "DeviceAction", deviceUuid: this._device.uuid, valueName: this._value.name, value: this._equals };
    },
    format: function() {
        return ["Device", this._device.name, this._value.name, this._equals];
    }
};

utils.onify(Device.Action.prototype);

function eventCompleter()
{
    var ret = { type: undefined, values: [] }, i;
    const devs = data.homework.devices;
    if (arguments.length === 0) {
        ret.type = "array";
        for (i = 0; i < devs.length; ++i) {
            ret.values.push(devs[i].name);
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
                return { type: "array", values: Object.keys(dev.values) };
            } else if (args.length === 2) {
                return { type: "array", values: ["is", "range"] };
            } else if (args.length === 3 || (args.length === 4 && args[2] === "range")) {
                // find the value
                var valname = args[1];
                if (valname in dev.values) {
                    var val = dev.values[valname];
                    return { type: val.type, values: val.values ? Object.keys(val.values) : [] };
                }
            }
        }
    }
    return ret;
}

function actionCompleter()
{
    var ret = { type: undefined, values: [] }, i;
    const devs = data.homework.devices;
    if (arguments.length === 0) {
        ret.type = "array";
        for (i = 0; i < devs.length; ++i) {
            ret.values.push(devs[i].name);
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
                return { type: "array", values: Object.keys(dev.values) };
            } else if (args.length === 2) {
                // find the value
                var valname = args[1];
                if (valname in dev.values) {
                    var val = dev.values[valname];
                    return { type: val.type, values: val.values ? Object.keys(val.values) : [] };
                }
            }
        }
    }
    return ret;
}

function eventDeserializer(e)
{
    if (!(typeof e === "object"))
        return null;

    if (e.type !== "DeviceEvent")
        return null;

    try {
        var event = new Device.Event(e.deviceUuid, e.valueName, e.eventType, e.value);
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
        var action = new Device.Action(a.deviceUuid, a.valueName, a.value);
    } catch (e) {
        return null;
    }
    return action;
}

Device.init = function(homework, d)
{
    data.homework = homework;
    data.data = d;
    homework.registerEvent("Device", Device.Event, eventCompleter, eventDeserializer);
    homework.registerAction("Device", Device.Action, actionCompleter, actionDeserializer);
};

module.exports = { Device: Device, Type: Device.Type };
