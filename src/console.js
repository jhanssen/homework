/*global module,require,process*/

const utils = require("./utils.js");
const Rule = require("./rule.js");
const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer
});

function lineFixup(line) {
    // replace all consecutive spaces with one space
    return line.replace(/\s+/g, " ");
}

function construct(constructor, args) {
    function F() {
        return constructor.apply(this, args);
    }
    F.prototype = constructor.prototype;
    try {
        var f = new F();
    } catch (e) {
        Console.log("Couldn't create", e);
        return undefined;
    }
    return f;
}

const data = {
    state: [],
    homework: undefined,

    get currentState() {
        return this.state[this.state.length - 1];
    },

    get prompt() {
        return this.currentState.prompt;
    },
    set prompt(p) {
        var s = this.currentState;
        s.prompt = p;
        rl.setPrompt(s.prompt);
    },

    applyState: function() {
        var s = this.currentState;
        rl.setPrompt(s.prompt);
    },
    gotoState: function(pos) {
        while (this.state.length > pos)
            this.state.pop();
    }
};

utils.onify(data);
data._initOns();

const states = {
    default: {
        prompt: "homework> ",
        completions: ["rule ", "shutdown", "device", "eval", "timers", "variables"],
        apply: function(line) {
            if (line === "shutdown") {
                data._emit("shutdown");
                return;
            }
            var elems = line.split(' ').filter((e) => { return e.length > 0; });
            switch (elems[0]) {
            case "rule":
                if (elems.length < 2) {
                    console.log("rule needs a name");
                    return;
                }
                data.state.push(states.rule);
                states.rule._name = elems[1];
                data.applyState();
                break;
            case "device":
                data.state.push(states.device);
                states.device._device = undefined;
                data.applyState();
                break;
            case "eval":
                data.state.push(states.eval);
                data.applyState();
                break;
            case "timers":
                data.state.push(states.timers);
                data.applyState();
                break;
            case "variables":
                data.state.push(states.variables);
                data.applyState();
                break;
            default:
                if (typeof states.default._extraCommands === "object" && elems[0] in states.default._extraCommands) {
                    data.state.push(states.default._extraCommands[elems[0]]);
                    data.applyState();
                    break;
                }
                console.log("unknown command", elems[0]);
                break;
            }
        }
    },
    rule: {
        prompt: "rule> ",
        completions: ["if", "home", "shutdown"],
        apply: function(line) {
            switch (line) {
            case "if":
                data.state.push(states.ruleif);
                data.applyState();
                break;
            case "home":
                data.gotoState(1);
                data.applyState();
                break;
            case "shutdown":
                data._emit("shutdown");
                break;
            }
        },

        _name: undefined,
        _mode: "event",
        _events: [[]],
        _actions: [],
        _clear: function() {
            this._name = undefined;
            this._mode = "event";
            this._events = [[]];
            this._actions = [];
        },
        _currentEvent: function() {
            return this._events[this._events.length - 1];
        },
        _createEvent: function() {
            this._events.push([]);
            return this._currentEvent();
        }
    },
    ruleif: {
        prompt: "rule if> ",
        completions: function(line) {
            var candidates = ["home"], event;
            const elems = line ? line.split(' ') : [];
            if (states.rule._mode !== "event" && states.rule._currentEvent().length > 0) {
                candidates = ["and", "or", "then"];
                if (!elems.length)
                    return candidates;
                return candidates.filter((c) => { return c.indexOf(elems[elems.length - 1]) === 0; });
            }
            const events = data.homework.events;
            if (!line) {
                for (event in events) {
                    candidates.push(event + " ");
                }
            } else {
                if (elems.length === 1) {
                    // make sure we have a complete keyword
                    for (event in events) {
                        candidates.push(event + " ");
                    }
                    candidates = candidates.filter((c) => {
                        return c.indexOf(elems[elems.length - 1]) === 0
                            && c.length > elems[elems.length - 1].length + 1;
                    });
                    if (candidates.length > 0)
                        return candidates;
                }
                if (elems[0] in events) {
                    event = events[elems[0]];
                    var args = elems.slice(0);
                    args.splice(0, 1);
                    if (args.length === 1 || (args.length > 1 && args[args.length - 1] !== ""))
                        args.splice(args.length - 1, 1);
                    args = args.map((e) => { return e.replace(/_/g, " "); });
                    var eventcomps = event.completion.apply(null, args).map((e) => { return e.replace(/ /g, "_") + " "; });
                    if (!(eventcomps instanceof Array))
                        return eventcomps;
                    if (elems.length === 1) {
                        candidates = eventcomps;
                    } else {
                        candidates = eventcomps.filter((c) => { return c.indexOf(elems[elems.length - 1]) === 0; });
                    }
                }
            }
            return candidates;
        },
        apply: function(line) {
            const events = data.homework.events;
            var elems = line.split(' ').filter((e) => { return e.length > 0; });
            if (states.rule._currentEvent().length > 0) {
                if (elems[0] === "and") {
                    states.rule._mode = "event";
                    data.state.push(states.ruleand);
                    data.applyState();
                    return;
                }
                if (elems[0] === "or") {
                    states.rule._mode = "event";
                    states.rule._createEvent();
                    data.state.push(states.ruleor);
                    data.applyState();
                    return;
                }
                if (elems[0] === "then") {
                    // console.log(states.rule._events);
                    states.rule._mode = "then";
                    data.state.push(states.rulethen);
                    data.applyState();
                    return;
                }
            }
            if (elems[0] === "save") {
                console.log("can only save in state then");
                return;
            }
            if (elems[0] === "home") {
                states.rule._clear();
                data.gotoState(1);
                data.applyState();
                return;
            }
            if (elems[0] in events) {
                const event = events[elems[0]];
                elems.splice(0, 1);
                const created = construct(event.ctor, elems.map((e) => { return e.replace(/_/g, " "); }));
                if (!created)
                    return;
                //console.log("got event", created);
                states.rule._currentEvent().push(created);
            } else {
                console.log("no such event", elems[0]);
            }
            states.rule._mode = "next";
        }
    },
    rulethen: {
        prompt: "rule then> ",
        completions: function(line) {
            var candidates = ["home"], action;
            if (states.rule._actions.length > 0) {
                candidates.push("save");
            }
            const actions = data.homework.actions;
            if (!line) {
                for (action in actions) {
                    candidates.push(action + " ");
                }
            } else {
                const elems = line.split(' ');
                if (elems.length === 1) {
                    // make sure we have a complete keyword
                    for (action in actions) {
                        candidates.push(action + " ");
                    }
                    candidates = candidates.filter((c) => {
                        return c.indexOf(elems[elems.length - 1]) === 0
                            && c.length > elems[elems.length - 1].length + 1;
                    });
                    if (candidates.length > 0)
                        return candidates;
                }
                if (elems[0] in actions) {
                    action = actions[elems[0]];
                    var args = elems.slice(0);
                    args.splice(0, 1);
                    if (args.length === 1 || (args.length > 1 && args[args.length - 1] !== ""))
                        args.splice(args.length - 1, 1);
                    args = args.map((e) => { return e.replace(/_/g, " "); });
                    var actioncomps = action.completion.apply(null, args).map((e) => { return e.replace(/ /g, "_") + " "; });
                    if (!(actioncomps instanceof Array))
                        return actioncomps;
                    if (elems.length === 1) {
                        candidates = actioncomps;
                    } else {
                        candidates = actioncomps.filter((c) => { return c.indexOf(elems[elems.length - 1]) === 0; });
                    }
                }
            }
            return candidates;
        },
        apply: function(line) {
            const actions = data.homework.actions;
            var elems = line.split(' ').filter((e) => { return e.length > 0; });
            if (elems[0] === "save") {
                var rule = new Rule(states.rule._name);
                rule.then.apply(rule, states.rule._actions);
                for (var i = 0; i < states.rule._events.length; ++i) {
                    rule.and.apply(rule, states.rule._events[i]);
                }
                data.homework.addRule(rule);
                states.rule._clear();

                data.gotoState(1);
                data.applyState();

                return;
            }
            if (elems[0] === "home") {
                states.rule._clear();
                data.gotoState(1);
                data.applyState();
                return;
            }
            if (elems[0] in actions) {
                const action = actions[elems[0]];
                elems.splice(0, 1);
                const created = construct(action.ctor, elems.map((e) => { return e.replace(/_/g, " "); }));
                if (!created)
                    return;
                //console.log("got action", created);
                states.rule._actions.push(created);
            } else {
                console.log("no such action", elems[0]);
            }
        }
    },
    device: {
        prompt: "device> ",
        completions: function(line) {
            var candidates = [];
            const elems = line ? line.split(' ') : [];
            if (states.device._value !== undefined && elems.length > 1 && elems[0] === "set") {
                var vs = states.device._value.values;
                candidates = (typeof vs === "object") ? Object.keys(vs) : [];
            } else {
                candidates.push("home");
                const devices = data.homework.devices;
                if (states.device._device === undefined) {
                    // list all devices
                    for (var i = 0; i < devices.length; ++i) {
                        candidates.push(devices[i].name.replace(/ /g, "_"));
                    }
                } else {
                    candidates.push("back");
                    if (states.device._value === undefined) {
                        // list all values
                        for (var k in states.device._device.values) {
                            candidates.push(k.replace(/ /g, "_"));
                        }
                        candidates.push("rename ");
                    } else {
                        candidates.push("get");
                        candidates.push("set ");
                    }
                }
            }
            if (elems.length > 0)
                return candidates.filter((c) => { return c.indexOf(elems[elems.length - 1]) === 0; });
            return candidates;
        },
        apply: function(line) {
            const devices = data.homework.devices;
            const elems = line ? line.split(' ').filter((e) => { return e.length > 0; }) : [];
            var state;
            if (!elems.length)
                return;
            if (elems[0] === "home") {
                states.device._clear();
                data.gotoState(1);
                data.applyState();
                return;
            }
            if (states.device._device === undefined) {
                // find and set the device
                for (var i = 0; i < devices.length; ++i) {
                    if (devices[i].name.replace(/ /g, "_") === elems[0]) {
                        states.device._device = devices[i];
                        state = {
                            prompt: "device " + devices[i].name + "> ",
                            completions: states.device.completions,
                            apply: states.device.apply
                        };
                        data.state.push(state);
                        data.applyState();
                    }
                }
            } else {
                if (elems[0] === "back") {
                    var ok = false;
                    if (states.device._value !== undefined) {
                        states.device._value = undefined;
                        ok = true;
                    } else if (states.device._device !== undefined) {
                        states.device._device = undefined;
                        ok = true;
                    }
                    if (ok) {
                        data.state.pop();
                        data.applyState();
                    }
                    return;
                } else if (elems[0] === "rename" && states.device._device !== undefined) {
                    var newname = /rename\s+([^\s].*)/.exec(line);
                    if (newname instanceof Array && newname.length === 2) {
                        states.device._device.name = newname[1];
                        data.prompt = "device " + newname[1] + "> ";
                    }
                }
                if (states.device._value === undefined) {
                    // find and set the value
                    const values = states.device._device.values;
                    const vn = elems[0].replace(/_/g, " ");
                    if (vn in values) {
                        states.device._value = values[vn];
                        state = {
                            prompt: "device " + states.device._device.name + " " + states.device._value.name + "> ",
                            completions: states.device.completions,
                            apply: states.device.apply
                        };
                        data.state.push(state);
                        data.applyState();
                    }
                } else {
                    if (elems[0] === "set") {
                        if (elems.length === 1) {
                            var val = parseInt(elems[1]);
                            if (val + "" === elems[1])
                                states.device._value.value = val;
                        } else {
                            var newval = /set\s+([^\s].*)/.exec(line);
                            if (newval instanceof Array && newval.length === 2) {
                                states.device._value.value = newval[1];
                            } else {
                                Console.log("couldn't set value");
                            }
                        }
                    } else if (elems[0] === "get") {
                        Console.log(states.device._value.value);
                    }
                }
            }
        },

        _device: undefined,
        _value: undefined,
        _clear: function() {
            this._device = undefined;
            this._value = undefined;
        }
    },
    eval: {
        prompt: "eval> ",
        completions: function(line) {
            return [];
        },
        apply: function(line) {
            if (line === "back" || line === "home") {
                states.device._clear();
                data.gotoState(1);
                data.applyState();
                return;
            }
            try {
                eval(line);
            } catch (e) {
                Console.error("eval error", e);
            }
        }
    },
    timers: {
        prompt: "timers> ",
        completions: function(line) {
            var candidates = [["home", "create ", "destroy "], ["timeout ", "interval ", "schedule "]];
            var ret = [];
            const elems = line ? lineFixup(line).split(' ') : [];
            if (elems.length === 0) {
                return candidates[0];
            } else if (elems.length <= candidates.length) {
                // verify that we have a full word
                ret = candidates[elems.length - 1].filter((c) => {
                    return c.indexOf(elems[elems.length - 1]) === 0
                        && c.length > elems[elems.length - 1].length + 1;
                });
                if (ret.length > 0)
                    return ret;
            }
            var stripped = utils.strip(elems);
            if ((stripped.length === 2 || stripped.length === 3) && stripped[0] === "destroy") {
                // complete on timer names
                ret = data.homework.Timer.names(stripped[1]);
            }
            return ret.filter((c) => { return c.indexOf(elems[elems.length - 1]) === 0; });
        },
        apply: function(line) {
            if (line === "back" || line === "home") {
                data.gotoState(1);
                data.applyState();
                return;
            }
            const elems = line ? line.split(' ').filter((e) => { return e.length > 0; }) : [];
            if (!elems.length)
                return;
            if (elems.length < 3) {
                Console.error("Need at least 3 arguments");
                return;
            }
            if (elems[0] === "create") {
                try {
                    if (data.homework.Timer.create.apply(data.homework.Timer, elems.slice(1))) {
                        Console.log("created");
                    } else {
                        Console.log("couldn't create");
                    }
                } catch (e) {
                    Console.error("Couldn't create timer", e);
                }
            } else if (elems[0] === "destroy") {
                data.homework.Timer.destroy(elems[1], elems[2]);
            }
        }
    },
    variables: {
        prompt: "variables> ",
        completions: function(line) {
            var candidates = ["home", "create ", "destroy "];
            var ret = [];
            const elems = line ? lineFixup(line).split(' ') : [];
            if (elems.length === 0) {
                return candidates;
            } else if (elems.length === 1) {
                // verify that we have a full word
                ret = candidates.filter((c) => {
                    return c.indexOf(elems[0]) === 0
                        && c.length > elems[0].length + 1;
                });
                if (ret.length > 0)
                    return ret;
            }
            var stripped = utils.strip(elems);
            if ((stripped.length === 1 || stripped.length === 2) && stripped[0] === "destroy") {
                // complete on variable names
                ret = data.homework.Variable.names();
            }
            return ret.filter((c) => { return c.indexOf(elems[elems.length - 1]) === 0; });
        },
        apply: function(line) {
            if (line === "back" || line === "home") {
                data.gotoState(1);
                data.applyState();
                return;
            }
            const elems = line ? line.split(' ').filter((e) => { return e.length > 0; }) : [];
            if (!elems.length)
                return;
            if (elems.length < 2) {
                Console.error("Need at least 2 arguments");
                return;
            }
            if (elems[0] === "create") {
                try {
                    if (data.homework.Variable.create(elems[1])) {
                        Console.log("created");
                    } else {
                        Console.log("couldn't create");
                    }
                } catch (e) {
                    Console.error("Couldn't create variable", e);
                }
            } else if (elems[0] === "destroy") {
                data.homework.Variable.destroy(elems[1]);
            }
        }
    }
};

