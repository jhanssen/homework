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
    }
};

Device.init();

Console.init();
Console.on("shutdown", function() {
    process.exit();
});

WebSocket.init();
