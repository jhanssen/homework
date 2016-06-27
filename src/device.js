/*global module,require,setTimeout*/

"use strict";

const utils = require("./utils.js");
const uuid = require("node-uuid");
const devices = [];

const data = {
    homework: undefined,
    data: undefined
};

function stringAsType(a)
{
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

function Device(t, opts)
{
    this._name = undefined;
    this._standards = undefined;
    this._uuid = undefined;
    this._type = t;
    this._values = Object.create(null);
    if (typeof opts === "object") {
        if ("uuid" in opts) {
            let u = opts.uuid;
            this._uuid = u;
            if (typeof data.data === "object" && typeof data.data[u] === "object") {
                this._name = data.data[u].name;
                this._groups = data.data[u].groups;
                this._floor = data.data[u].floor;
                this._room = data.data[u].room;
                if (typeof data.data[u].type === "string") {
                    this._type = data.data[u].type;
                }
            }
        }
        if ("standards" in opts) {
            this._standards = opts.standards;
        }
    } else if (opts !== undefined) {
        throw new Error(`Invalid option object for device: ${t}`);
    }
    if (this._uuid === undefined) {
        this._uuid = uuid.v1();
    }
    if (this._groups === undefined)
        this._groups = [];

    if (typeof this._type !== "string")
        this._type = "Unknown";
}

Device.prototype = {
    _name: undefined,
    _values: undefined,
    _type: undefined,
    _groups: undefined,
    _floor: undefined,
    _room: undefined,
    _standards: undefined,

    standardGet: function(name) {
        if (this._standards && name in this._standards && "get" in this._standards[name]) {
            return this._standards[name].get(this);
        }
        if (name in this._values) {
            return this._values[name].raw;
        }
        throw new Error(`standard ${name} not found in device ${this.fullName} of type ${this.type}`);
    },
    standardMeta: function(name) {
        if (this._standards && name in this._standards && "meta" in this._standards[name]) {
            return this._standards[name].meta();
        }
        if (name in this._values) {
            return this._values[name].meta;
        }
        throw new Error(`standard ${name} not found in device ${this.fullName} of type ${this.type}`);
    },
    standardSet: function(name, value) {
        if (this._standards && name in this._standards && "set" in this._standards[name]) {
            this._standards[name].set(this, value);
            return;
        }
        if (name in this._values) {
            this._values[name].value = value;
            return;
        }
        throw new Error(`standard ${name} not found in device ${this.fullName} of type ${this.type}`);
    },

    set name(name) {
        this._name = name;
    },
    get name() {
        return this._name;
    },
    set floor(floor) {
        this._floor = floor;
    },
    get floor() {
        return this._floor;
    },
    set room(room) {
        this._room = room;
    },
    get room() {
        return this._room;
    },
    get fullName() {
        var n = this._name;
        if (this._room !== undefined)
            n = this._room + " " + n;
        if (this._floor !== undefined)
            n = this._floor + " " + n;
        return n;
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
    set type(t) {
        this._type = t;
    },
    get virtual() {
        return this._type == "Virtual";
    },
    get groups() {
        return this._groups;
    },
    set groups(g) {
        this._groups = g;
    },

    addGroup: function(grp) {
        if (this._groups.indexOf(grp) !== -1)
            return;
        this._groups.push(grp);
    },
    removeGroup: function(grp) {
        this._groups.remove((g) => { return g == grp; });
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
        if ("valueType" in data)
            this._valueType = data.valueType;
        if ("value" in data) {
            setTimeout(() => {
                this.update(data.value);
            }, 0);
        }
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
    get meta() {
        return {
            units: this.units,
            values: this.values,
            range: this.range,
            readOnly: this.readOnly,
            type: this.type
        };
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

        if (typeof this._valueUpdated === "function") {
            this._valueUpdated(v);
        } else {
            if (this._device && this._device.virtual)
                this.update(v);
            else
                this._value = v;
        }
    },

    get data() {
        var d = {
            values: this._values,
            range: this._range,
            units: this._units,
            readOnly: this._readOnly,
            valueType: this.type
        };
        if (this._device && this._device.virtual) {
            d.value = this._value;
        }
        return d;
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
        data.homework.Console.log("device value", this.name, "changed to", this._value, "for device", (this.device ? this.device.fullName : "(not set)"));
        data.homework.valueUpdated(this);
        this._emit("changed", this.value);
    },

    _valueType: "array"
};

utils.onify(Device.Value.prototype);

Device.Schema = function(schema)
{
    this._schema = schema;
};

Device.Schema.prototype = {
    _schema: undefined,
    _verifyValue: function(s, v) {
        console.log("verifying", s, v);

        switch (typeof s) {
        case "undefined":
            return true;
        case "string":
            return s == v.toString();
        case "boolean":
        case "number":
            return s === v;
        case "object":
            if (s instanceof RegExp) {
                console.log("balkl", v.toString());
                return s.test(v.toString());
            }
            if (typeof v == "object") {
                for (var k in s) {
                    if (!(k in v)) {
                        return false;
                    }
                    if (!this._verifyValue(s[k], v[k]))
                        return false;
                }
                return true;
            }
        }
        return false;
    },

    get schema() { return this._schema; },

    verify: function(dev) {
        // verify device values
        for (var k in this.schema) {
            // check value
            var s = this.schema[k];
            var v = dev.standardMeta(k);
            if (!this._verifyValue(s, v)) {
                throw new Error(`Property ${v} not verified in ${dev.fullName} of type ${dev.type}`);
            }
        }
        return true;
    },

    equals: function(schema) {
        var k;
        for (k in this.schema) {
            if (!(k in schema.schema))
                return false;
            if (JSON.stringify(this.schema[k]) != JSON.stringify(schema.schema[k]))
                return false;
        }
        for (k in schema.schema) {
            if (!(k in this.schema))
                return false;
        }
        return true;
    }
};

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
            if (devs[i].fullName === args[0])
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
            return ["Device", this._device.fullName, this._value.name, "is", this._equals];
        else
            return ["Device", this._device.fullName, this._value.name, "range", this._equals[0], this._equals[1]];
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
            if (devs[i].fullName === arguments[0])
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
        return ["Device", this._device.fullName, this._value.name, this._equals];
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
            ret.values.push(devs[i].fullName);
        }
    } else {
        // find the device in question
        var dev;
        for (i = 0; i < devs.length; ++i) {
            if (devs[i].fullName === arguments[0])
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
            ret.values.push(devs[i].fullName);
        }
    } else {
        // find the device in question
        var dev;
        for (i = 0; i < devs.length; ++i) {
            if (devs[i].fullName === arguments[0])
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

    // recreate virtual devices
    for (var uuid in d) {
        var dev = d[uuid];
        if (dev.type == "Virtual") {
            var nd = new Device("Virtual", { uuid: uuid });
            nd.name = dev.name;
            if ("room" in dev)
                nd.room = dev.room;
            if ("floor" in dev)
                nd.floor = dev.floor;
            if ("groups" in dev)
                nd.groups = dev.groups;
            for (var vname in dev.values) {
                nd.addValue(new Device.Value(vname, dev.values[vname]));
            }

            homework.addDevice(nd);
        }
    }
};

module.exports = { Device: Device, Type: Device.Type };
