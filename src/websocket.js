/*global module,require,global,setInterval,clearInterval*/

"use strict";

const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server;
const Rule = require("./rule.js");
const Variable = require("./variable.js");
const Timer = require("./timer.js");

var wss = undefined;
var homework = undefined;
var connections = [];

var Console;

function findDevice(uuid)
{
    var devs = homework.devices;
    if (!(devs instanceof Array))
        return undefined;
    return devs.find((d) => { return d.uuid == uuid; });
}

function isempty(v)
{
    if (v === undefined || v === null)
        return true;
    if (typeof v === "string" && !v.length)
        return true;
    return false;
}

function send(ws, id, result)
{
    ws.send(JSON.stringify({ id: id, result: result }));
}

function error(ws, id, err)
{
    ws.send(JSON.stringify({ id: id, error: err }));
}

function sendToAll(result)
{
    const data = JSON.stringify(result);
    for (var i = 0; i < connections.length; ++i) {
        connections[i].send(data);
    }
}

function construct(constructor, args) {
    function F() {
        return constructor.apply(this, args);
    }
    F.prototype = constructor.prototype;
    return new F();
}

const types = {
    call: (ws, msg) => {
        // find the thing
        if (typeof msg.call !== "string") {
            Console.log("no call:", msg);
            error(ws, msg.id, "message has no call");
            return;
        }
        var split = msg.call.split(".");
        var callee = undefined;
        var thing = homework;
        for (var i = 0; i < split.length; ++i) {
            if (!(split[i] in thing)) {
                Console.log(`no ${split[i]} in ${thing}`);
                error(ws, msg.id, "message has invalid call");
                return;
            }
            callee = thing;
            thing = thing[split[i]];
        }
        var ret;
        if (typeof thing === "function") {
            if (typeof callee !== "object")
                callee = undefined;
            if (msg.arguments instanceof Array) {
                ret = thing.apply(callee ? callee : null, msg.arguments);
            } else {
                ret = thing.call(callee ? callee : null);
            }
        } else {
            ret = thing;
        }
        var retmsg;
        try {
            retmsg = JSON.stringify({ id: msg.id, result: ret });
        } catch (e) {
            Console.log("ws data exception", e);
            retmsg = JSON.stringify({ id: msg.id, error: "message data exception" });
        }
        ws.send(retmsg);
    },
    devices: (ws, msg) => {
        Console.log("asked for devices");
        const devs = homework.devices;
        if (devs instanceof Array) {
            const ret = devs.map((e) => { return { type: e.type, name: e.name, room: e.room, floor: e.floor, uuid: e.uuid, groups: e.groups }; });
            send(ws, msg.id, ret);
        } else {
            error(ws, msg.id, "no devices");
        }
    },
    device: (ws, msg) => {
        var uuid = msg.uuid;
        var devs = homework.devices;
        if (devs instanceof Array) {
            for (var i = 0; i < devs.length; ++i) {
                if (devs[i].uuid == uuid) {
                    var d = devs[i];
                    send(ws, msg.id, { type: d.type, name: d.name, room: d.room, floor: d.floor, uuid: d.uuid, groups: d.groups });
                    return;
                }
            }
        }
        error(ws, msg.id, "no such device");
    },
    addGroup: (ws, msg) => {
        var group = msg.group;
        if (typeof group !== "string" || !group.length) {
            error(ws, msg.id, "no group name");
        } else {
            var dev = findDevice(msg.uuid);
            if (dev instanceof Object) {
                dev.addGroup(group);
                send(ws, msg.id, "ok");
            } else {
                error(ws, msg.id, `no such device ${msg.uuid}`);
            }
        }
    },
    removeGroup: (ws, msg) => {
        var group = msg.group;
        if (typeof group !== "string" || !group.length) {
            error(ws, msg.id, "no group name");
        } else {
            var dev = findDevice(msg.uuid);
            if (dev instanceof Object) {
                dev.removeGroup(group);
                send(ws, msg.id, "ok");
            } else {
                error(ws, msg.id, `no such device ${msg.uuid}`);
            }
        }
    },
    setGroup: (ws, msg) => {
        var group = msg.group;
        if (typeof group !== "string" || !group.length) {
            error(ws, msg.id, "no group name");
        } else {
            var dev = findDevice(msg.uuid);
            if (dev instanceof Object) {
                dev.groups = [group];
                send(ws, msg.id, "ok");
            } else {
                error(ws, msg.id, `no such device ${msg.uuid}`);
            }
        }
    },
    rules: (ws, msg) => {
        const rs = homework.rules;
        if (rs instanceof Array) {
            var complete = (from, array) => {
                // first element of the array is the key in 'from'
                var f = from[array[0]];
                if (f === undefined) {
                    throw `No event/action named '${array[0]}' registered`;
                }
                // Console.log(`--${array[0]}--`);
                // call consecutive complete with the rest of the array
                var ret = { name: array[0], steps: [] };
                var len = array.length - 1;
                for (var i = 0; i < len; ++i) {
                    var rest = array.slice(1);
                    rest.splice(i);
                    var comps = f.completion.apply(null, rest);
                    // Console.log("comps for " + JSON.stringify(rest) + ": " + JSON.stringify(comps) + "(val: " + array[i + 1] + ")");
                    ret.steps.push({ alternatives: comps, value: array[i + 1] });
                }
                return ret;
            };

            try {
                const ret = rs.map((r) => {
                    var fmt = r.format();
                    var acts = fmt.actions;

                    // actions is an array of arrays
                    for (var a = 0; a < acts.length; ++a) {
                        acts[a] = complete(homework.actions, acts[a]);
                    }

                    var evts = fmt.events;
                    // events is an arary of arrays of arrays
                    for (var es = 0; es < evts.length; ++es) {
                        for (var e = 0; e < evts[es].length; ++e) {
                            evts[es][e] = complete(homework.events, evts[es][e]);
                        }
                    }
                    return fmt;
                });
                send(ws, msg.id, ret);
            } catch (e) {
                error(ws, msg.id, `Exception mapping rule: ${e}`);
            }
        } else {
            error(ws, msg.id, "no devices");
        }
    },
    ruleTypes: (ws, msg) => {
        const ret = {
            events: Object.keys(homework.events),
            actions: Object.keys(homework.actions)
        };
        send(ws, msg.id, ret);
    },
    eventCompletions: (ws, msg) => {
        const args = msg.args;
        if (!(args instanceof Array)) {
            error(ws, msg.id, "args needs to be an array");
        } else {
            const evt = homework.events[args[0]];
            if (!(typeof evt === "object") || !("completion" in evt)) {
                error(ws, msg.id, "no event");
            } else {
                // Console.log("asking for completions", args.slice(1));
                const ret = evt.completion.apply(null, args.slice(1));
                // Console.log("got", ret);
                send(ws, msg.id, ret);
            }
        }
    },
    actionCompletions: (ws, msg) => {
        const args = msg.args;
        if (!(args instanceof Array)) {
            error(ws, msg.id, "args needs to be an array");
        } else {
            const act = homework.actions[args[0]];
            if (!(typeof act === "object") || !("completion" in act)) {
                error(ws, msg.id, "no action");
            } else {
                // Console.log("asking for completions", args.slice(1));
                const ret = act.completion.apply(null, args.slice(1));
                // Console.log("got", ret);
                send(ws, msg.id, ret);
            }
        }
    },
    createRule: (ws, msg) => {
        if (typeof msg.rule !== "object") {
            error(ws, msg.id, "No rule");
            return;
        }
        const desc = msg.rule;
        if (typeof desc.name !== "string" || !desc.name.length) {
            error(ws, msg.id, "No name");
            return;
        }
        const events = desc.events;
        const actions = desc.actions;
        if (!(events instanceof Array)) {
            error(ws, msg.id, "Events is not an array");
            return;
        }
        if (!(actions instanceof Array)) {
            error(ws, msg.id, "Actions is not an array");
            return;
        }
        var rule = new Rule(desc.name);
        var andCount = 0;
        for (var es = 0; es < events.length; ++es) {
            if (!(events[es] instanceof Array)) {
                error(ws, msg.id, `Event is not an array: ${es}`);
                return;
            }
            var ands = [];
            for (var e = 0; e < events[es].length; ++e) {
                var tr = events[es][e].trigger;
                var event = events[es][e].event;
                if (!(event instanceof Array) || !event.length) {
                    error(ws, msg.id, `Sub event is not an array: ${es}:${e}`);
                    return;
                }
                const ector = homework.events[event[0]];
                if (typeof ector !== "object" || !("ctor" in ector)) {
                    error(ws, msg.id, `Sub event doesn't have a constructor ${event[0]}`);
                    return;
                }
                try {
                    ands.push({ trigger: tr, and: construct(ector.ctor, event.slice(1)) });
                    ++andCount;
                } catch (e) {
                    error(ws, msg.id, `Error in event ctor ${event[0]}: ${e}`);
                    return;
                }
            }
            rule.and.apply(rule, ands);
        }
        if (!andCount) {
            error(ws, msg.id, `No events for rule`);
            return;
        }

        var thens = [];
        for (var as = 0; as < actions.length; ++as) {
            var action = actions[as];
            if (!(action instanceof Array) || !action.length) {
                error(ws, msg.id, `Action is not an array: ${as}`);
                return;
            }
            const actor = homework.actions[action[0]];
            if (typeof actor !== "object" || !("ctor" in actor)) {
                error(ws, msg.id, `Sub action doesn't have a constructor ${action[0]}`);
                return;
            }
            try {
                thens.push(construct(actor.ctor, action.slice(1)));
            } catch (e) {
                error(ws, msg.id, `Error in action ctor ${action[0]}: ${e}`);
                return;
            }
        }
        if (!thens.length) {
            error(ws, msg.id, `No actions for rule`);
            return;
        }
        rule.then.apply(rule, thens);
        homework.removeRuleByName(rule.name);
        homework.addRule(rule);
        send(ws, msg.id, { name: desc.name, success: true });
    },
    devicedata: (ws, msg) => {
        // return a list of all rooms and floors
        var rooms = Object.create(null);
        var floors = Object.create(null);
        const devs = homework.devices;
        for (var i = 0; i < devs.length; ++i) {
            var dev = devs[i];
            if (dev.room)
                rooms[dev.room] = true;
            if (dev.floor)
                floors[dev.floor] = true;
        }
        var ret = {
            rooms: Object.keys(rooms),
            floors: Object.keys(floors)
        };
        send(ws, msg.id, ret);
    },
    values: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg.id, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg.id, "unknown device");
            return;
        }
        var ret = [];
        for (var v in dev.values) {
            let val = dev.values[v];
            ret.push({ name: val.name, value: val.value, raw: val.raw,
                       values: val.values, range: val.range, units: val.units,
                       readOnly: val.readOnly, type: val.type });
        }
        send(ws, msg.id, ret);
    },
    getValue: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg.id, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg.id, "unknown device");
            return;
        }
        if (!("valname" in msg)) {
            error(ws, msg.id, "no valname in message");
            return;
        }
        if (!(msg.valname in dev.values)) {
            error(ws, msg.id, "valname not found");
            return;
        }
        const val = dev.values[msg.valname];
        const ret = { name: val.name, value: val.value, raw: val.raw,
                      values: val.values, range: val.range, units: val.units,
                      readOnly: val.readOnly, type: val.type };
        send(ws, msg.id, ret);
    },
    setName: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg.id, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg.id, "unknown device");
            return;
        }
        if (typeof msg.name !== "string" || !msg.name.length) {
            error(ws, msg.id, `invalid name ${msg.name}`);
            return;
        }
        dev.name = msg.name;
        send(ws, msg.id, "ok");
    },
    setRoom: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg.id, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg.id, "unknown device");
            return;
        }
        if (typeof msg.room !== "string") {
            error(ws, msg.id, `invalid room ${msg.room}`);
            return;
        }
        if (msg.room.length > 0)
            dev.room = msg.room;
        else
            dev.room = undefined;
        send(ws, msg.id, "ok");
    },
    setFloor: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg.id, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg.id, "unknown device");
            return;
        }
        if (typeof msg.floor !== "string") {
            error(ws, msg.id, `invalid floor ${msg.floor}`);
            return;
        }
        if (msg.floor.length > 0)
            dev.floor = msg.floor;
        else
            dev.floor = undefined;
        send(ws, msg.id, "ok");
    },
    setType: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg.id, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg.id, "unknown device");
            return;
        }
        if (typeof msg.devtype !== "number") {
            error(ws, msg.id, `invalid type ${msg.devtype}`);
            return;
        }
        dev.type = msg.devtype;
        send(ws, msg.id, "ok");
    },
    setValue: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg.id, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg.id, "unknown device");
            return;
        }
        if (!("valname" in msg)) {
            error(ws, msg.id, "no valname in message");
            return;
        }
        if (!(msg.valname in dev.values)) {
            error(ws, msg.id, "valname not found");
            return;
        }
        if (!("value" in msg)) {
            error(ws, msg.id, "no value in message");
            return;
        }
        const val = dev.values[msg.valname];
        if (val.readOnly) {
            error(ws, msg.id, "read only value");
            return;
        }
        val.value = msg.value;

        send(ws, msg.id, "ok");
    },
    addValue: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg.id, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg.id, "unknown device");
            return;
        }
        if (!("valname" in msg)) {
            error(ws, msg.id, "no valname in message");
            return;
        }
        if (!(msg.valname in dev.values)) {
            error(ws, msg.id, "valname not found");
            return;
        }
        if (!("delta" in msg)) {
            error(ws, msg.id, "no delta in message");
            return;
        }
        const val = dev.values[msg.valname];
        if (val.readOnly) {
            error(ws, msg.id, "read only value");
            return;
        }
        val.value = val.value + msg.delta;

        send(ws, msg.id, "ok");
    },
    variables: (ws, msg) => {
        // JSON.stringify screws me over
        var ret = Object.create(null);
        for (var k in Variable.variables) {
            ret[k] = Variable.variables[k];
            if (ret[k] === undefined)
                ret[k] = null;
        }
        send(ws, msg.id, { variables: ret });
    },
    setVariables: (ws, msg) => {
        var name;
        for (name in msg.variables) {
            if (!(name in Variable.variables)) {
                error(ws, msg.id, `variable ${name} doesn't exist`);
                return;
            }
        }
        for (name in msg.variables) {
            Variable.change(name, msg.variables[name]);
        }
        send(ws, msg.id, { success: true });
    },
    createVariable: (ws, msg) => {
        if (typeof msg.name !== "string" || !msg.name.length) {
            error(ws, msg.id, `no name for variable`);
            return;
        }
        if (!Variable.create(msg.name)) {
            error(ws, msg.id, `variable ${msg.name} already exists`);
            return;
        }
        send(ws, msg.id, { success: true });
        sendToAll({ type: "variableUpdated", name: msg.name, value: null });
    },
    timers: (ws, msg) => {
        const sub = msg.sub;
        var ret = Object.create(null);

        const serializeTimers = (timers, type, ret) => {
            var out = Object.create(null);
            for (var n in timers) {
                var t = timers[n];
                out[n] = {
                    state: t.state,
                    started: t.started,
                    timeout: t.timeout
                };
            }
            ret[type] = out;
        };

        if (sub == "timeout" || sub == "all") {
            serializeTimers(Timer.timeout, "timeout", ret);
        }
        if (sub == "interval" || sub == "all") {
            serializeTimers(Timer.interval, "interval", ret);
        }
        if (sub == "schedule" || sub == "all") {
            var out = Object.create(null);
            for (var k in Timer.schedule) {
                out[k] = Timer.schedule[k].date;
            }
            ret.schedule = out;
        }
        ret["now"] = Date.now();
        send(ws, msg.id, { timers: ret });
    },
    stopTimer: (ws, msg) => {
        var err = "";
        if (msg.sub in Timer) {
            if (msg.name in Timer[msg.sub]) {
                var t = Timer[msg.sub][msg.name];
                if ("stop" in t) {
                    t.stop();
                } else {
                    err = "No stop";
                }
            } else {
                err = "Timer out found";
            }
        } else {
            err = "Timer group not found";
        }
        if (err != "") {
            error(ws, msg.id, `${err} for ${msg.name} in group ${msg.sub}`);
        } else {
            send(ws, msg.id, { success: true });
        }
    },
    restartTimer: (ws, msg) => {
        var err = "";
        if (msg.sub in Timer) {
            if (msg.name in Timer[msg.sub]) {
                var t = Timer[msg.sub][msg.name];
                if ("start" in t) {
                    t.start(msg.value);
                } else {
                    err = "No start";
                }
            } else {
                err = "Timer out found";
            }
        } else {
            err = "Timer group not found";
        }
        if (err != "") {
            error(ws, msg.id, `${err} for ${msg.name} in group ${msg.sub}`);
        } else {
            send(ws, msg.id, { success: true });
        }
    },
    createTimer: (ws, msg) => {
        if (isempty(msg.name)) {
            error(ws, msg.id, `No name for timer`);
            return;
        }
        if (isempty(msg.sub)) {
            error(ws, msg.id, `No type for timer ${msg.name}`);
            return;
        }
        if (msg.sub === "schedule" && isempty(msg.value)) {
            error(ws, msg.id, `No value for timer ${msg.name}`);
            return;
        }
        try {
            Timer.create(msg.sub, msg.name, msg.value);
        } catch (e) {
            error(ws, msg.id, `Couldn't create timer: ${e}`);
            return;
        }
        send(ws, msg.id, { success: true });
    },
    setSchedules: (ws, msg) => {
        var name;
        for (name in msg.schedules) {
            if (!(name in Timer.schedule)) {
                error(ws, msg.id, `schedule ${name} doesn't exist`);
                return;
            }
        }
        var err = "";
        for (name in msg.schedules) {
            try {
                Timer.schedule[name].date = msg.schedules[name];
            } catch (e) {
                err += JSON.stringify(e) + "\n";
            }
        }
        if (err != "") {
            error(ws, msg.id, err);
        } else {
            send(ws, msg.id, { success: true });
        }
    }
};

