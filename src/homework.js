/*global require,process*/
require("sugar");

var Device = require("./device.js");
var Console = require("./console.js");
var WebSocket = require("./websocket.js");

var homework = {
    _events: Object.create(null),
    _actions: Object.create(null),
    _devices: [],

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
        this._devices.
};

Device.init();
Console.init();
WebSocket.init();
