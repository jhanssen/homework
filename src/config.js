/*global module,require,process*/
const os = require("os");
const path = require("path");
const fs = require("fs");
const Console = require("./console.js");
const cfgpath = path.join(os.homedir(), ".homework");

function safeIsDirectory(p)
{
    // fuck node, seriously
    try {
        return fs.statSync(p).isDirectory();
    } catch (e) {
        return false;
    }
}

function safeMkdir(p)
{
    try {
        fs.mkdirSync(p);
    } catch (e) {
    }
}

if (!safeIsDirectory(cfgpath)) {
    safeMkdir(cfgpath);
    if (!safeIsDirectory(cfgpath)) {
        console.error(`couldn't mkdir ${cfgpath}`);
        process.exit();
    }
}

function config(homework, cb)
{
    const file = path.normalize(path.join(cfgpath, "homework.json"));
    fs.readFile(file, (err, data) => {
        if (err) {
            Console.error("no config file, consider creating", file);
            homework._cfg = {};
            cb();
            return;
        }
        try {
            var cfg = JSON.parse(data);
        } catch (e) {
            Console.error("unable to parse config file as JSON", file);
            homework._cfg = {};
            cb();
            return;
        }
        homework._cfg = cfg;
        cb();
    });
}

module.exports = { load: config, path: cfgpath };