function cloud(ws, msg)
{
    Console.log("cloud", msg);
}

var extraTypes = Object.create(null);

const HWWebSocket = {
    _ready: undefined,
    _cloud: undefined,
    _cloudOk: false,
    _cloudPending: [],
    _cloudInterval: undefined,

    sendCloud: function(d) {
        if (this._cloud && this._cloudOk) {
            if (d) {
                var data = JSON.stringify(d);
                this._cloud.send(data);
            } else if (this._cloudPending.length > 0) {
                for (var i = 0; i < this._cloudPending.length; ++i) {
                    this._cloud.send(JSON.stringify(this._cloudPending[i]));
                }
                this._cloudPending = [];
            }
        } else if (this._cloud) {
            this._cloudPending.push(d);
        } else {
            Console.log("no cloud");
        }
    },

    _setupWS: function(ws) {
        ws.on("message", (data, flags) => {
            // we only support rpc for now
            var msg;
            try {
                msg = JSON.parse(data);
            } catch (e) {
                Console.log("invalid ws message:", data);
                ws.send(JSON.stringify({ error: "invalid message" }));
                return;
            }
            if (typeof msg !== "object") {
                Console.log("ws message is not an object:", msg);
                ws.send(JSON.stringify({ error: "message is not an object" }));
                return;
            }
            if (!("id" in msg)) {
                if ("type" in msg && msg.type == "cloud") {
                    this._cloudOk = true;
                    this.sendCloud();
                    return;
                }
                Console.log("no id in message", msg);
                ws.send(JSON.stringify({ error: "message has no id" }));
                return;
            }
            if ("type" in msg && msg.type in types) {
                types[msg.type](ws, msg);
            } else if ("type" in msg && msg.type in extraTypes) {
                extraTypes[msg.type](ws, msg);
            } else {
                Console.log("unhandled ws message:", msg);
            }
        });
    },

    init: function(hw, cfg) {
        Console = hw.Console;

        Variable.on("changed", (name) => {
            sendToAll({ type: "variableUpdated", name: name, value: Variable.variables[name] });
        });

        this._ready = false;

        if (cfg && cfg.key) {
            this._cloud = new WebSocket("wss://www.homework.software:443/user/websocket",
            //this._cloud = new WebSocket("ws://192.168.1.22:3000/user/websocket",
                                        { headers: {
                                            "X-Homework-Key": cfg.key
                                        }});
            this._cloud.on("open", () => {
                Console.log("cloud available");
                this._setupWS(this._cloud);
                if (this._ready) {
                    Console.log("telling cloud we're ready (1)");
                    this.sendCloud({ type: "ready", ready: true });
                }
                this._cloudInterval = setInterval(() => {
                    Console.log("ping cloud");
                    this._cloud.ping();
                }, 1000 * 30);
            });
            this._cloud.on("close", () => {
                Console.log("cloud gone");
                this._cloud = undefined;
                this._cloudOk = false;
                clearInterval(this._cloudInterval);
                this._cloudInterval = undefined;
            });
            this._cloud.on("error", (err) => {
                Console.log("cloud error", err);
            });
        } else {
            Console.log("no cloud key, not connecting");
        }

        homework = hw;
        homework.on("valueUpdated", (value) => {
            sendToAll({ type: "valueUpdated", valueUpdated: { devuuid: value.device ? value.device.uuid : null, valname: value.name, value: value.value, raw: value.raw }});
        });
        homework.on("timerUpdated", (timer) => {
            const t = Timer[timer.type][timer.name];
            if (timer.type === "schedule") {
                timer.value = t.date;
            } else {
                timer.value = {
                    state: t.state,
                    started: t.started,
                    timeout: t.timeout
                };
            }
            sendToAll({ type: "timerUpdated", timerUpdated: timer });
        });
        homework.on("ready", () => {
            this._ready = true;
            sendToAll({ type: "ready", ready: true });
            Console.log("telling cloud we're ready (2)");
            this.sendCloud({ type: "ready", ready: true });
        });
        wss = new WebSocketServer({ port: 8093 });
        wss.on("connection", (ws) => {
            connections.push(ws);

            if (this._ready) {
                ws.send(JSON.stringify({ type: "ready", ready: true }));
            }

            this._setupWS(ws);
            ws.on("close", () => {
                const idx = connections.indexOf(ws);
                if (idx !== -1) {
                    connections.splice(idx, 1);
                }
            });
        });
    },
    registerCommand: function(cmd, cb) {
        extraTypes[cmd] = cb;
    },
    send: send,
    error: error
};

module.exports = HWWebSocket;
