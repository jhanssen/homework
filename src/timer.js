/*global module,setTimeout,clearTimeout,setInterval,clearInterval,require*/

const nodeschedule = require("node-schedule");
const suncalc = require("suncalc");

var homework = undefined;
var utils = undefined;
var location = {
    latitude: undefined,
    longitude: undefined
};

function caseify(s)
{
    if (typeof s !== "string" || s.length < 2)
        return s;
    return s[0].toUpperCase() + s.substr(1).toLowerCase();
}

function clone(obj)
{
    var ret = Object.create(null);
    for (var k in obj) {
        ret[k] = obj[k];
    }
    return ret;
}

function createDate(d, adj, set)
{
    const adjust = function(date, adj) {
        const keys = {
            time: { set: "setTime", get: "getTime" },
            day: { set: "setDate", get: "getDate" },
            hour: { set: "setHours", get: "getHours" },
            minute: { set: "setMinutes", get: "getMinutes" },
            year: { set: "setFullYear", get: "getFullYear" },
            month: { set: "setMonth", get: "getMonth" },
            second: { set: "setSeconds", get: "getSeconds" },
            ms: { set: "setMilliseconds", get: "getMilliseconds" }
        };
        for (var k in keys) {
            if (k in adj && keys[k].set in date && keys[k].get in date) {
                if (set)
                    date[keys[k].set](adj[k]);
                else
                    date[keys[k].set](date[keys[k].get]() + adj[k]);
            }
        }
        return date;
    };

    var dt;
    if (typeof d === "string") {
        switch (d) {
        case "sunset":
        case "sunrise":
            if (location.latitude === undefined || location.longitude === undefined) {
                throw "Need location.latitude and location.longitude set in config";
            }
            dt = suncalc.getTimes(new Date(), location.latitude, location.longitude);
            if (adj) {
                adjust(dt[d], adj);
                if (dt[d].getTime() === dt[d].getTime()) {
                    return dt[d];
                }
                return undefined;
            }
            return dt[d];
        default:
            dt = new Date(d);
            if (adj)
                adjust(dt, adj);
            if (dt.getTime() === dt.getTime())
                return dt;
            return undefined;
        }
    } else if (typeof d === "object") {
        if (d instanceof Date) {
            if (adj)
                adjust(d, adj);
            if (d.getTime() === d.getTime())
                return d;
            return undefined;
        }
        dt = adjust(new Date(), d);
        if (dt.getTime() === dt.getTime())
            return dt;
    }
    return undefined;
}

function Timer(type)
{
    var f = this._funcs[type];
    if (f === undefined) {
        throw "Invalid timer " + type;
    }
    this._type = type;
    this._id = undefined;
    this._start = f.start;
    this._stop = f.stop;
    this._single = f.single;
    this._state = "idle";
    this._started = undefined;
    this._timeout = undefined;
    this._initOns();
}

Timer.prototype = {
    _funcs: {
        timeout: {
            start: setTimeout,
            stop: clearTimeout,
            single: true
        },
        interval: {
            start: setInterval,
            stop: clearInterval,
            single: false
        }
    },

    _id: undefined,
    _type: undefined,
    _start: undefined,
    _stop: undefined,
    _single: undefined,
    _state: undefined,
    _started: undefined,
    _timeout: undefined,

    start: function(ms) {
        if (this._id !== undefined)
            this._stop(this._id);
        this._state = "running";
        this._started = Date.now();
        this._timeout = ms;
        this._id = this._start(() => {
            this._emit("fired");
            if (this._single) {
                this._id = undefined;
                this._state = "idle";
                this._started = undefined;
            } else {
                this._started = Date.now();
            }
        }, ms);
    },
    stop: function() {
        if (this._id !== undefined) {
            this._stop(this._id);
            this._state = "idle";
            this._id = undefined;
        }
    },
    destroy: function() {
        this.stop();
        this._emit("destroyed");
    },

    get state() { return this._state; },
    get started() { return this._started; },
    get single() { return this._single; },
    get timeout() { return this._timeout; }
};

function Schedule(val)
{
    if (arguments.length !== 1) {
        throw "Schedule needs one argument, spec";
    }
    this._init(val);
    this._initOns();
}

