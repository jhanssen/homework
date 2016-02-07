/*global require,process*/
require("sugar");

const Config = require("./config.js");
const Device = require("./device.js");
const Console = require("./console.js");
const WebSocket = require("./websocket.js");
const Rule = require("./rule.js");
const Modules = require("./modules.js");
const db = require("jsonfile");

const homework = {
    _events: Object.create(null),
    _actions: Object.create(null),
    _devices: [],
    _rules: [],
    _pendingRules: [],
    _cfg: undefined,
    _Device: Device,
    _Console: Console,

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

    save: function() {
        var rules = [], i;
        for (i = 0; i < this._rules.length; ++i) {
            rules.push(this._rules[i].serialize());
        }
        // merge with pendingRules if we still have any
        for (i = 0; i < this._pendingRules.length; ++i) {
            rules.push(this._pendingRules[i]);
        }
        Console.log(rules);
        db.writeFileSync("rules.json", rules);
    },
    restore: function() {
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
            Device.init(this);
            WebSocket.init(this);
            Modules.init(this);
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

Console.init(homework);
Console.on("shutdown", () => {
    homework.save();
    Modules.shutdown(() => {
        process.exit();
    });
});

homework.restore();

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
