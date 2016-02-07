/*global require,module*/

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
    _hwdevices: Object.create(null),

    init: function(cfg, homework) {
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
            }
        });
        bridge.connect(cfg.connection);
        //Console.log("caseta", cfg);
    },

    _create: function() {
        this._created = true;
        for (var id in this._devices) {
            var dev = this._devices[id];
            var hwdev = new this._homework.Device(fullName(dev));
            var hwval = new this._homework.Device.Value("level", { off: 0, on: 100 }, [0, 100]);
            var data = {
                integrationid: id,
                functions: functions[dev.type],
                value: hwval,
                log: function() {
                    Console.error.apply(null, arguments);
                }.bind(this)
            };
            hwval._valueUpdated = function() {
                if (this.functions.check(this.value.raw)) {
                    this.functions.set(this.integrationid, this.value.raw);
                } else {
                    this.log("caseta: value out of range", this.value.raw);
                }
            }.bind(data);
            hwdev.addValue(hwval);
            Console.log("created caseta", dev.type, hwdev.name);

            data.functions.query(id);

            this._hwdevices[id] = hwdev;
            this._homework.addDevice(hwdev);
            this._homework.loadRules();
        }
        Console.log("caseta initialized");
    }
};

module.exports = caseta;
