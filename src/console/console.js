#!/usr/bin/env node

/*global global, require, process*/

var WebSocket = require("ws");
var ws = new WebSocket("ws://localhost:8087/");
var readline = require("readline");
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

function prompt()
{
    rl.setPrompt("> ", 2);
    rl.prompt();
}

function showHelp()
{
}

function send(obj)
{
    ws.send(JSON.stringify(obj));
}

prompt();

ws.on("open", function() {
    console.log("ready.");
    prompt();
}).on("message", function(data, flags) {
    console.log("message");
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
