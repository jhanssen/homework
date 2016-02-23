/*global module,require,global*/

"use strict";

const WebSocketServer = require("ws").Server;
const Rule = require("./rule.js");

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
            const ret = rs.map((r) => { return r.serialize(); });
            send(ws, msg.id, ret);
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
    }
};

const WebSocket = {
    _ready: undefined,

    init: function(hw) {
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
