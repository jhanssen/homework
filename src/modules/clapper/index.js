/*global require, module, setTimeout*/

"use strict";

const clapDetector = require("clap-detector");

module.exports = {
    get name() { return "clapper"; },
    get ready() { return true; },

    init: function(cfg, data, homework) {
        if (!cfg || !cfg.device || !(cfg.claps instanceof Array) || !cfg.claps.length) {
            return false;
        }

        var clapConfig = {
            AUDIO_SOURCE: cfg.device // default is 'alsa hw:1,0'
        };

        // Start clap detection
        clapDetector.start(clapConfig);

        cfg.claps.forEach((clap) => {
            const count = clap.count || 1;
            let dev = new homework.Device(homework.Device.Type.Clapper, `clapper:${count}`);
            if (!dev.name)
                dev.name = clap.name || dev.uuid;
            let val = new homework.Device.Value("clap");
            val._valueType = "boolean";
            val.update(false);
            dev.addValue(val);
            homework.addDevice(dev);

            if (count == 1) {
                clapDetector.onClap(() => {
                    val.trigger();
                });
            } else {
                clapDetector.onClaps(count, clap.delay || 2000, (delay) => {
                    val.trigger();
                });
            }
        });

        homework.utils.onify(this);
        this._initOns();
        return true;
    },
    shutdown: function(cb) {
        cb();
    }
};
