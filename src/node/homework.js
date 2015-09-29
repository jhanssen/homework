/*global require,process*/

// /set 9 64 1 0 "Off"

function Device(node)
{
    this._node = node;
    this.controllers = [];
};

Device.prototype._update = function(node)
{
    this._node = node;
};

function Controller(value)
{
    this._value = value;
};

Controller.prototype._update = function(value)
{
    this._value = value;
};

Object.defineProperty(Controller.prototype, "value", {
    get: function() { return this._value.value; },
    set: function(v) {
        zwave.setValue(this._value.node_id,
                       this._value.class_id,
                       this._value.instance,
                       this._value.index,
                       v);
    }
});

Object.defineProperty(Controller.prototype, "label", {
    get: function() { return this._value.label; }
});

Object.defineProperty(Controller.prototype, "nodeid", {
    get: function() { return this._value.node_id; }
});

Object.defineProperty(Controller.prototype, "classid", {
    get: function() { return this._value.class_id; }
});

Object.defineProperty(Controller.prototype, "values", {
    get: function() { return this._value.values; }
});

var devices = Object.create(null);

function addNode(nodeid, nodeinfo)
{
    if (!(nodeid in devices)) {
        devices[nodeid] = new Device(nodeinfo);
    } else {
        devices[nodeid]._update(nodeinfo);
    };
}

function addValue(nodeid, value)
{
    if (!(nodeid in devices)) {
        devices[nodeid] = new Device();
    }
    devices[nodeid].controllers.push(new Controller(value));
}

function updateValue(value)
{
    var node = devices[value.node_id];
    for (var i = 0; i < node.controllers.length; ++i) {
        var ctrl = node.controllers[i];
        if (ctrl.nodeid === value.node_id &&
            ctrl.classid === value.class_id) {
            node.controllers[i]._update(value);
            break;
        }
    }
}

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
    if (line.length > 0) {
        if (line[0] === '/') {
            var args = line.split(' ');
            if (args.length > 0) {
                var cmd = args.splice(0, 1)[0];
                console.log("cmd", cmd);
                if (cmd === "/set") {
                    setValue(args);
                }
            }
        } else {
            eval(line);
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

    addNode(nodeid, nodeinfo);
});
zwave.on('value added', function(nodeid, commandclass, value){
    console.log('value added', nodeid, commandclass, value);

    addValue(nodeid, value);
});
zwave.on('value changed', function(nodeid, commandclass, value){
    console.log('value changed', nodeid, commandclass, value);
    updateValue(value);
});
zwave.on('value refreshed', function(nodeid, commandclass, value){
    console.log('value refreshed', nodeid, commandclass, value);
    updateValue(value);
});

zwave.connect('/dev/ttyAMA0');