Schedule.prototype = {
    _job: undefined,
    _date: undefined,

    get date() { return this._date; },
    set date(spec) { this.stop(); this._init(spec); },

    stop: function() {
        if (this._job) {
            this._job.cancel();
            this._job = undefined;
        }
    },
    destroy: function() {
        this.stop();
        this._emit("destroyed");
    },

    _init: function(val) {
        this._job = nodeschedule.scheduleJob(val, () => { this._emit("fired"); });
        if (!this._job) {
            if (typeof val === "string") {
                var date = new Date(val);
                // Fun fact, NaN === NaN returns false
                if (date.getTime() === date.getTime()) {
                    this._job = nodeschedule.scheduleJob(date, () => { this._emit("fired"); });
                } else {
                    // might be a sunset/sunrise thing
                    this._createSpecial(val);
                }
            }
            if (!this._job)
                throw "Couldn't schedule job " + JSON.stringify(val);
        }
        this._date = val;
    },

    _createSpecial: function(val) {
        this.stop();

        var now = new Date();
        var date = createDate(val);
        if (date) {
            if (now.getTime() + 10000 > date.getTime()) {
                date = createDate(val, { day: 1 }, false);
                if (date && now < date) {
                    this._job = nodeschedule.scheduleJob(date, () => {
                        this._emit("fired");
                        this._createSpecial(val);
                    });
                }
            } else {
                this._job = nodeschedule.scheduleJob(date, () => {
                    this._emit("fired");
                    this._createSpecial(val);
                });
            }
        }
    }
};

function Event()
{
    if (arguments.length < 1) {
        throw "Timer event needs one arguments, name";
    }
    if (this._type !== "timeout" && this._type !== "interval" && this._type !== "schedule") {
        throw "Timer event type mismatch " + this._type;
    }
    const obj = timers[this._type];
    if (!(arguments[0] in obj)) {
        throw "Timer event given a timer name that doesn't exists " + arguments[0];
    }
    this._initOns();
    this._fired = false;
    this._name = arguments[0];

    const tt = obj[arguments[0]];
    if (this._type === "schedule") {
        this._date = tt.date;
    } else {
        this._date = undefined;
    }
    tt.on("fired", () => { homework.Console.log("triggering timer event", this._name); this._fired = true; this._emit("triggered"); });
    tt.on("destroyed", () => { this._emit("cancel"); });
}

Event.prototype = {
    _date: undefined,

    check: function() {
        return this._fired;
    },
    serialize: function() {
        return { type: "TimerEvent" + this._type, name: this._name, date: this._date };
    },
    format: function() {
        var ret = [caseify(this._type), this._name];
        if (this._type == "schedule")
            ret.push(this._date);
        return ret;
    }
};

function TimeoutEvent()
{
    Event.apply(this, arguments);
}

TimeoutEvent.prototype = clone(Event.prototype);
TimeoutEvent.prototype._type = "timeout";

function IntervalEvent()
{
    Event.apply(this, arguments);
}

IntervalEvent.prototype = clone(Event.prototype);
IntervalEvent.prototype._type = "interval";

function ScheduleEvent()
{
    Event.apply(this, arguments);
}

ScheduleEvent.prototype = clone(Event.prototype);
ScheduleEvent.prototype._type = "schedule";

function RangeEvent(start, end)
{
    if (arguments.length !== 2) {
        throw "RangeEvent needs two arguments, start and end";
    }

    const fromJSON = function(a) {
        if (typeof a === "object") {
            return a;
        } else if (typeof a === "string") {
            var ret;
            try {
                ret = JSON.parse(a);
            } catch (e) {
                return a;
            }
            return ret;
        }
        return undefined;
    };
    const allowed = function(a) {
        if (typeof a === "object")
            return true;
        switch (a) {
        case "sunrise":
        case "sunset":
            return true;
        }
        return false;
    };

    start = fromJSON(start);
    end = fromJSON(end);
    if (!allowed(start)) {
        throw "RangeEvent start is not allowed: " + JSON.stringify(start);
    }
    if (!allowed(end)) {
        throw "RangeEvent end is not allowed: " + JSON.stringify(end);
    }

    var d1 = createDate(start);
    var d2 = createDate(end);
    if (d1 && d1 instanceof Date && d2 && d2 instanceof Date) {
        this._start = start;
        this._end = end;
        if (d1 > d2) {
            this._endAdjust = { day: 1 };
        } else {
            this._endAdjust = undefined;
        }
        this._initOns();
    } else {
        throw "RangeEvent needs two date arguments";
    }
}

