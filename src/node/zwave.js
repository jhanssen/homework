/*global module,require*/

var zwave = { _ons: Object.create(null), devices: Object.create(null), _started: false, _state: "Normal" };

var devs = require("../common/devices");
var _ozw = require("openzwave-shared");
var _zwave = new _ozw();

zwave.on = function(name, cb)
{
    if (!(name in zwave._ons)) {
        zwave._ons[name] = [cb];
    } else {
        zwave._ons[name].push(cb);
    }
};

Object.defineProperty(zwave, "state", {
    get: function() { return this._state; }
});

zwave.start = function()
{
};

zwave._call = function(name, val)
{
    if (name in zwave._ons) {
        var ons = zwave._ons[name];
        for (var i = 0; i < ons.length; ++i) {
            ons[i].call(this, val);
        }
    }
};

zwave.addDevice = function(nodeid, nodeinfo)
{
    if (!(nodeid in zwave.devices)) {
        zwave.devices[nodeid] = new devs.Device(nodeid, nodeinfo);
        zwave._call("deviceAdded", zwave.devices[nodeid]);
    } else {
        zwave.devices[nodeid]._update(nodeinfo);
    };
};

zwave.addValue = function(nodeid, value)
{
    if (value.genre !== "user")
        return;
    if (!(nodeid in zwave.devices)) {
        zwave.devices[nodeid] = new devs.Device(nodeid);
        zwave._call("deviceAdded", zwave.devices[nodeid]);
    }
    var device = zwave.devices[nodeid];
    var ctrl = new devs.Controller(value);
    ctrl._setValue = function(v)
    {
        _zwave.setValue(this._value.node_id,
                        this._value.class_id,
                        this._value.instance,
                        this._value.index,
                        v);
    };
    device.controllers.push(ctrl);
    device._call("controllerAdded", ctrl);
};

zwave.updateValue = function(value)
{
    if (!value.node_id in zwave.devices)
        return;
    var node = zwave.devices[value.node_id];
    for (var i = 0; i < node.controllers.length; ++i) {
        var ctrl = node.controllers[i];
        if (ctrl.nodeid === value.node_id &&
            ctrl.classid === value.class_id) {
            node.controllers[i]._update(value);
            break;
        }
    }
};

zwave.configureController = function(cfg)
{
    if (cfg === "StopDevice") {
        if (zwave._state === "Waiting")
            _zwave.cancelControllerCommand();
        return;
    }

    if (zwave._state === "Waiting")
        _zwave.cancelControllerCommand();
    _zwave.beginControllerCommand(cfg);
};

console.log("hello");

_zwave.on('node ready', function(nodeid, nodeinfo) {
    // console.log('node ready', nodeid, nodeinfo);

    zwave.addDevice(nodeid, nodeinfo);
});
_zwave.on('node naming', function(nodeid, nodeinfo) {
    // console.log('node naming', nodeid, nodeinfo);

    zwave.addDevice(nodeid, nodeinfo);
});
_zwave.on('value added', function(nodeid, commandclass, value){
    //console.log('value added', nodeid, commandclass, value);

    zwave.addValue(nodeid, value);
});
_zwave.on('value changed', function(nodeid, commandclass, value){
    //console.log('value changed', nodeid, commandclass, value);
    zwave.updateValue(value);
});
_zwave.on('value refreshed', function(nodeid, commandclass, value){
    //console.log('value refreshed', nodeid, commandclass, value);
    zwave.updateValue(value);
});
_zwave.on('controller command', function(state, err){
    var states = ["Normal", "Starting", "Cancel", "Error", "Waiting", "Sleeping",
                  "InProgress", "Completed", "Failed", "NodeOk", "NodeFailed"];
    var errs = ["None", "ButtonNotFound", "NodeNotFound", "NotBridge", "NotSUC", "NotSecondary",
                "NotPrimary", "IsPrimary", "NotFound", "Busy", "Failed", "Disabled", "Overflow"];

    zwave._call("stateChanged", states[state], zwave._state, errs[err]);
    zwave._state = states[state];
});
_zwave.on('notification', function(nodeid, notif){
    console.log('notif', nodeid, notif);
});

zwave.start = function()
{
    _zwave.connect('/dev/ttyAMA0');
    this._started = true;
};

zwave.stop = function()
{
    if (!this._started)
        return;
    _zwave.disconnect();
};

module.exports = zwave;
