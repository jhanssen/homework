/*global require,process*/
require("sugar");

const Device = require("./device.js");
const Console = require("./console.js");
const WebSocket = require("./websocket.js");

const homework = {
    _events: Object.create(null),
    _actions: Object.create(null),
    _devices: [],
    _rules: [],

    registerEvent: function(name, ctor, completion) {
        if (name in this._events)
            return false;
        this._events[name] = { ctor: ctor, completion: completion };
        return true;
    },
    registerAction: function(name, ctor, completion) {
        if (name in this._actions)
            return false;
        this._actions[name] = { ctor: ctor, completion: completion };
        return true;
    },

    addDevice: function(device) {
        this._devices.push(device);
    },
    removeDevice: function(device) {
        this._devices.remove(function(el) { return Object.is(device, el); });
    },

    addRule: function(rule) {
        this._rules.push(rule);
    },
    removeRule: function(rule) {
        this._rules.remove(function(el) { return Object.is(rule, el); });
    },

    get events() {
        return this._events;
    },
    get actions() {
        return this._actions;
    },
    get devices() {
        return this._devices;
    },
    get rules() {
        return this._rules;
    },

    utils: require("./utils.js")
};

Device.init(homework);

Console.init(homework);
Console.on("shutdown", function() {
    process.exit();
});

WebSocket.init(homework);

// fake device
var hey = new Device("hey");
var heyval = new Device.Value("mode", {"on": 1, "off": 2});
setInterval(function() {
    if (heyval.value === "on") {
        heyval.update(2);
    } else {
        heyval.update(1);
    }
}, 1000);
hey.addValue(heyval);

homework.addDevice(hey);
