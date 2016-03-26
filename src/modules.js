/*global module,require,__dirname,process*/

"use strict";

const os = require("os");
const path = require("path");
const tilde = require('tilde-expansion');
const fs = require("fs");
const Console = require("./console.js");

// this function lifted from https://github.com/nfarina/homebridge/blob/master/lib/plugin.js
function getDefaultPaths() {
    var win32 = process.platform === 'win32';
    var paths = [];

    // add the paths used by require()
    paths = paths.concat(require.main.paths);

    // THIS SECTION FROM: https://github.com/yeoman/environment/blob/master/lib/resolver.js

    // Adding global npm directories
    // We tried using npm to get the global modules path, but it haven't work out
    // because of bugs in the parseable implementation of `ls` command and mostly
    // performance issues. So, we go with our best bet for now.
    if (process.env.NODE_PATH) {
        paths = process.env.NODE_PATH.split(path.delimiter)
            .filter(function(p) { return !!p; }) // trim out empty values
            .concat(paths);
    } else {
        // Default paths for each system
        if (win32) {
            paths.push(path.join(process.env.APPDATA, 'npm/node_modules'));
        } else {
            paths.push('/usr/local/lib/node_modules');
            paths.push('/usr/lib/node_modules');
        }
    }

    return paths;
}

const modules = {
    _homework: undefined,
    _moduledata: undefined,
    _modules: [],

    init: function(homework, data) {
        this._homework = homework;
        this._moduledata = data;

        // load modules in path
        const loadModules = (cur) => {
            if (!fs.existsSync(cur))
                return;
            const candidates = fs.readdirSync(cur);
            for (var c = 0; c < candidates.length; ++c) {
                if (candidates[c].substr(0, 9) == "homework-") {
                    // it's a candidate, try to load it
                    const dir = path.join(cur, candidates[c]);
                    if (!fs.statSync(dir).isDirectory())
                        continue;
                    const pfile = path.join(dir, "package.json");
                    var json;
                    try {
                        json = JSON.parse(fs.readFileSync(pfile));
                    } catch (e) {
                        Console.error(`tried to load ${pfile} but couldn't parse as JSON`);
                    }
                    if (typeof json !== "object")
                        continue;
                    if (json.name.substr(0, 9) != "homework-") {
                        Console.error(`package ${pfile} has an invalid name of ${json.name}`);
                        continue;
                    }
                    if (!json.keywords || json.keywords.indexOf("homework-plugin") == -1) {
                        Console.error(`package ${pfile} does not have homework-plugin as a keyword`);
                        continue;
                    }
                    this._loadModule(dir);
                }
            }
        };

        const paths = getDefaultPaths();
        paths.forEach(loadModules, this);
    },
    shutdown: function(cb) {
        var rem = this._modules.length;
        var moduledata = Object.create(null);
        if (!rem)
            cb(moduledata);
        for (var i = 0; i < this._modules.length; ++i) {
            let mod = this._modules[i];
            mod.shutdown((data) => {
                if (data)
                    moduledata[mod.name] = data;
                if (!--rem) {
                    cb(moduledata);
                }
            });
        }
    },

    get modules() {
        return this._modules;
    },

    _loadModule: function(module) {
        Console.log("loading module", module);
        // load index.json with the appropriate config section
        var m;
        try {
            m = require(module);
        } catch (e) {
            Console.error(`couldn't load module ${module}: ${e}`);
            return;
        }

        const data = this._moduledata ? this._moduledata[m.name] : {};
        const cfg = this._homework.config ? this._homework.config[m.name] : {};

        if (m.init(cfg, data, this._homework)) {
            this._modules.push(m);
        } else {
            Console.error(`couldn't initialize module ${module}`);
        }
    }
};

module.exports = modules;
