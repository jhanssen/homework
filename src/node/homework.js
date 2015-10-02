/*global require,process*/

// /set 9 64 1 0 "Off"

var homework = { _ons: Object.create(null) };
var zwave = require("./zwave");

var WebSocketServer = require('ws').Server,
    wss = new WebSocketServer({port: 8087});

wss.on('connection', function(ws) {
    ws.on('message', function(message) {
        console.log('received: %s', message);
    });
    ws.send('something');
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
    });
    dev.on("deviceUpdated", function() {
        console.log("dev updated");
    });
});

homework.start = function()
{
    zwave.start();
};

homework.start();
