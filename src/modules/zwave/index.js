/*global require,module*/

var ozwshared = undefined;
var ozw = undefined;
var homework = undefined;
var Console = undefined;
const values = Object.create(null);
const devices = Object.create(null);
const classes = require("./classes.js");

const zwave = {
    port: undefined,
    init: function(cfg, hw) {
        if (typeof cfg === "object" && cfg.port) {
            homework = hw;
            Console = hw.Console;

            ozwshared = require("openzwave-shared");
            ozw = new ozwshared({ ConsoleOutput: false });

            classes.init(hw, ozw, cfg);

            ozw.on('driver ready', (homeid) => {
            });
            ozw.on('driver failed', () => {
            });
            ozw.on('scan complete', () => {
                Console.log("scan complete");
            });
            ozw.on('node added', (nodeid) => {
                Console.log("node added", nodeid);
            });
            ozw.on('node naming', (nodeid, nodeinfo) => {
                Console.log("node naming", nodeid, nodeinfo);
            });
            ozw.on('node available', (nodeid, nodeinfo) => {
                Console.log("node available", nodeid, nodeinfo);
            });
            ozw.on('node ready', (nodeid, nodeinfo) => {
                Console.log("node ready", nodeid, nodeinfo);
                var dev = classes.createDevice(nodeid, nodeinfo, values[nodeid]);
                if (dev) {
                    devices[nodeid] = dev;
                    delete values[nodeid];
                } else {
                    Console.log("couldn't create device", nodeinfo);
                }
            });
            ozw.on('node event', (nodeid, event, valueId) => {
                Console.log("node event", nodeid, event, valueId);
            });
            ozw.on('node removed', (nodeid) => {
            });
            ozw.on('node reset', (nodeid, event, notif) => {
            });
            ozw.on('polling enabled', (nodeid) => {
            });
            ozw.on('polling enabled', (nodeid) => {
            });
            ozw.on('scene event', (nodeid, sceneid) => {
            });
            ozw.on('value added', (nodeid, commandclass, valueId) => {
                Console.log("value added for", nodeid, commandclass, valueId);
                if (nodeid in devices) {
                    devices[nodeid].addValue(valueId);
                } else {
                    if (!(nodeid in values)) {
                        values[nodeid] = Object.create(null);
                    }
                    values[nodeid][valueId.value_id] = valueId;
                }
            });
            ozw.on('value changed', (nodeid, commandclass, valueId) => {
                Console.log("value changed for", nodeid, commandclass, valueId);
                if (nodeid in devices) {
                    devices[nodeid].changeValue(valueId);
                } else {
                    if (!(nodeid in values)) {
                        values[nodeid] = Object.create(null);
                    }
                    values[nodeid][valueId.value_id] = valueId;
                }
            });
            ozw.on('value refreshed', (nodeid, commandclass, valueId) => {
                Console.log("value refreshed for", nodeid, commandclass, valueId);
            });
            ozw.on('value removed', (nodeid, commandclass, instance, index) => {
                // silly API
                const key = nodeid + "-" + commandclass + "-" + instance + "-" + index;
                if (nodeid in devices) {
                    devices[nodeid].removeValue(key);
                } else {
                    if (!(nodeid in values)) {
                        values[nodeid] = Object.create(null);
                    }
                    delete values[nodeid][key];
                }
            });
            ozw.on('controller command', (nodeId, ctrlState, ctrlError, helpmsg) => {
            });
            Console.log("initing zwave", cfg.port);
            ozw.connect(cfg.port);
            this.port = cfg.port;
        }
    },
    shutdown: function(cb) {
        if (this.port)
            ozw.disconnect(this.port);
        cb();
    }
};

module.exports = zwave;
