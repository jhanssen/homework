/*global require,process*/

// /set 9 64 1 0 "Off"

var homework = { _ons: Object.create(null), devices: Object.create(null), _started: false };

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
            ons[i](val);
        }
    }
};

homework.addDevice = function(nodeid, nodeinfo)
{
    if (!(nodeid in homework.devices)) {
        homework.devices[nodeid] = new Device(nodeid, nodeinfo);
        homework._call("deviceAdded", homework.devices[nodeid]);
    } else {
        homework.devices[nodeid]._update(nodeinfo);
    };
};

homework.addValue = function(nodeid, value)
{
    if (!(nodeid in homework.devices)) {
        homework.devices[nodeid] = new Device(nodeid);
        homework._call("deviceAdded", homework.devices[nodeid]);
    }
    var device = homework.devices[nodeid];
    var ctrl = new Controller(value);
    device.controllers.push(ctrl);
    device._call("controllerAdded", ctrl);
};

homework.updateValue = function(value)
{
    var node = homework.devices[value.node_id];
    for (var i = 0; i < node.controllers.length; ++i) {
        var ctrl = node.controllers[i];
        if (ctrl.nodeid === value.node_id &&
            ctrl.classid === value.class_id) {
            node.controllers[i]._update(value);
            break;
        }
    }
};

function Device(id, node)
{
    this._id = id;
    this._node = node;
    this._ons = Object.create(null);
    this.controllers = [];
};

Device.prototype.on = function(name, cb)
{
    if (!(name in this._ons)) {
        this._ons[name] = [cb];
    } else {
        this._ons[name].push(cb);
    }
};

Device.prototype._call = function(name, val)
{
    if (name in this._ons) {
        var ons = this._ons[name];
        for (var i = 0; i < ons.length; ++i) {
            ons[i](val);
        }
    }
};

Device.prototype._update = function(node)
{
    this._node = node;
    homework._call("deviceUpdated", this);
};

Object.defineProperty(Device.prototype, "identifier", {
    get: function() { return "" + this._id; }
});

function Controller(value)
{
    this._value = value;
    this._ons = Object.create(null);
};

Controller.prototype.on = function(name, cb)
{
    if (!(name in this._ons)) {
        this._ons[name] = [cb];
    } else {
        this._ons[name].push(cb);
    }
};

Controller.prototype._update = function(value)
{
    this._value = value;
    this._call("valueChanged", this);
};

Controller.prototype._call = function(name, val)
{
    if (name in this._ons) {
        var ons = this._ons[name];
        for (var i = 0; i < ons.length; ++i) {
            ons[i](val);
        }
    }
};

Object.defineProperty(Controller.prototype, "value", {
    get: function() { return this._value.value; },
    set: function(v) {
        _zwave.setValue(this._value.node_id,
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

Object.defineProperty(Controller.prototype, "identifier", {
    get: function() { return this._value.node_id + ":" + this._value.class_id; }
});

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
    if (homework._started) {
        console.log('disconnecting...');
        _zwave.disconnect();
    }
    process.exit();
});

var _ozw = require("openzwave-shared");
var _zwave = new _ozw();

console.log("hello");

_zwave.on('node ready', function(nodeid, nodeinfo) {
    // console.log('node ready', nodeid, nodeinfo);

    homework.addDevice(nodeid, nodeinfo);
});
_zwave.on('node naming', function(nodeid, nodeinfo) {
    // console.log('node naming', nodeid, nodeinfo);

    homework.addDevice(nodeid, nodeinfo);
});
_zwave.on('value added', function(nodeid, commandclass, value){
    //console.log('value added', nodeid, commandclass, value);

    homework.addValue(nodeid, value);
});
_zwave.on('value changed', function(nodeid, commandclass, value){
    //console.log('value changed', nodeid, commandclass, value);
    homework.updateValue(value);
});
_zwave.on('value refreshed', function(nodeid, commandclass, value){
    //console.log('value refreshed', nodeid, commandclass, value);
    homework.updateValue(value);
});

homework.start = function()
{
    _zwave.connect('/dev/ttyAMA0');
    homework._started = true;
};


homework.on("deviceAdded", function(dev) {
    console.log("new device", dev);

    dev.on("controllerAdded", function(ctrl) {
        console.log("new ctrl", ctrl);
        ctrl.on("valueChanged", function(ctrl) {
            console.log("value", ctrl.value);
        });
    });
});

homework.start();
