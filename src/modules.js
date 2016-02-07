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

    _loadModule: function(module) {
        console.log("loading module", module);
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
            var done = () => {
                for (var i = 0; i < dirs.length; ++i) {
                    this._loadModule(dirs[i]);
                }
            };
            for (var i = 0; i < files.length; ++i) {
                var file = modules + path.sep + files[i];
                if (file[0] === ".")
                    continue;
                fs.stat(file, function(file, err, stat) {
                    if (!err && stat.isDirectory()) {
                        dirs.push(file);
                    }
                    if (!--total)
                        done();
                }.bind(this, file));
            }
        });
        console.log(modules);
    }
};

module.exports = modules;
