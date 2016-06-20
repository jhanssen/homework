#!/usr/bin/env node

/*global require,process,homework,setTimeout,module,global*/

"use strict";

const path = require("path");
const fs = require("fs");

function hwVersion()
{
    const fn = module.filename;
    const idx = fn.indexOf("/src/homework.js");
    if (idx == -1) {
        throw new Error(`Couldn't parse module filename ${fn}`);
    }
    var jsonfn = fn.substr(0, idx) + path.sep + "package.json";
    try {
        var json = JSON.parse(fs.readFileSync(jsonfn));
    } catch (e) {
        throw new Error(`Couldn't parse package.json from ${jsonfn}`);
    }
    return json.version;
}

require("sugar");

const Config = require("./config.js");
const Device = require("./device.js");
const Console = require("./console.js");
const WebSocket = require("./websocket.js");
const WebServer = require("./webserver.js");
const Rule = require("./rule.js");
const Modules = require("./modules.js");
const Timer = require("./timer.js");
const Variable = require("./variable.js");
const Scene = require("./scene.js");
const db = require("jsonfile");

global.homework = {
    _events: Object.create(null),
    _actions: Object.create(null),
    _deviceSchemas: Object.create(null),
    _devices: [],
    _scenes: [],
    _deviceinfo: undefined,
    _rules: [],
    _triggers: [],
    _triggerTimer: undefined,
    _pendingRules: [],
    _cfg: undefined,
    _Device: Device.Device,
    _Scene: Scene.Scene,
    _Type: Device.Type,
    _Console: Console,
    _Timer: Timer,
    _Variable: Variable,
    _WebServer: WebServer.Server,
    _WebSocket: WebSocket,
    _restored: false,
    _serverVersion: hwVersion(),
    _rulePriorities: { High: 0, Medium: 1, Low: 2 },

    get rulePriorities() {
        return this._rulePriorities;
    },

    get serverVersion() {
        return this._serverVersion;
    },

    registerEvent: function(name, ctor, completion, deserialize) {
        if (name in this._events)
            return false;
        this._events[name] = { ctor: ctor, completion: completion, deserialize: deserialize };
        return true;
    },
    registerAction: function(name, ctor, completion, deserialize) {
        if (name in this._actions)
            return false;
        this._actions[name] = { ctor: ctor, completion: completion, deserialize: deserialize };
        return true;
    },
    registerDevice: function(type, schema) {
        if (type in this._deviceSchemas) {
            if (!this._deviceSchemas[type].equals(schema))
                throw new Error(`Device schema for ${type} already registered`);
        } else {
            this._deviceSchemas[type] = schema;
        }
    },

    addDevice: function(device) {
        var t = device.type;
        if (t in this._deviceSchemas) {
            if (!this._deviceSchemas[t].verify(device)) {
                throw new Error(`Device schema mismatch for ${t} -> ${device.fullName}`);
            }
        } else if (t != "Unknown") {
            throw new Error(`Invalid device type ${t}`);
        }
        this._devices.push(device);
    },
    removeDevice: function(device) {
        this._devices.remove((el) => { return el.uuid == device.uuid; });
        if (this._deviceinfo && device.uuid in this._deviceinfo) {
            delete this._deviceinfo[device.uuid];
        }
    },

    addScene: function(scene) {
        this._scenes.push(scene);
    },
    removeScene: function(scene) {
        var len = this._scenes.length;
        if (typeof scene === "object")
            this._scenes.remove((el) => { return Object.is(scene, el); });
        else if (typeof scene === "string")
            this._scenes.remove((el) => { return el.name === scene; });
        return (len !== this._scenes.length);
    },

    addRule: function(rule) {
        for (var i = 0; i < this._rules.length; ++i) {
            if (rule.name == this._rules[i].name) {
                console.trace(`duplicate rule ${rule.name}`);
                process.exit();
            }
        }
        this._rules.push(rule);
    },
    removeRule: function(rule) {
        var len = this._rules.length;
        this._rules.remove((el) => { if (Object.is(rule, el)) { rule.destroy(); return true; } return false; });
        return this._rules.length < len;
    },
    removeRuleByName: function(name) {
        var len = this._rules.length;
        this._rules.remove((el) => { if (el.name == name) { el.destroy(); return true; } return false; });
        return this._rules.length < len;
    },

    valueUpdated: function(value) {
        this._emit("valueUpdated", value);
    },
    modulesReady: function() {
        this._emit("ready");
    },
    timerUpdated: function(type, name) {
        this._emit("timerUpdated", { type: type, name: name });
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
    get scenes() {
        return this._scenes;
    },
    get rules() {
        return this._rules;
    },
    get config() {
        return this._cfg;
    },
    get Console() {
        return this._Console;
    },
    get Device() {
        return this._Device;
    },
    get DeviceTypes() {
        return Object.keys(this._deviceSchemas);
    },
    get Scene() {
        return this._Scene;
    },
    get Type() {
        return this._Type;
    },
    get Timer() {
        return this._Timer;
    },
    get Variable() {
        return this._Variable;
    },
    get WebServer() {
        return this._WebServer;
    },
    get WebSocket() {
        return this._WebSocket;
    },
    get restored() {
        return this._restored;
    },

    triggerRule: function(rule) {
        if (rule) {
            this._triggers.push(rule);
            if (!this._triggerTimer) {
                this._triggerTimer = setTimeout(() => {
                    this.triggerRule();
                }, 0);
            }
        } else {
            var tr = this._triggers;
            this._triggers = [];
            this._triggerTimer = undefined;
            for (var pri = this.rulePriorities.High; pri <= this.rulePriorities.Low; ++pri) {
                for (var k = 0; k < tr.length; ++k) {
                    tr[k]._trigger(pri);
                }
            }
        }
    },

    saveRules: function(cb) {
        var rules = [], i;
        for (i = 0; i < this._rules.length; ++i) {
            // true = overwrite
            rules.push(this._rules[i].serialize());
        }
        // merge with pendingRules if we still have any
        for (i = 0; i < this._pendingRules.length; ++i) {
            rules.push(Rule.SerializePending(this._pendingRules[i]));
        }
        Console.log(rules);
        if (cb) {
            cb("rules.json", rules);
        } else {
            db.writeFileSync(path.join(Config.path, "rules.json"), rules, { spaces: 4 });
        }
    },
    saveDevices: function(cb) {
        var devices = this._deviceinfo || Object.create(null);
        for (var i = 0; i < this._devices.length; ++i) {
            var dev = this._devices[i];
            devices[dev.uuid] = { name: dev.name, room: dev.room, floor: dev.floor, groups: dev.groups, type: dev.type };
            if (dev.virtual) {
                // save values as well
                var vals = Object.create(null);
                for (var v in dev.values) {
                    vals[v] = dev.values[v].data;
                }
                devices[dev.uuid].values = vals;
            }
        }
        if (cb) {
            cb("devices.json", devices);
        } else {
            db.writeFileSync(path.join(Config.path, "devices.json"), devices, { spaces: 4 });
        }
    },
    saveScenes: function(cb) {
        var scenes = [];
        for (var i = 0; i < this._scenes.length; ++i) {
            var scene = this._scenes[i];
            scenes.push({ name: scene.name, values: scene.values });
        }
        if (cb) {
            cb("scenes.json", scenes);
        } else {
            db.writeFileSync(path.join(Config.path, "scenes.json"), scenes, { spaces: 4 });
        }
    },
    save: function(cb) {
        this.saveRules(cb);
        this.saveDevices(cb);
        this.saveScenes(cb);
    },

    restoreRules: function(rules) {
        this._rules = [];
        this._pendingRules = rules;

        this.loadRules();
    },
    restoreScenes: function(scenes) {
        this._scenes = [];
        if (scenes instanceof Array) {
            for (var i = 0; i < scenes.length; ++i) {
                this.addScene(new this.Scene(scenes[i].name, scenes[i].values));
            }
        }
    },
    restore: function(args) {
        db.readFile(path.join(Config.path, "rules.json"), (err, obj) => {
            if (obj) {
                this.restoreRules(obj);
            } else {
                if (err.code !== "ENOENT")
                    console.error("error loading rules", err);
            }
        });
        Config.load(this, () => {
            this.WebServer.serve(homework, this.config.webserver);

            db.readFile(path.join(Config.path, "devices.json"), (err, obj) => {
                this._deviceinfo = obj;
                Device.Device.init(this, obj);
                db.readFile(path.join(Config.path, "scenes.json"), (err, obj) => {
                    Scene.init(this);

                    this.restoreScenes(obj);

                    Timer.init(this);
                    Variable.init(this);
                    WebSocket.init(this, this.config.websocket);
                    db.readFile(path.join(Config.path, "modules.json"), (err, obj) => {
                        Modules.init(this, obj);
                        this._restored = true;
                    });
                });
            });
        });
    },
    loadRules: function() {
        this._pendingRules = this._pendingRules.filter((rule) => {
            var r = Rule.Deserialize(homework, rule);
            if (r) {
                Console.log("restored rule", r.name);
                homework.addRule(r);
                return false;
            }
            return true;
        });
    },

    utils: require("./utils.js")
};

homework.utils.onify(homework);
homework._initOns();

Rule.init(homework);

Console.init(homework);
Console.on("shutdown", () => {
    if (!homework.restored) {
        process.exit();
    } else {
        homework.save();
        Modules.shutdown((data) => {
            if (data) {
                console.log("modules.json", data);
                db.writeFileSync(path.join(Config.path, "modules.json"), data, { spaces: 4 });
            }
            process.exit();
        });
    }
});

homework.restore(require('minimist')(process.argv.slice(2)));

/*
// fake device
var hey = new Device("hey");
var heyval = new Device.Value("mode", {"on": 1, "off": 2});
setInterval(() => {
    if (heyval.value === "on") {
        heyval.update(2);
    } else {
        heyval.update(1);
    }
}, 1000);
hey.addValue(heyval);

homework.addDevice(hey);
homework.loadRules();
*/
