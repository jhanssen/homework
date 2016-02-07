/*global module,require,__dirname*/
const os = require("os");
const path = require("path");
const fs = require("fs");
const Console = require("./console.js");

const modules = {
    _homework: undefined,
    _modules: [],

    init: function(homework) {
        this._homework = homework;

        // load modules in module path
        this._loadBuiltins();
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
                if (typeof m === "object" && "init" in m) {
                    var cfg = this._homework.config ? this._homework.config[module.section] : {};
                    m.init(cfg, this._homework);
                    this._modules.push(m);
                } else {
                    Console.error("unable to load module", module.section);
                }
            }
        });
    },
    _loadBuiltins: function() {
        var modules = path.resolve(__dirname, 'modules');
        fs.readdir(modules, (err, files) => {
            if (err) {
                Console.error("can't find path for builtin modules", err);
                return;
            }
            var total = files.length;
            var dirs = [];
            const done = () => {
                for (var i = 0; i < dirs.length; ++i) {
                    this._loadModule(dirs[i]);
                }
            };
            for (var i = 0; i < files.length; ++i) {
                var file = modules + path.sep + files[i];
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
