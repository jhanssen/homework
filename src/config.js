/*global module,require*/
const os = require("os");
const path = require("path");
const fs = require("fs");
const Console = require("./console.js");

function config(homework, cb)
{
    const file = path.normalize(os.homedir() + path.sep + ".homework.json");
    fs.readFile(file, (err, data) => {
        if (err) {
            Console.error("no config file, consider creating", file);
            cb();
            return;
        }
        try {
            var cfg = JSON.parse(data);
        } catch (e) {
            Console.error("unable to parse config file as JSON", file);
            cb();
            return;
        }
        homework._cfg = cfg;
        cb();
    });
}

module.exports = { load: config };
