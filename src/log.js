/*global module,process,stream,require*/

"use strict";

const fs = require("fs");
const util = require("util");
const EventEmitter = require("events");

function moveFile(from, to, cb)
{
    var source = fs.createReadStream(from);
    var dest = fs.createWriteStream(to);

    source.pipe(dest);
    source.on('end', function() {
        fs.unlinkSync(from);
        cb(null);
    });
    source.on('error', function(err) { cb(err); });
}

function Log(opts)
{
    this._logs = [];
    this._state = Log.State.Closed;
    this._level = Number.MAX_SAFE_INTEGER;
    if (typeof opts == "function") {
        this._stream = opts;
        this.reopen();
    } else if (typeof opts == "object") {
        if ("path" in opts || "stream" in opts || "level" in opts) {
            this._path = opts.path;
            this._stream = opts.stream;
            this._level = opts.level;
            if (this._level == undefined || this._level < 0)
                this._level = Number.MAX_SAFE_INTEGER;
            this.reopen();
        } else {
            throw new Error("Unrecognized object passed to Log constructor");
        }
    }

    EventEmitter.call(this);
};

function argToString(a)
{
    if (typeof a == "string")
        return a;
    try {
        return JSON.stringify(a);
    } catch (e) {
        return `not able to stringify: ${e}`;
    }
}

Log.State = { Closed: 1, Opening: 2, Open: 3 };

Log.prototype = {
    _path: undefined,
    _level: undefined,
    _oldpath: undefined,
    _fd: undefined,
    _stream: undefined,
    _state: undefined,
    _logs: undefined,

    get path() { return this._path; },
    set path(p) { this._oldpath = this._path; this._path = p; this.reopen(); },

    get stream() { return this._stream; },
    set stream(s) { this._stream = s; this.reopen(); },

    get level() { return this._level; },
    set level(l) { this._level = l; if (this._level == undefined || this._level < 0) this._level = Number.MAX_SAFE_INTEGER; },

    get state() { return this._state; },
    get logs() { return this._logs; },

    log: function(opts) {
        // logs arguments with optional opts
        let start = 0;
        let level = 0;
        let area = "";
        if (opts instanceof Object) {
            let keys = Object.keys(opts);
            if (keys.length == 1) {
                if (this._checkLevel(opts)) {
                    start = 1;
                    level = opts.level;
                }
                if (this._checkArea(opts)) {
                    start = 1;
                    area = opts.area;
                }
            } else if (keys.length == 2) {
                if (this._checkLevel(opts) && this._checkArea(opts)) {
                    start = 1;
                    level = opts.level;
                    area = opts.area;
                }
            }
        }
        var args = [].slice.call(arguments, start);
        if (this._stream && level <= this._level) {
            this._stream.apply(this._stream, args);
        }
        var l = [level, area];
        for (var i = 0; i < args.length; ++i) {
            var str = argToString(args[i]);
            if (this._fd)
                fs.write(this._fd, str);
            l.push(str);
        }
        this._logs.push(l);
        if (this._fd)
            fs.write(this._fd, "\n");

        this.emit("log", l);
    },

    close: function() {
        if (this._fd) {
            fs.closeSync(this._fd);
            this._fd = undefined;
        }
        this._state = Log.State.Closed;
    },

    reopen: function() {
        if (this._fd) {
            if (this.state == Log.State.Opening) {
                // in the process of reopening
                return;
            }
            fs.closeSync(this._fd);
            this._state = Log.State.Opening;
            // move oldpath to oldpath.<number>
            let n = 1;
            for (;;) {
                try {
                    fs.accessSync(`${this._oldpath}.${n}`, fs.F_OK);
                } catch (e) {
                    ++n;
                    continue;
                }
                let p = this._oldpath;
                this._oldpath = undefined;
                moveFile(p, `${p}.${n}`, (err) => {
                    if (err) {
                        console.error(`error copying ${p} to ${p}.${n}`);
                    }
                    this._fd = undefined;
                    this._state = Log.State.Closed;
                    this.reopen();
                });
                return;
            }
        }
        if (this._path) {
            // if the file already exists, move it
            if (this.state == Log.State.Opening)
                return;
            this._state = Log.State.Opening;
            let p = this._path;
            try {
                fs.accessSync(p, fs.F_OK);
            } catch (e) {
                let n = 1;
                for (;;) {
                    try {
                        fs.accessSync(`${p}.${n}`, fs.F_OK);
                    } catch (e) {
                        ++n;
                        continue;
                    }
                    moveFile(p, `${p}.${n}`, (err) => {
                        if (err) {
                            console.error(`error copying ${p} to ${p}.${n}`);
                        }
                        this._state = Log.State.Closed;
                        this.reopen();
                    });
                    return;
                }
            }
            this._state = Log.State.Open;
            this._fd = fs.openSync(p, "w");
        }
    },

    _checkLevel: function(opts) {
        return ("level" in opts && typeof opts.level == "number");
    },
    _checkArea: function(opts) {
        return ("area" in opts && typeof opts.area == "string");
    }
};

util.inherits(Log, EventEmitter);

module.exports = Log;
