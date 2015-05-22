#!/usr/bin/env node

/*global global, require, process*/

var WebSocket = require("ws");
var ws = new WebSocket("ws://localhost:8087/");
var readline = require("readline");
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer,
    terminal: true
});

function prompt(arg)
{
    rl.setPrompt("> ", 2);
    rl.prompt(arg);
}

var pendingCompletions = {id: 0, pending: Object.create(null)};
var state = {};

function completer(line, callback)
{
    var requestCompletion = function(req, used, part) {
        var id = pendingCompletions.id;
        pendingCompletions.pending[id] = {
            used: used,
            callback: callback,
            part: part
        };
        req.id = id;
        send(req);
        ++pendingCompletions.id;
    };

    var completions = {
        candidates: ["help ", "list ", "controller ", "sensor ", "rule ", "scene ", "quit ", "set "],
        set: {
            candidates: ["controller ", "sensor ", "rule ", "scene "],
            controller: {
                candidates: function(used, part) {
                    requestCompletion({get: "controllers"}, used, part);
                    return true;
                }
            },
            sensor: {
                candidates: function(used, part) {
                    requestCompletion({get: "sensor"}, used, part);
                    return true;
                }
            },
            rule: {
                candidates: function(used, part) {
                    requestCompletion({get: "rule"}, used, part);
                    return true;
                }
            },
            scene: {
                candidates: function(used, part) {
                    requestCompletion({get: "scene"}, used, part);
                    return true;
                }
            }
        },
        list: {
            candidates: ["controllers", "sensors", "rules", "scenes"]
        },
        controller: {
            candidates: function(used, part) {
                if (state.controller === undefined) {
                    console.log("\nno controller set");
                    return false;
                }
                requestCompletion({get: "controller", controller: state.controller}, used, part);
                return true;
            }
        }
    };

    var candidate = completions;
    var splitLine = line.split(' ');
    // console.log(JSON.stringify(splitLine));
    var used = line, last = "";
    for (var i = 0; i < splitLine.length; ++i) {
        last = splitLine[i];
        if (candidate.hasOwnProperty(splitLine[i])) {
            candidate = candidate[splitLine[i]];
            var sofar = splitLine[i] + " ";
            // eat spaces
            while (i + 1 < splitLine.length && splitLine[i + 1].length == 0) {
                sofar += " ";
                ++i;
            }
            used = used.substr(sofar.length);
            last = "";
        } else {
            break;
        }
    }

    if (typeof candidate.candidates === "function") {
        if (!candidate.candidates(used, last)) {
            callback(null, [null, line]);
            prompt(true);
        }
    } else {
        var hits = candidate.candidates.filter(function(c) { return c.indexOf(last) == 0; });
        callback(null, [hits, used]);
    }
}

function showHelp()
{
}

function send(obj)
{
    ws.send(JSON.stringify(obj));
}

function handleMessage(msg)
{
    // do we have a pending completion for this id?
    if (msg.id in pendingCompletions.pending) {
        // yes, send it back
        var data = pendingCompletions.pending[msg.id];
        var hits = msg.data.filter(function(c) { return c.indexOf(data.part) == 0; });
        data.callback(null, [hits, data.used]);

        delete pendingCompletions.pending[msg.id];
        return false;
    }
    console.log("got message", JSON.stringify(msg));
    return true;
}

function handleLine(line)
{
    var handlers = {
        help: function(args) {
            showHelp();
        },
        list: function(args) {
            switch (args[0]) {
            case "controllers":
                send({get: "controllers"});
                break;
            case "sensors":
                send({get: "controllers"});
                break;
            case "rules":
                send({get: "rules"});
                break;
            case "scenes":
                send({get: "scenes"});
                break;
            default:
                console.log("can't list", args[0]);
                break;
            }
        },
        set: function(args) {
            if (args.length != 2) {
                console.log("invalid number of args to set");
                return;
            }
            switch (args[0]) {
            case "controller":
            case "sensor":
            case "rule":
            case "scene":
                state[args[0]] = args[1];
                break;
            default:
                console.log("can't set", args[0]);
                break;
            }
        },
        controller: function(args) {
            if (!state.controller) {
                console.log("no controller set");
                return;
            }
            if (args.length === 0) {
                console.log("current controller", state.controller);
                return;
            }
        }
    };
    var handler = handlers[line[0]];
    if (handler) {
        line.splice(0, 1);
        handler(line);
    } else {
        console.log("Unknown command:", line[0]);
    }
}

prompt();

ws.on("open", function() {
    console.log("ready.");
    prompt();
}).on("message", function(data, flags) {
    var msg = JSON.parse(data);
    if (handleMessage(msg))
        prompt();
}).on("close", function() {
    console.log("ws closed");
    process.exit(0);
}).on("error", function() {
    console.log("ws error");
    prompt();
});

rl.on("line", function(line) {
    handleLine(line.split(' ').filter(function(el) { return el.length != 0; }));
    prompt();
}).on("close", function() {
    process.stdout.write("\n");
    process.exit(0);
});
