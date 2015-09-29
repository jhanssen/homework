/*global require,process*/

// set 9 64 1 0 "Off"

function setValue(args)
{
    // node, class, instance, index, value
    console.log("setting", JSON.stringify(args));
    zwave.setValue(parseInt(args[0]), parseInt(args[1]), parseInt(args[2]), parseInt(args[3]), JSON.parse(args[4]));
}

var readline = require("readline");
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
rl.setPrompt("zwave> ");
rl.prompt();
rl.on('line', function(line) {
    console.log("balle", line);
    var args = line.split(' ');
    if (args.length > 0) {
        var cmd = args.splice(0, 1)[0];
        console.log("cmd", cmd);
        if (cmd === "set") {
            setValue(args);
        }
    }
    rl.prompt();
}).on('close', function() {
    console.log('disconnecting...');
    zwave.disconnect();
    process.exit();
});

var ozw = require("openzwave-shared");
var zwave = new ozw();

console.log("hello");

zwave.on('node ready', function(nodeid, nodeinfo) {
    console.log('node ready', nodeid, nodeinfo);
});
zwave.on('value added', function(nodeid, commandclass, value){
    console.log('value added', nodeid, commandclass, value);
});

zwave.connect('/dev/ttyAMA0');
