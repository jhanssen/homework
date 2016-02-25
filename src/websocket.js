/*global module,require,global*/

"use strict";

const WebSocketServer = require("ws").Server;
const Rule = require("./rule.js");
const Variable = require("./variable.js");
const Timer = require("./timer.js");

var wss = undefined;
var homework = undefined;
var connections = [];

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
            console.log("no call:", msg);
            error(ws, msg.id, "message has no call");
            return;
        }
        var split = msg.call.split(".");
        var callee = undefined;
        var thing = homework;
        for (var i = 0; i < split.length; ++i) {
            if (!(split[i] in thing)) {
                console.log(`no ${split[i]} in ${thing}`);
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
            console.log("ws data exception", e);
            retmsg = JSON.stringify({ id: msg.id, error: "message data exception" });
        }
        ws.send(retmsg);
    },
    devices: (ws, msg) => {
        const devs = homework.devices;
        if (devs instanceof Array) {
            const ret = devs.map((e) => { return { type: e.type, name: e.name, uuid: e.uuid }; });
            send(ws, msg.id, ret);
        } else {
            error(ws, msg.id, "no devices");
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
                // console.log(`--${array[0]}--`);
                // call consecutive complete with the rest of the array
                var ret = { name: array[0], steps: [] };
                var len = array.length - 1;
                for (var i = 0; i < len; ++i) {
                    var rest = array.slice(1);
                    rest.splice(i);
                    var comps = f.completion.apply(null, rest);
                    // console.log("comps for " + JSON.stringify(rest) + ": " + JSON.stringify(comps) + "(val: " + array[i + 1] + ")");
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
                error(ws, msg.id, `Exception mapping rule: ${JSON.stringify(e)}`);
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
                // console.log("asking for completions", args.slice(1));
                const ret = evt.completion.apply(null, args.slice(1));
                // console.log("got", ret);
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
                // console.log("asking for completions", args.slice(1));
                const ret = act.completion.apply(null, args.slice(1));
                // console.log("got", ret);
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
                var event = events[es][e];
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
                    ands.push(construct(ector.ctor, event.slice(1)));
                    ++andCount;
                } catch (e) {
                    error(ws, msg.id, `Error in event ctor ${event[0]}: ${JSON.stringify(e)}`);
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
                error(ws, msg.id, `Error in action ctor ${action[0]}: ${JSON.stringify(e)}`);
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
                       values: val.values, range: val.range });
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
                      values: val.values, range: val.range };
        send(ws, msg.id, ret);
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
        val.value = msg.value;

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
        try {
            Timer.create(msg.sub, msg.name, msg.value);
        } catch (e) {
            error(ws, msg.id, `Couldn't create timer: ${JSON.stringify(e)}`);
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

const WebSocket = {
    _ready: undefined,

    init: function(hw) {
        Variable.on("changed", (name) => {
            sendToAll({ type: "variableUpdated", name: name, value: Variable.variables[name] });
        });

        this._ready = false;
        homework = hw;
        homework.on("valueUpdated", (value) => {
            sendToAll({ type: "valueUpdated", valueUpdated: { devuuid: value.device ? value.device.uuid : null, valname: value.name, value: value.value, raw: value.raw }});
        });
        homework.on("ready", () => {
            this._ready = true;
            sendToAll({ type: "ready", ready: true });
        });
        wss = new WebSocketServer({ port: 8093 });
        wss.on("connection", (ws) => {
            connections.push(ws);

            if (this._ready) {
                ws.send(JSON.stringify({ type: "ready", ready: true }));
            }

            ws.on("message", (data, flags) => {
                // we only support rpc for now
                var msg;
                try {
                    msg = JSON.parse(data);
                } catch (e) {
                    console.log("invalid ws message:", data);
                    ws.send(JSON.stringify({ error: "invalid message" }));
                    return;
                }
                if (typeof msg !== "object") {
                    console.log("ws message is not an object:", msg);
                    ws.send(JSON.stringify({ error: "message is not an object" }));
                    return;
                }
                if (!("id" in msg)) {
                    console.log("no id in message");
                    ws.send(JSON.stringify({ error: "message has no id" }));
                    return;
                }
                if ("type" in msg && msg.type in types) {
                    types[msg.type](ws, msg);
                } else {
                    console.log("unhandled ws message:", msg);
                }
            });
            ws.on("close", () => {
                const idx = connections.indexOf(ws);
                if (idx !== -1) {
                    connections.splice(idx, 1);
                }
            });
        });
    }
};

module.exports = WebSocket;
