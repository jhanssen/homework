/*global module,require*/

"use strict";

const util = require('util');
const utils = require("./utils.js");
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

function SceneAction()
{
    if (arguments.length < 1) {
        throw "Scene action needs at least one argument";
    }

    // find the scene
    var scene;
    const scenes = data.homework.scenes;
    for (var i = 0; i < scenes.length; ++i) {
        if (scenes[i].name == arguments[0]) {
            scene = scenes[i];
            break;
        }
    }
    if (!scene) {
        throw `Scene ${arguments[0]} not found`;
    }

    this._scene = scene;

    EventEmitter.call(this);
}

SceneAction.prototype = {
    _scene: undefined,

    get scene() {
        return this._scene;
    },

    trigger: function(pri) {
        if (pri === data.homework.rulePriorities.Medium)
            this._scene.trigger();
    },
    serialize: function() {
        return { type: "SceneAction", scene: this._scene.name };
    },
    format: function() {
        return ["Scene", this._scene.name, "trigger"];
    }
};

util.inherits(SceneAction, EventEmitter);

function sceneCompleter()
{
    var ret = { type: undefined, values: [] }, i;

    const scenes = data.homework.scenes;
    if (arguments.length === 0) {
        ret.type = "array";
        for (i = 0; i < scenes.length; ++i)
            ret.values.push(scenes[i].name);
    } else {
        // find the scene
        var scene;
        for (i = 0; i < scenes.length; ++i) {
            if (scenes[i].name == arguments[0]) {
                scene = scenes[i];
                break;
            }
        }
        if (scene) {
            if (arguments.length === 1) {
                return { type: "array", values: ["trigger"] };
            }
        }
    }
    return ret;
}

function sceneDeserializer(e)
{
    if (!(typeof e === "object"))
        return null;

    if (e.type !== "SceneAction")
        return null;

    try {
        var event = new SceneAction(e.scene);
    } catch (e) {
        return null;
    }
    return event;
}

module.exports = {
    init: function(homework) {
        data.homework = homework;

        homework.registerAction("Scene", SceneAction, sceneCompleter, sceneDeserializer);

        homework.loadRules();
    },
    Scene: Scene
};
