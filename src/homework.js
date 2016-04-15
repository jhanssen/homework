#!/usr/bin/env node

/*global require,process,homework,setTimeout*/

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
const db = require("jsonfile");
const path = require("path");

homework = {
    _events: Object.create(null),
    _actions: Object.create(null),
    _devices: [],
    _deviceinfo: undefined,
    _rules: [],
    _triggers: [],
    _triggerTimer: undefined,
    _pendingRules: [],
    _cfg: undefined,
    _Device: Device.Device,
    _Type: Device.Type,
    _Console: Console,
    _Timer: Timer,
    _Variable: Variable,
    _WebServer: WebServer.Server,
    _WebSocket: WebSocket,
    _restored: false,
    _rulePriorities: { High: 0, Medium: 1, Low: 2 },

    get rulePriorities() {
        return this._rulePriorities;
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

    addDevice: function(device) {
        this._devices.push(device);
    },
    removeDevice: function(device) {
        this._devices.remove((el) => { return Object.is(device, el); });
    },

    addRule: function(rule) {
        this._rules.push(rule);
    },
    removeRule: function(rule) {
        this._rules.remove((el) => { if (Object.is(rule, el)) { rule.destroy(); return true; } return false; });
    },
    removeRuleByName: function(name) {
        this._rules.remove((el) => { if (el.name == name) { el.destroy(); return true; } return false; });
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

    save: function() {
        var rules = [], i;
        for (i = 0; i < this._rules.length; ++i) {
            // true = overwrite
            rules.push(this._rules[i].serialize(true));
        }
        // merge with pendingRules if we still have any
        for (i = 0; i < this._pendingRules.length; ++i) {
            rules.push(Rule.SerializePending(this._pendingRules[i]));
        }
        Console.log(rules);
        db.writeFileSync(path.join(Config.path, "rules.json"), rules, { spaces: 4 });

        var devices = this._deviceinfo || Object.create(null);
        for (i = 0; i < this._devices.length; ++i) {
            var dev = this._devices[i];
            devices[dev.uuid] = { name: dev.name, room: dev.room, floor: dev.floor, groups: dev.groups, type: dev.type };
        }
        db.writeFileSync(path.join(Config.path, "devices.json"), devices, { spaces: 4 });
    },
    restore: function(args) {
        db.readFile(path.join(Config.path, "rules.json"), (err, obj) => {
            if (obj) {
                homework._pendingRules = obj;
                homework.loadRules();
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
                Timer.init(this);
                Variable.init(this);
                WebSocket.init(this, this.config.websocket);
                db.readFile(path.join(Config.path, "modules.json"), (err, obj) => {
                    Modules.init(this, obj);
                    this._restored = true;
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
