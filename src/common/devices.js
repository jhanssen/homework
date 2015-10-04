/*global module*/

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
            ons[i].call(this, val);
        }
    }
};

Device.prototype._update = function(node)
{
    this._node = node;
    this._call("deviceUpdated");
};

Object.defineProperty(Device.prototype, "identifier", {
    get: function() { return "zw:" + this._id; }
});

Object.defineProperty(Device.prototype, "name", {
    get: function() {
        if (typeof this._node.name === "string" && this._node.name !== "")
            return this._node.name;
        return this._node.product;
    }
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
    this._call("valueChanged");
};

Controller.prototype._call = function(name, val)
{
    if (name in this._ons) {
        var ons = this._ons[name];
        for (var i = 0; i < ons.length; ++i) {
            ons[i].call(this, val);
        }
    }
};

Object.defineProperty(Controller.prototype, "value", {
    get: function() { return this._value.value; },
    set: function(v) { this._setValue(v); }
});

Object.defineProperty(Controller.prototype, "name", {
    get: function() { return this._value.label; }
});

Object.defineProperty(Controller.prototype, "values", {
    get: function() { return this._value.values; }
});

Object.defineProperty(Controller.prototype, "label", {
    get: function() { return this._value.label; }
});

Object.defineProperty(Controller.prototype, "type", {
    get: function() { return this._value.type; }
});

Object.defineProperty(Controller.prototype, "nodeid", {
    get: function() { return this._value.node_id; }
});

Object.defineProperty(Controller.prototype, "classid", {
    get: function() { return this._value.class_id; }
});

Object.defineProperty(Controller.prototype, "readOnly", {
    get: function() { return this._value.read_only; }
});

Object.defineProperty(Controller.prototype, "writeOnly", {
    get: function() { return this._value.write_only; }
});

Object.defineProperty(Controller.prototype, "identifier", {
    get: function() { return "zw:" + this._value.node_id + ":" + this._value.class_id; }
});

module.exports = { Controller: Controller, Device: Device };
