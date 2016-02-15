/*global module,require,global*/

const WebSocketServer = require("ws").Server;

var wss = undefined;
var homework = undefined;
var connections = [];

const WebSocket = {
    init: function(hw) {
        homework = hw;
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
                if (msg.type === "call") {
                    // find the thing
                    if (typeof msg.call !== "string") {
                        console.log("no call:", msg);
                        ws.send(JSON.stringify({ id: msg.id, error: "message has no call" }));
                        return;
                    }
                    var split = msg.call.split(".");
                    var callee = undefined;
                    var thing = homework;
                    for (var i = 0; i < split.length; ++i) {
                        if (!(split[i] in thing)) {
                            console.log(`no ${split[i]} in ${thing}`);
                            ws.send(JSON.stringify({ id: msg.id, error: "message has invalid call" }));
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
                        retmsg = JSON.stringify({ id: msg.id, result: "message data exception" });
                    }
                    ws.send(retmsg);
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
