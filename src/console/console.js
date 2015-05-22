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
    var completions = {
        candidates: ["help ", "controllers ", "quit ", "set "],
        set: {
            candidates: ["controller ", "sensor ", "rule ", "scene "],
            controller: {
                candidates: function(used, part) {
                    var id = pendingCompletions.id;
                    pendingCompletions.pending[id] = {
                        used: used,
                        callback: callback,
                        part: part
                    };
                    send({get: "controllers", id: id});
                    ++pendingCompletions.id;
                }
            }
        }
    };

    var hits;
    var candidate = completions;
    var splitLine = line.split(' ');
    // console.log(JSON.stringify(splitLine));
    var used = line;
    for (var i = 0; i < splitLine.length; ++i) {
        if (candidate.hasOwnProperty(splitLine[i])) {
            candidate = candidate[splitLine[i]];
            var sofar = splitLine[i] + " ";
            // eat spaces
            while (i + 1 < splitLine.length && splitLine[i + 1].length == 0) {
                sofar += " ";
                ++i;
            }
            used = used.substr(sofar.length);
        } else {
            break;
        }
    }

    if (typeof candidate.candidates === "function") {
        candidate.candidates(used, splitLine[i]);
        return;
    }

    hits = candidate.candidates.filter(function(c) { return c.indexOf(splitLine[i]) == 0; });
    callback(null, [hits.length ? hits : candidate.candidates, used]);
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
        data.callback(null, [hits.length ? hits : msg.data, data.used]);

        delete pendingCompletions.pending[msg.id];
        return;
    }
    console.log("got message", JSON.stringify(msg));
}

prompt();

ws.on("open", function() {
    console.log("ready.");
    prompt();
}).on("message", function(data, flags) {
    var msg = JSON.parse(data);
    handleMessage(msg);
    prompt();
}).on("close", function() {
    console.log("ws closed");
    process.exit(0);
}).on("error", function() {
    console.log("ws error");
    prompt();
});

rl.on("line", function(line) {
    if (line == "help")
        showHelp();
    else if (line == "controllers")
        send({get: "controllers"});
    else
        console.log("Unknown command");
    prompt();
}).on("close", function() {
    process.stdout.write("\n");
    process.exit(0);
});
