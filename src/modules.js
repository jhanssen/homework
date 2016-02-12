/*global module,require,__dirname*/

"use strict";

const os = require("os");
const path = require("path");
const tilde = require('tilde-expansion');
const fs = require("fs");
const Console = require("./console.js");

const modules = {
    _homework: undefined,
    _moduledata: undefined,
    _modules: [],
    _pending: [],

    init: function(homework, path, data) {
        this._homework = homework;
        this._moduledata = data;

        // load modules in module path
        this._loadBuiltins();

        // load modules in path
        if (!(typeof path === "string"))
            return;
        var paths = path.split(':');
        for (var p = 0; p < paths.length; ++p) {
            tilde(paths[p], (path) => {
                this._loadPath(path);
            });
        }
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
        //Console.log("loading module", module);
        // load index.json with the appropriate config section
        var idx = module.path + path.sep + "index.js";
        fs.stat(idx, (err, stat) => {
            if (!err && (stat.isFile() || stat.isSymbolicLink())) {
                var m = require(idx);
                if (typeof m === "object" && "init" in m && "name" in m) {
                    var data = this._moduledata ? this._moduledata[m.name] : {};
                    var cfg = this._homework.config ? this._homework.config[m.name] : {};
                    m.init(cfg, data, this._homework);
                    this._modules.push(m);
                } else {
                    Console.error("unable to load module", module.section);
                }
            } else {
                Console.error("no module at", idx);
            }
        });
    },
    _loadBuiltins: function() {
        var modules = path.resolve(__dirname, 'modules');
        this._loadPath(modules);
    },
    _loadPath: function(arg) {
        //Console.log("loading path", arg);
        if (arg) {
            this._pending.push(arg);
        } else if (this._pending.length > 0) {
            arg = this._pending[0];
            this._pending.splice(0, 1);
        } else {
            return;
        }
        if (this._pending.length > 1)
            return;
        fs.readdir(arg, (err, files) => {
            if (err) {
                Console.error("can't find path", arg, err);
                return;
            }
            var total = files.length;
            var dirs = [];
            const done = () => {
                for (var i = 0; i < dirs.length; ++i) {
                    this._loadModule(dirs[i]);
                }
                this._loadPath();
            };
            for (var i = 0; i < files.length; ++i) {
                var file = arg + path.sep + files[i];
                if (file[0] === ".")
                    continue;
                fs.stat(file, function(file, section, err, stat) {
                    if (!err && stat.isDirectory()) {
                        dirs.push({ path: file, section: section });
                    }
                    if (!--total)
                        done();
                }.bind(this, file, files[i]));
            }
        });
    }
};

module.exports = modules;
