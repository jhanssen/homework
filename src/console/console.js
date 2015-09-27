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
    rl.prompt(arg === undefined ? true : arg);
}

var oldconsole = {
    log: console.log,
    error: console.error
};
console.log = function()
{
    readline.clearLine(process.stdout, 0);
    readline.moveCursor(process.stdout, -2, 0);
    var args = Array.prototype.slice.call(arguments);
    args.splice(0, 0, (new Date).toLocaleTimeString());
    oldconsole.log.apply(this, args);
};

var pendingCompletions = {id: 0, pending: Object.create(null)};
var state = {};
var listeners = {};

function addEventListener(type, callback)
{
    if (!listeners[type])
        listeners[type] = [];
    listeners[type].push(callback);
}

function callEventListeners(type, name, event)
{
    var l = listeners[type];
    if (l instanceof Array) {
        for (var i = 0; i < l.length; ++i)
            l[i](name, event);
    }
}

function requestCompletion(req, used, part, callback, remaining)
{
    var id = pendingCompletions.id;
    pendingCompletions.pending[id] = {
        used: used,
        callback: callback,
        part: part,
        remaining: remaining
    };
    req.id = id;
    send(req);
    ++pendingCompletions.id;
};

function processCompletions(completions, line, callback, extraused)
{
    if (!extraused)
        extraused = "";
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
    var remaining;
    if (i < splitLine.length) {
        splitLine.splice(0, i);
        remaining = splitLine.join(' ');
    } else {
        remaining = "";
    }

    if (typeof candidate.candidates === "function") {
        if (!candidate.candidates(extraused + used, last, remaining)) {
            callback(null, [null, line]);
            prompt();
        }
    } else {
        var hits = candidate.candidates.filter(function(c) { return c.indexOf(last) == 0; });
        callback(null, [hits, used]);
    }
}

function completer(line, callback)
{
    var completions = {
        candidates: ["help ", "list ", "controller ", "sensor ", "rule ", "scene ", "quit ", "set ", "create ", "configure "],
        set: {
            candidates: ["controller ", "sensor ", "rule ", "scene "],
            controller: {
                candidates: function(used, part, remaining) {
                    requestCompletion({get: "controllers"}, used, part, callback, remaining);
                    return true;
                }
            },
            sensor: {
                candidates: function(used, part, remaining) {
                    requestCompletion({get: "sensors"}, used, part, callback, remaining);
                    return true;
                }
            },
            rule: {
                candidates: function(used, part, remaining) {
                    requestCompletion({get: "rules"}, used, part, callback, remaining);
                    return true;
                }
            },
            scene: {
                candidates: function(used, part, remaining) {
                    requestCompletion({get: "scenes"}, used, part, callback, remaining);
                    return true;
                }
            }
        },
        configure: {
            candidates: ["modules "],
            modules: {
                candidates: function(used, part, remaining) {
                    requestCompletion({get: "modules"}, used, part, callback, remaining);
                    return true;
                }
            }
        },
        list: {
            candidates: ["controllers", "sensors", "rules", "scenes", "modules"]
        },
        create: {
            candidates: ["rule ", "scene "]
        },
        controller: {
            candidates: function(used, part, remaining) {
                if (state.controller === undefined) {
                    console.log("\nno controller set");
                    return false;
                }
                requestCompletion({get: "controller", controller: state.controller}, used, part, callback, remaining);
                return true;
            }
        },
        rule: {
            candidates: ["add "],
            add: {
                candidates: function(used, part, remaining) {
                    if (state.rule === undefined) {
                        console.log("\nno rule set");
                        return false;
                    }
                    requestCompletion({get: "sensors"}, used, part, callback, remaining);
                    return true;
                }
            }
        }
    };
    processCompletions(completions, line, callback);
}

function showHelp()
{
}

function send(obj)
{
    var types = ["get", "set", "create", "add", "cfg"];
    for (var idx in types) {
        var type = types[idx];
        if (type in obj) {
            obj.type = type;
            break;
        }
    }
    ws.send(JSON.stringify(obj));
}

