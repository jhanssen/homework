/*global module,setTimeout,clearTimeout,setInterval,clearInterval*/

var homework = undefined;

function clone(obj)
{
    var ret = Object.create(null);
    for (var k in obj) {
        ret[k] = obj[k];
    }
    return ret;
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
    this._initOns();
}

Timer.prototype = {
    _funcs: {
        timeout: {
            start: setTimeout,
            stop: clearTimeout
        },
        interval: {
            start: setInterval,
            stop: clearInterval
        }
    },

    _id: undefined,
    _type: undefined,
    _start: undefined,
    _stop: undefined,
    start: function(ms) {
        if (this._id !== undefined)
            this._stop(this._id);
        this._id = this._start(() => { this._emit("fired"); }, ms);
    },
    stop: function() {
        if (this._id !== undefined) {
            this._stop(this._id);
            this._id = undefined;
        }
    },
    destroy: function() {
        this.stop();
        this._emit("destroyed");
    }
};

function Event()
{
    if (arguments.length < 1) {
        throw "Timer event needs one arguments, name";
    }
    if (this._type !== "timeout" && this._type !== "interval") {
        throw "Timer event type mismatch " + this._type;
    }
    const obj = timers[this._type];
    if (!(arguments[0] in obj)) {
        throw "Timer event given a timer name that doesn't exists " + arguments[0];
    }
    this._initOns();
    this._fired = false;
    this._name = arguments[0];
    obj[arguments[0]].on("fired", () => { homework.Console.log("triggering timer event", this._name); this._fired = true; this._emit("triggered"); });
    obj[arguments[0]].on("destroyed", () => { this._emit("cancel"); });
}

Event.prototype = {
    check: function() {
        return this._fired;
    },
    serialize: function() {
        return { type: "TimerEvent" + this._type, name: this._name };
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

function eventCompleter(items)
{
    if (!items)
        return [];

    if (arguments.length === 1) {
        return Object.keys(items);
    }
    // see if this timer exists
    if (!(arguments[1] in items)) {
        return [];
    }
    var args = homework.utils.strip(arguments).slice(1);
    if (args.length === 1) {
        return ["fires"];
    }
    return [];
}

function actionCompleter(items)
{
    if (!items)
        return [];

    if (arguments.length === 1) {
        return Object.keys(items);
    }
    // see if this timer exists
    if (!(arguments[1] in items)) {
        return [];
    }
    var args = homework.utils.strip(arguments).slice(1);
    if (args.length === 1) {
        return ["start", "stop"];
    }
    return [];
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
        timers.create(type, e.name);
        if (type === "timeout")
            event = new TimeoutEvent(e.name);
        else if (type === "interval")
            event = new IntervalEvent(e.name);
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

    init: function(hw)
    {
        homework = hw;
        homework.utils.onify(Timer.prototype);
        homework.utils.onify(TimeoutEvent.prototype);
        homework.utils.onify(TimeoutAction.prototype);
        homework.utils.onify(IntervalEvent.prototype);
        homework.utils.onify(IntervalAction.prototype);

        homework.registerEvent("Timeout", TimeoutEvent, eventCompleter.bind(null, timers.timeout), eventDeserializer.bind(null, "timeout"));
        homework.registerAction("Timeout", TimeoutAction, actionCompleter.bind(null, timers.timeout), actionDeserializer.bind(null, "timeout"));
        homework.registerEvent("Interval", IntervalEvent, eventCompleter.bind(null, timers.interval), eventDeserializer.bind(null, "interval"));
        homework.registerAction("Interval", IntervalAction, actionCompleter.bind(null, timers.interval), actionDeserializer.bind(null, "interval"));

        homework.loadRules();
    },
    names: function(type)
    {
        if (type !== "timeout" && type !== "interval")
            return [];
        return Object.keys(this[type]);
    },
    create: function(type, name)
    {
        if (type !== "timeout" && type !== "interval")
            return null;
        if (name in this[type])
            return null;
        var t = new Timer(type);
        this[type][name] = t;
        return t;
    },
    destroy: function(type, name)
    {
        if (type !== "timeout" && type !== "interval")
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