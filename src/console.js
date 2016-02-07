/*global module,require,process*/

const utils = require("./utils.js");
const Rule = require("./rule.js");
const readline = require("readline");
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: completer
});

function construct(constructor, args) {
    function F() {
        return constructor.apply(this, args);
    }
    F.prototype = constructor.prototype;
    return new F();
}

const data = {
    state: [],
    homework: undefined,

    get currentState() {
        return this.state[this.state.length - 1];
    },

    applyState: function() {
        var s = this.currentState;
        rl.setPrompt(s.prompt);
    }
};

utils.onify(data);

const states = {
    default: {
        prompt: "homework> ",
        completions: ["rule ", "shutdown"],
        apply: function(line) {
            if (line === "shutdown") {
                data._emit("shutdown");
                return;
            }
            var elems = line.split(' ').filter(function(e) { return e.length > 0; });
            if (elems[0] === "rule") {
                if (elems.length < 2) {
                    console.log("rule needs a name");
                    return;
                }
                data.state.push(states.rule);
                states.rule._name = elems[1];
                data.applyState();
            }
        }
    },
    rule: {
        prompt: "rule> ",
        completions: ["if", "back", "shutdown"],
        apply: function(line) {
            switch (line) {
            case "if":
                states.rule._mode = "if";
                data.state.push(states.ruleif);
                data.applyState();
                break;
            case "back":
                data.state.pop();
                data.applyState();
                break;
            case "shutdown":
                data._emit("shutdown");
                break;
            }
        },

        _name: undefined,
        _mode: undefined,
        _events: [[]],
        _actions: [],
        _clear: function() {
            this._name = this._mode = undefined;
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
            var candidates = [], event;
            if (states.rule._mode === "if" && states.rule._currentEvent().length > 0) {
                candidates.push("and", "or", "then");
            }
            const events = data.homework.events;
            if (!line) {
                for (event in events) {
                    candidates.push(event + " ");
                }
            } else {
                const elems = line.split(' ');
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
                    var eventcomps = event.completion.apply(null, args).map(function(e) { return e + " "; });
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
            var elems = line.split(' ').filter(function(e) { return e.length > 0; });
            if (elems[0] === "and") {
                states.rule._mode = "and";
                data.state.push(states.ruleand);
                data.applyState();
                return;
            }
            if (elems[0] === "or") {
                states.rule._mode = "or";
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
            if (elems[0] in events) {
                const event = events[elems[0]];
                elems.splice(0, 1);
                const created = construct(event.ctor, elems);
                //console.log("got event", created);
                states.rule._currentEvent().push(created);
            }
        }
    },
    rulethen: {
        prompt: "rule then> ",
        completions: function(line) {
            var candidates = [], action;
            if (states.rule._mode === "if" && states.rule._currentAction().length > 0) {
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
                    var actioncomps = action.completion.apply(null, args).map(function(e) { return e + " "; });
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
            var elems = line.split(' ').filter(function(e) { return e.length > 0; });
            if (elems[0] === "save") {
                var rule = new Rule(states.rule._name);
                rule.then.apply(rule, states.rule._actions);
                console.log("hekekek", states.rule._events);
                for (var i = 0; i < states.rule._events.length; ++i) {
                    rule.and.apply(rule, states.rule._events[i]);
                }
                data.homework.addRule(rule);
                states.rule._clear();

                return;
            }
            if (elems[0] in actions) {
                const action = actions[elems[0]];
                elems.splice(0, 1);
                const created = construct(action.ctor, elems);
                //console.log("got action", created);
                states.rule._actions.push(created);
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
    if (typeof state.completions === "function")
        hits = state.completions(partial);
    else
        hits = state.completions.filter((c) => { return c.indexOf(partial) === 0; });
    callback(null, [hits, what[what.length - 1]]);
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

Console.on = data.on;

module.exports = Console;
