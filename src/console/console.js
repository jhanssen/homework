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

function prompt()
{
    rl.setPrompt("> ", 2);
    rl.prompt();
}

var pendingCompletions = {id: 0, pending: Object.create(null)};

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
        candidates: ["help ", "controllers ", "quit ", "set "],
        set: {
            candidates: ["controller ", "sensor ", "rule ", "scene "],
            controller: {
                candidates: function(used, part) {
                    requestCompletion({get: "controllers"}, used, part);
                }
            },
            sensor: {
                candidates: function(used, part) {
                    requestCompletion({get: "sensor"}, used, part);
                }
            },
            rule: {
                candidates: function(used, part) {
                    requestCompletion({get: "rule"}, used, part);
                }
            },
            scene: {
                candidates: function(used, part) {
                    requestCompletion({get: "scene"}, used, part);
                }
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
        candidate.candidates(used, last);
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
    if (line == "help") {
        showHelp();
    } else if (line == "controllers") {
        send({get: "controllers"});
    } else if (line == "sensors") {
        send({get: "sensors"});
    } else if (line == "rules") {
        send({get: "rules"});
    } else if (line == "scenes") {
        send({get: "scenes"});
    } else {
        console.log("Unknown command");
    }
    prompt();
}).on("close", function() {
    process.stdout.write("\n");
    process.exit(0);
});