RangeEvent.prototype = {
    _start: undefined,
    _end: undefined,
    _endAdjust: undefined,

    check: function() {
        var d1 = createDate(this._start);
        var d2 = createDate(this._end, this._endAdjust, false);
        var now = new Date();
        // console.log("checking range1", now);
        // console.log("checking range2", d1, this._start);
        // console.log("checking range3", d2, this._end, this._endAdjust);
        if (now < d1 && now < d2) {
            // try to adjust -1 but only if the end date is one day past and current is the same day as start
            if (now.getDate() == d1.getDate() && now.getDate() + 1 == d2.getDate()) {
                d1 = createDate(this._start, { day: -1 }, false);
                var adj = this._endAdjust ? clone(this._endAdjust) : Object.create(null);
                if (!("day" in adj)) {
                    adj.day = -1;
                } else {
                    adj.day -= 1;
                }

                d1 = createDate(this._start, { day: -1 }, false);
                d2 = createDate(this._end, adj, false);
                // console.log("checking again range1", now);
                // console.log("checking again range2", d1, this._start);
                // console.log("checking again range3", d2, this._end, this._endAdjust);
            }
        }
        return d1 <= now && d2 >= now;
    },
    serialize: function() {
        return { type: "TimeRangeEvent", start: this._start, end: this._end };
    },
    format: function() {
        return ["TimeRange", this._start, this._end];
    }
};

function Action()
{
    if (arguments.length < 2) {
        throw "Timer action needs at least two arguments, name and action";
    }
    if (this._type !== "timeout" && this._type !== "interval") {
        throw "Timer action argument mismatch " + this._type;
    }
    if (arguments[1] !== "start" && arguments[1] !== "stop") {
        throw "Timer action needs to be start or stop";
    }
    if (arguments[1] === "start" && arguments.length !== 3) {
        throw "Timer action start needs three arguments, name, action and timeout";
    }
    const obj = timers[this._type];
    if (!(arguments[0] in obj)) {
        throw "Timer action given a timer name that doesn't exists " + arguments[0];
    }
    this._initOns();
    obj[arguments[0]].on("destroyed", () => { this._emit("cancel"); });
    this._name = arguments[0];
    this._action = arguments[1];
    if (arguments.length === 3)
        this._timeout = arguments[2];
    this._timer = obj[arguments[0]];
}

Action.prototype = {
    trigger: function() {
        homework.Console.log("trigger timer action", this._action, this._timeout);
        switch (this._action) {
        case "stop":
            this._timer.stop();
            break;
        case "start":
            this._timer.start(parseInt(this._timeout));
            break;
        }
    },
    serialize: function() {
        return { type: "TimerAction" + this._type, name: this._name, action: this._action, arg: this._timeout };
    },
    format: function() {
        var ret = [caseify(this._type), this._name, this._action];
        if (this._timeout !== undefined)
            ret.push(this._timeout);
        return ret;
    }
};

function TimeoutAction()
{
    Action.apply(this, arguments);
}

TimeoutAction.prototype = clone(Action.prototype);
TimeoutAction.prototype._type = "timeout";

function IntervalAction()
{
    Action.apply(this, arguments);
}

IntervalAction.prototype = clone(Action.prototype);
IntervalAction.prototype._type = "interval";

function rangeEventCompleter()
{
    // ### complete on dates?
    return { type: "string", values: ["sunrise", "sunset"] };
}

function rangeEventDeserializer(e)
{
    if (!(typeof e === "object"))
        return null;

    if (e.type !== "TimeRangeEvent")
        return null;

    var event;
    try {
        event = new RangeEvent(e.start, e.end);
    } catch (e) {
        return null;
    }
    return event;
}

function eventCompleter(items)
{
    if (!items)
        return { values: [] };

    if (arguments.length === 1) {
        return { type: "array", values: Object.keys(items) };
    }
    // see if this timer exists
    if (!(arguments[1] in items)) {
        return { values: [] };
    }
    var args = utils.strip(arguments).slice(1);
    if (args.length === 1) {
        return { type: "array", values: ["fires"] };
    }
    return { values: [] };
}

function scheduleEventCompleter()
{
    if (!timers.schedule)
        return { values: [] };

    if (arguments.length === 0) {
        return { type: "array", values: Object.keys(timers.schedule) };
    }
    // see if this timer exists
    if (!(arguments[0] in timers.schedule)) {
        return { values: [] };
    }
    var args = utils.strip(arguments).slice(1);
    if (args.length === 0) {
        return { type: "string", values: ["sunrise", "sunset"] };
    }
    return { values: [] };
}

