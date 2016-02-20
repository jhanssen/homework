/*global require,module*/

var ozwshared = undefined;
var ozw = undefined;
var homework = undefined;
var types = undefined;
var Console = undefined;
const values = Object.create(null);
const devices = Object.create(null);
const classes = require("./classes.js");

function toDeviceType(t)
{
    if (typeof t === "string") {
        switch (t) {
        case "dimmer":
            return homework.Type.Dimmer;
        case "light":
            return homework.Type.Light;
        case "fan":
            return homework.Type.Fan;
        }
    }
    Console.log("Unknown device type", t);
    return homework.Type.Unknown;
};

const zwave = {
    _pendingData: undefined,
    _port: undefined,
    _ready: undefined,

    get name() { return "zwave"; },
    get ready() { return this._ready; },

    init: function(cfg, data, hw) {
        this._pendingData = data;
        if (typeof cfg === "object" && cfg.port) {
            hw.utils.onify(this);
            this._initOns();
            this._ready = false;

            homework = hw;
            Console = hw.Console;

            types = cfg.types || Object.create(null);

            Console.registerCommand("default", "zwave", this._console);

            ozwshared = require("openzwave-shared");
            ozw = new ozwshared({ ConsoleOutput: false });

            classes.init(hw, ozw, cfg, data);

            ozw.on('driver ready', (homeid) => {
            });
            ozw.on('driver failed', () => {
            });
            ozw.on('scan complete', () => {
                Console.log("scan complete");
                homework.loadRules();
                if (!this._ready) {
                    this._ready = true;
                    this._emit("ready");
                }
            });
            ozw.on('node added', (nodeid) => {
                Console.log("node added", nodeid);
            });
            ozw.on('node naming', (nodeid, nodeinfo) => {
                Console.log("node naming", nodeid, nodeinfo);
            });
            ozw.on('node available', (nodeid, nodeinfo) => {
                Console.log("node available", nodeid, nodeinfo);
                const name = classes.deviceName(nodeid);
                const dev = classes.createDevice(toDeviceType(types[name]), nodeid, nodeinfo, values[nodeid]);
                if (dev) {
                    devices[nodeid] = dev;
                    delete values[nodeid];
                } else {
                    Console.log("couldn't create device", nodeinfo);
                }
            });
            ozw.on('node ready', (nodeid, nodeinfo) => {
                Console.log("node ready", nodeid, nodeinfo);
            });
            ozw.on('node event', (nodeid, event, valueId) => {
                Console.log("node event", nodeid, event, valueId);
            });
            ozw.on('node removed', (nodeid) => {
                // remove from pendingData here
            });
            ozw.on('node reset', (nodeid, event, notif) => {
            });
            ozw.on('polling enabled', (nodeid) => {
            });
            ozw.on('polling enabled', (nodeid) => {
            });
            ozw.on('scene event', (nodeid, sceneid) => {
            });
            ozw.on('value added', (nodeid, commandclass, valueId) => {
                Console.log("value added for", nodeid, commandclass, valueId);
                if (nodeid in devices) {
                    devices[nodeid].addValue(valueId);
                } else {
                    if (!(nodeid in values)) {
                        values[nodeid] = Object.create(null);
                    }
                    values[nodeid][valueId.value_id] = valueId;
                }
            });
            ozw.on('value changed', (nodeid, commandclass, valueId) => {
                Console.log("value changed for", nodeid, commandclass, valueId);
                if (nodeid in devices) {
                    devices[nodeid].changeValue(valueId);
                } else {
                    if (!(nodeid in values)) {
                        values[nodeid] = Object.create(null);
                    }
                    values[nodeid][valueId.value_id] = valueId;
                }
            });
            ozw.on('value refreshed', (nodeid, commandclass, valueId) => {
                Console.log("value refreshed for", nodeid, commandclass, valueId);
                if (nodeid in devices) {
                    devices[nodeid].changeValue(valueId);
                } else {
                    if (!(nodeid in values)) {
                        values[nodeid] = Object.create(null);
                    }
                    values[nodeid][valueId.value_id] = valueId;
                }
            });
            ozw.on('value removed', (nodeid, commandclass, instance, index) => {
                // silly API
                const key = nodeid + "-" + commandclass + "-" + instance + "-" + index;
                if (nodeid in devices) {
                    devices[nodeid].removeValue(key);
                } else {
                    if (!(nodeid in values)) {
                        values[nodeid] = Object.create(null);
                    }
                    delete values[nodeid][key];
                }
            });
            ozw.on('controller command', (nodeId, ctrlState, ctrlError, helpmsg) => {
            });
            Console.log("initing zwave", cfg.port);
            ozw.connect(cfg.port);
            this._port = cfg.port;

            return true;
        }
        return false;
    },
    shutdown: function(cb) {
        // write node_id to uuid map
        var map = this._pendingData || Object.create(null);
        // for (var k in devices) {
        //     var dev = devices[k];
        //     map[k] = dev.homework().uuid;
        // }
        if (this._port)
            ozw.disconnect(this._port);
        cb(map);
    },

    _console: {
        prompt: "zwave> ",
        completions: ["pair ", "depair", "stop", "home", "back", "heal "],
        apply: function(line) {
            var elems = line.split(' ').filter((e) => { return e.length > 0; });
            switch (elems[0]) {
            case "pair":
                ozw.addNode((elems.length > 1 && elems[1]) ? true : false);
                break;
            case "heal":
                ozw.healNetwork((elems.length > 1 && elems[1]) ? true : false);
                break;
            case "depair":
                ozw.removeNode();
                break;
            case "home":
            case "back":
                Console.home();
                break;
            }
        }
    }
};

module.exports = zwave;