function isEvent(msg)
{
    if (!msg.hasOwnProperty("type"))
        return false;
    switch (msg.type) {
    case "sensor":
        return true;
    }
    return false;
}

function handleMessage(msg)
{
    if (typeof msg !== "object" || msg === null)
        return true;
    // do we have a pending completion for this id?
    if (msg.id in pendingCompletions.pending) {
        // yes, send it back
        var data = pendingCompletions.pending[msg.id];
        delete pendingCompletions.pending[msg.id];
        processCompletions(msg.data.completions, data.remaining, data.callback, data.used);
        return false;
    }
    if (isEvent(msg)) {
        callEventListeners(msg.type, msg.name, msg.data);
        return true;
    }
    switch (msg.type) {
    case "list":
        console.log(msg.data.list + ":", msg.data[msg.data.list]);
        break;
    default:
        console.log("unknown type", msg.type);
        break;
    }
    return true;
}

function sendSetRequest(object, name, args)
{
    var obj = { set: object, name: name };
    obj[args[0]] = args[1];
    args.splice(0, 2);
    obj["arguments"] = args;
    send(obj);
}

function sendCreateRequest(object, name)
{
    var obj = { create: object, name: name };
    send(obj);
}

function handleLine(line)
{
    var handlers = {
        help: function(args) {
            showHelp();
            return true;
        },
        list: function(args) {
            switch (args[0]) {
            case "controllers":
                send({get: "controllers"});
                break;
            case "sensors":
                send({get: "sensors"});
                break;
            case "rules":
                send({get: "rules"});
                break;
            case "scenes":
                send({get: "scenes"});
                break;
            case "modules":
                send({get: "modules"});
                break;
            default:
                console.log("can't list", args[0]);
                return true;
            }
            return false;
        },
        set: function(args) {
            if (args.length != 2) {
                console.log("invalid number of args to set");
                return true;
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
            return true;
        },
        create: function(args) {
            if (args.length != 2) {
                console.log("invalid number of args to set");
                return true;
            }
            switch (args[0]) {
            case "rule":
            case "scene":
                sendCreateRequest(args[0], args[1]);
                return false;
            default:
                console.log("invalid create", args[0]);
            }
            return true;
        },
        controller: function(args) {
            if (!state.controller) {
                console.log("no controller set");
                return true;
            }
            if (args.length === 0) {
                console.log("current controller", state.controller);
                return true;
            }
            if (args.length < 2) {
                console.log("invalid controller command");
                return true;
            }
            // send a request
            sendSetRequest("controller", state.controller, args);
            return false;
        },
        rule: function(args) {
            if (!state.rule) {
                console.log("no rule set");
                return true;
            }
            if (args.length === 0) {
                console.log("current rule", state.rule);
                return true;
            }
            if (args.length < 2) {
                console.log("invalid rule command");
                return true;
            }
            switch (args[0]) {
            case "add":
                send({add: "ruleSensor", rule: state.rule, sensor: args[1]});
                return false;
            default:
                console.log("invalid rule argument", args[0]);
            }
            return true;
        },
        configure: function(args) {
            if (args.length < 3) {
                console.log("invalid number of arguments to configure");
                return true;
            }
            send({cfg: args[0], name: args[1], value: args[2]});
            return false;
        }
    };
    var handler = handlers[line[0]];
    if (handler) {
        line.splice(0, 1);
        return handler(line);
    } else {
        // console.log("Unknown command:", line[0]);
    }
    return true;
}

prompt();

ws.on("open", function() {
    console.log("ready.");
    prompt();
}).on("message", function(data, flags) {
    var msg = JSON.parse(data);
    if (handleMessage(msg)) {
        prompt();
    }
}).on("close", function() {
    console.log("ws closed");
    process.exit(0);
}).on("error", function() {
    console.log("ws error");
    prompt();
});

rl.on("line", function(line) {
    if (!handleLine(line.split(' ').filter(function(el) { return el.length != 0; }))) {
        rl.pause();
    } else {
        prompt();
    }
}).on("close", function() {
    process.stdout.write("\n");
    process.exit(0);
});

addEventListener("sensor", function(name, event) {
    //console.log("got sensor", name, event);
});