function actionCompleter(items)
{
    if (!items)
        return { values: [] };

    if (arguments.length === 1) {
        return { type: "array", values: Object.keys(items) };
    }
    // see if this timer exists
    if (!(arguments[1] in items)) {
        return { values: [] };
    }
    var args = utils.strip(arguments).slice(1);
    if (args.length === 1) {
        return { type: "array", values: ["start", "stop"] };
    }
    if (args.length === 2 && args[1] === "start") {
        return { type: "number", values: [] };
    }
    return { values: [] };
}

function eventDeserializer(type, e)
{
    if (!(typeof e === "object"))
        return null;

    if (e.type !== "TimerEvent" + type)
        return null;

    var event;
    try {
        // create the timer now if it doesn't exist
        timers.create(type, e.name, e.date);
        if (type === "timeout")
            event = new TimeoutEvent(e.name);
        else if (type === "interval")
            event = new IntervalEvent(e.name);
        else if (type === "schedule")
            event = new ScheduleEvent(e.name);
    } catch (e) {
        return null;
    }
    return event;
}

function actionDeserializer(type, e)
{
    if (!(typeof e === "object"))
        return null;

    if (e.type !== "TimerAction" + type)
        return null;

    var event;
    try {
        // create the timer now if it doesn't exist
        timers.create(type, e.name);
        if (type === "timeout")
            event = new TimeoutAction(e.name, e.action, e.arg);
        else if (type === "interval")
            event = new IntervalAction(e.name, e.action, e.arg);
    } catch (e) {
        return null;
    }
    return event;
}

const timers = {
    timeout: Object.create(null),
    interval: Object.create(null),
    schedule: Object.create(null),

    init: function(hw)
    {
        homework = hw;
        utils = hw.utils;
        const cfg = hw.config;
        if ("location" in cfg) {
            if ("latitude" in cfg.location && "longitude" in cfg.location) {
                location.latitude = cfg.location.latitude;
                location.longitude = cfg.location.longitude;
            } else {
                throw "need latitude and longitude in config";
            }
        }

        utils.onify(Timer.prototype);
        utils.onify(Schedule.prototype);
        utils.onify(TimeoutEvent.prototype);
        utils.onify(TimeoutAction.prototype);
        utils.onify(IntervalEvent.prototype);
        utils.onify(IntervalAction.prototype);
        utils.onify(ScheduleEvent.prototype);
        utils.onify(RangeEvent.prototype);

        homework.registerEvent("Timeout", TimeoutEvent, eventCompleter.bind(null, timers.timeout), eventDeserializer.bind(null, "timeout"));
        homework.registerAction("Timeout", TimeoutAction, actionCompleter.bind(null, timers.timeout), actionDeserializer.bind(null, "timeout"));
        homework.registerEvent("Interval", IntervalEvent, eventCompleter.bind(null, timers.interval), eventDeserializer.bind(null, "interval"));
        homework.registerAction("Interval", IntervalAction, actionCompleter.bind(null, timers.interval), actionDeserializer.bind(null, "interval"));

        homework.registerEvent("Schedule", ScheduleEvent, scheduleEventCompleter, eventDeserializer.bind(null, "schedule"));

        homework.registerEvent("TimeRange", RangeEvent, rangeEventCompleter, rangeEventDeserializer);

        homework.loadRules();
    },
    names: function(type)
    {
        if (type !== "timeout" && type !== "interval" && type !== "schedule")
            return [];
        return Object.keys(this[type]);
    },
    create: function(type, name)
    {
        if (type !== "timeout" && type !== "interval" && type !== "schedule")
            return null;
        if (name in this[type])
            return null;
        var t;
        if (type === "schedule") {
            if (arguments.length < 3)
                return null;
            t = new Schedule([].slice.apply(arguments).slice(2).join(" "));
            this.schedule[name] = t;
        } else {
            t = new Timer(type);
            this[type][name] = t;
        }
        return t;
    },
    destroy: function(type, name)
    {
        if (type !== "timeout" && type !== "interval" && type !== "schedule")
            return false;
        if (name in this[type]) {
            this[type][name].destroy();
            delete this[type][name];
            return true;
        }
        return false;
    }
};

module.exports = timers;
