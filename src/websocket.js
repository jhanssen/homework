/*global module,require,global*/

const WebSocketServer = require("ws").Server;

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
            const val = dev.values[v];
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
    init: function(hw) {
        homework = hw;
        homework.on("valueUpdated", (value) => {
            sendToAll({ valueUpdated: { devuuid: value.device ? value.device.uuid : null, valname: value.name, value: value.value, raw: value.raw }});
        });
        wss = new WebSocketServer({ port: 8093 });
        wss.on("connection", (ws) => {
            connections.push(ws);
            ws.on("message", (data, flags) => {
                // we only support rpc for now
                try {
                    const msg = JSON.parse(data);
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