states.ruleand = {
    prompt: "rule and> ",
    completions: states.ruleif.completions,
    apply: states.ruleif.apply
};
states.ruleor = {
    prompt: "rule or> ",
    completions: states.ruleif.completions,
    apply: states.ruleif.apply
};

function completer(partial, callback) {
    //callback(null, [['123'], partial]);
    const state = data.currentState;
    if (partial.length === 0) {
        const comps = (typeof state.completions === "function") ? state.completions() : state.completions;
        callback(null, [comps, partial]);
        return;
    }
    var hits;
    const what = partial.split(' ');
    const last = what[what.length - 1];
    if (typeof state.completions === "function")
        hits = state.completions(partial);
    else {
        if (last !== "")
            hits = state.completions.filter((c) => { return c.indexOf(partial) === 0; });
        else
            hits = [];
    }
    callback(null, [hits, last]);
}

function Console()
{
}

Console.init = function(homework)
{
    data.homework = homework;
    rl.on("line", (line) => {
        // console.log(`hey ${line}`);
        data.currentState.apply(line);
        rl.prompt();
    });
    rl.on("SIGINT", () => {
        data._emit("shutdown");
    });

    data.state.push(states.default);
    data.applyState();

    rl.prompt();
};

Console.log = function()
{
    console.log.apply(console, arguments);
    rl.prompt();
};

Console.error = function()
{
    console.error.apply(console, arguments);
    rl.prompt();
};

Console.registerCommand = function(parent, name, section)
{
    states[parent].completions.push(name);
    if (!states[parent]._extraCommands)
        states[parent]._extraCommands = Object.create(null);
    states[parent]._extraCommands[name] = section;
    states[name] = section;
};

Console.home = function()
{
    data.gotoState(1);
    data.applyState();
};

Console.on = data.on.bind(data);

module.exports = Console;
