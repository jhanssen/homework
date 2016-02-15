/*global require,process,homework*/
require("sugar");

const Config = require("./config.js");
const Device = require("./device.js");
const Console = require("./console.js");
const WebSocket = require("./websocket.js");
const Rule = require("./rule.js");
const Modules = require("./modules.js");
const Timer = require("./timer.js");
const Variable = require("./variable.js");
const db = require("jsonfile");

homework = {
    _events: Object.create(null),
    _actions: Object.create(null),
    _devices: [],
    _deviceinfo: undefined,
    _rules: [],
    _pendingRules: [],
    _cfg: undefined,
    _Device: Device,
    _Console: Console,
    _Timer: Timer,
    _Variable: Variable,
    _restored: false,

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
        this._rules.remove((el) => { return Object.is(rule, el); });
    },

    valueUpdated(value) {
        this._emit("valueUpdated", value);
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
    get Timer() {
        return this._Timer;
    },
    get Variable() {
        return this._Variable;
    },
    get restored() {
        return this._restored;
    },

    save: function() {
        var rules = [], i;
        for (i = 0; i < this._rules.length; ++i) {
            rules.push(this._rules[i].serialize());
        }
        // merge with pendingRules if we still have any
        for (i = 0; i < this._pendingRules.length; ++i) {
            rules.push(Rule.SerializePending(this._pendingRules[i]));
        }
        Console.log(rules);
        db.writeFileSync("rules.json", rules);

        var devices = this._deviceinfo || Object.create(null);
        for (i = 0; i < this._devices.length; ++i) {
            var dev = this._devices[i];
            devices[dev.uuid] = { name: dev.name };
        }
        db.writeFileSync("devices.json", devices);
    },
    restore: function(args) {
        const modulePath = args.modulePath || args.M;

        db.readFile("rules.json", (err, obj) => {
            if (obj) {
                homework._pendingRules = obj;
                homework.loadRules();
            } else {
                if (err.code !== "ENOENT")
                    console.error("error loading rules", err);
            }
        });
        Config.load(this, () => {
            db.readFile("devices.json", (err, obj) => {
                this._deviceinfo = obj;
                Device.init(this, obj);
                Timer.init(this);
                Variable.init(this);
                WebSocket.init(this);
                db.readFile("modules.json", (err, obj) => {
                    Modules.init(this, modulePath, obj);
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

Console.init(homework);
Console.on("shutdown", () => {
    if (!homework.restored) {
        process.exit();
    } else {
        homework.save();
        Modules.shutdown((data) => {
            if (data) {
                console.log("modules.json", data);
                db.writeFileSync("modules.json", data);
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
