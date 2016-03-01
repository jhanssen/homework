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

        let last = undefined;
        cfg.claps.forEach((clap) => {
            const count = clap.count || 1;
            if (!clap.delay)
                clap.delay = 2000;
            if (!clap.throttle)
                clap.throttle = clap.delay * 2;
            let dev = new homework.Device(homework.Device.Type.Clapper, `clapper:${count}`);
            if (!dev.name)
                dev.name = clap.name || dev.uuid;
            let val = new homework.Device.Value("clap");
            val._valueType = "boolean";
            val.update(false);
            dev.addValue(val);
            homework.addDevice(dev);

            var trigger = () => {
                var now = Date.now();
                if (last == undefined || (now - last) >= clap.throttle) {
                    last = now;
                    val.trigger();
                } else {
                    last = now; // set even if we're too close
                }
            };

            if (count == 1) {
                clapDetector.onClap(trigger);
            } else {
                clapDetector.onClaps(count, clap.delay, trigger);
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
