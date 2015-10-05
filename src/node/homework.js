/*global require,process*/

// /set 9 64 1 0 "Off"

var homework = { _ons: Object.create(null) };
var zwave = require("./zwave");
var devices = Object.create(null);
var ctrls = Object.create(null);

var WebSocketServer = require('ws').Server,
    wss = new WebSocketServer({port: 8087}),
    conns = [];

function sendDevices(ws)
{
    ws.send(JSON.stringify({ what: "devices", data: devices }));
}

function sendState(ws)
{
    ws.send(JSON.stringify({ what: "state", data: { state: zwave.state } }));
}

homework._handlers = {
    set: function(ws, msg) {
        if (!(msg.id in ctrls)) {
            console.log("set: no such id", msg);
            return;
        }
        ctrls[msg.id].value = msg.value;
    },
    request: function(ws, msg) {
        if (msg === "devices") {
            sendDevices(ws);
        } else if (msg === "state") {
            sendState(ws);
        }
    },
    configure: function(ws, msg) {
        switch (msg) {
        case "AddDevice":
        case "RemoveDevice":
        case "StopDevice":
            zwave.configureController(msg);
            break;
        }
    }
};

homework._handleMessage = function(ws, msg)
{
    if (!("what" in msg) || !homework._handlers.hasOwnProperty(msg.what)) {
        console.log("can't handle", msg);
        return;
    }
    homework._handlers[msg.what](ws, msg.data);
};

wss.on('connection', function(ws) {
    ws.on('message', function(message) {
        homework._handleMessage(ws, JSON.parse(message));
    });
    ws.on('close', function() {
        for (var i = 0; i < conns.length; ++i) {
            if (conns[i] === this) {
                console.log("closed, removed from list");
                conns.splice(i, 1);
                break;
            }
        }
    });
    conns.push(ws);
    //sendDevices(ws);
});

homework.on = function(name, cb)
{
    if (!(name in homework._ons)) {
        homework._ons[name] = [cb];
    } else {
        homework._ons[name].push(cb);
    }
};

homework._call = function(name, val)
{
    if (name in homework._ons) {
        var ons = homework._ons[name];
        for (var i = 0; i < ons.length; ++i) {
            ons[i].call(this, val);
        }
    }
};

var readline = require("readline");
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.setPrompt("zwave> ");
rl.prompt();
rl.on('line', function(line) {
    if (line.length > 0) {
        if (line[0] === '/') {
            var args = line.split(' ');
            if (args.length > 0) {
                var cmd = args.splice(0, 1)[0];
                console.log("cmd", cmd);
                if (cmd === "/set") {
                    //setValue(args);
                }
            }
        } else {
            eval(line);
        }
    }
    rl.prompt();
}).on('close', function() {
    zwave.stop();
    process.exit();
});

zwave.on("deviceAdded", function(dev) {
    console.log("new device", dev);

    dev.on("controllerAdded", function(ctrl) {
        console.log("new ctrl", ctrl);
        ctrl.on("valueChanged", function() {
            console.log("value", this.value);
        });
        ctrls[ctrl.identifier] = ctrl;
    });
    dev.on("deviceUpdated", function() {
        console.log("dev updated");
    });

    devices[dev.identifier] = dev;
});

zwave.on("stateChanged", function(newState, oldState, err) {
    for (var i = 0; i < conns.length; ++i) {
        conns[i].send(JSON.stringify({ what: "state", data: { state: newState, oldState: oldState, err: err } }));
    }
});

homework.start = function()
{
    zwave.start();
};

homework.start();
