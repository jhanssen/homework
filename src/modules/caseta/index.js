/*global require,module*/

"use strict";

const bridge = require("./smartbridge.js");

const functions = {
    "dimmer": {
        query: function(integrationid) {
            bridge.query("OUTPUT", integrationid, 1);
        },
        set: function(integrationid, value) {
            bridge.set("OUTPUT", integrationid, 1, value);
        },
        check: function(value) {
            return value >= 0 && value <= 100;
        },

        get hwtype() {
            return caseta.homework.Type.Dimmer;
        }
    }
};

function fullName(dev)
{
    return (dev.floor + " " + dev.room + " " + dev.name);
}

function fixup(obj)
{
    for (var i in obj) {
        if (typeof i === "string") {
            const n = parseInt(i);
            const v = obj[i];
            delete obj[i];
            obj[n] = v;
        }
    }
    return obj;
}

var Console = undefined;

const caseta = {
    _devices: undefined,
    _created: false,
    _homework: undefined,
    _console: undefined,
    _data: undefined,
    _ready: undefined,
    _hwdevices: Object.create(null),

    get name() { return "caseta"; },
    get homework() { return this._homework; },
    get ready() { return this._ready; },

    init: function(cfg, data, homework) {
        if (!cfg || !cfg.devices || !cfg.connection)
            return false;
        homework.utils.onify(this);
        this._initOns();
        this._ready = false;
        this._data = data;
        this._devices = fixup(cfg.devices);
        this._homework = homework;
        Console = homework.Console;
        bridge.on("OUTPUT", (args) => {
            //console.log("output: ", args);
            if (args[1] === "1") {
                var intg = parseInt(args[0]);
                //var dev = this._devices[intg].type;
                var val = parseFloat(args[2]);
                if (intg in this._hwdevices) {
                    var hwdev = this._hwdevices[intg];
                    hwdev.values["level"].update(val);
                }
            }
        });
        bridge.on("ready", () => {
            if (!this._created) {
                this._create();
                this._ready = true;
                this._emit("ready");
            }
        });
        bridge.connect(cfg.connection);
        //Console.log("caseta", cfg);
        return true;
    },
    shutdown: function(cb) {
        if (this._homework)
            bridge.close();
        var data = this._data || Object.create(null);
        // for (var id in this._hwdevices) {
        //     data[id] = this._hwdevices[id].uuid;
        // }
        cb(data);
    },

    _create: function() {
        this._created = true;
        for (let id in this._devices) {
            let dev = this._devices[id];
            var uuid = "caseta:" + id;
            // if (typeof this._data === "object" && id in this._data)
            //     uuid = this._data[id];
            let func = functions[dev.type];
            let hwdev = new this._homework.Device(func.hwtype, uuid);
            if (!hwdev.name)
                hwdev.name = fullName(dev);
            let hwval = new this._homework.Device.Value("level", { off: 0, on: 100 }, [0, 100]);
            hwval._valueUpdated = function(v) {
                if (func.check(v)) {
                    func.set(id, v);
                } else {
                    Console.error("caseta: value out of range", hwval.raw);
                }
            };
            hwval._valueType = "number";
            hwdev.addValue(hwval);
            func.query(id);

            Console.log("created caseta", dev.type, hwdev.name);

            this._hwdevices[id] = hwdev;
            this._homework.addDevice(hwdev);
        }
        this._homework.loadRules();
        Console.log("caseta initialized");
    }
};

module.exports = caseta;
