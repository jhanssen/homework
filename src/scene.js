/*global module,require*/

"use strict";

const util = require('util');
const EventEmitter = require('events');

const data = {
    homework: undefined
};

function findDevice(uuid)
{
    if (!data.homework)
        return undefined;
    let devices = data.homework.devices;
    for (var d = 0; d < devices.length; ++d) {
        if (devices[d].uuid == uuid)
            return devices[d];
    }
    return undefined;
}

function Scene(name, values)
{
    this._name = name;
    this._values = values || Object.create(null);

    EventEmitter.call(this);
}

Scene.prototype = {
    _name: undefined,
    _values: undefined,

    set name(name) {
        this._name = name;
    },
    get name() {
        return this._name;
    },
    get values() {
        return this._values;
    },

    set: function(deviceValue, value)
    {
        let device = deviceValue.device;
        if (!(device.uuid in this._values)) {
            this._values[device.uuid] = Object.create(null);
        }
        this._values[device.uuid][deviceValue.name] = value;
    },
    unset: function(deviceValue)
    {
        let device = deviceValue.device;
        if (!(device.uuid in this._values))
            return;
        if (!(deviceValue.name in this._values[device.uuid]))
            return;
        delete this._values[device.uuid][deviceValue.name];
    },

    trigger: function()
    {
        this.emit("triggering");

        for (var d in this._values) {
            // find the device
            let dev = findDevice(d);
            if (dev) {
                let vals = dev.values;
                for (var v in this._values[d]) {
                    if (v in vals) {
                        vals[v].value = this._values[d][v];
                    }
                }
            }
        }

        this.emit("triggered");
    }
};

util.inherits(Scene, EventEmitter);

module.exports = {
    init: function(homework) {
        data.homework = homework;
    },
    Scene: Scene
};
