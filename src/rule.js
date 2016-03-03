/*global module*/

"use strict";

function Rule(name)
{
    this._name = name;
    this._events = [];
    this._eventsTrigger = [];
    this._actions = [];
    this._maybeTriggerBound = this._maybeTrigger.bind(this);
}

Rule.SerializePending = function(rule) {
    var events = rule.events, i, j;
    for (i = 0; i < events.length; ++i) {
        var a = events[i];
        for (j = 0; j < a.length; ++j) {
            if (typeof events[i][j] === "object" && "serialize" in events[i][j]) {
                events[i][j] = events[i][j].serialize();
            }
        }
    }
    var actions = rule.actions;
    for (i = 0; i < actions.length; ++i) {
        if (typeof actions[i] === "object" && "serialize" in actions[i]) {
            actions[i] = actions[i].serialize();
        }
    }
    return rule;
};

Rule.Deserialize = function(homework, rule) {
    var i, j, o, done;
    var events = rule.events;
    var hevents = homework.events;
    for (i = 0; i < events.length; ++i) {
        var a = events[i];
        var ok = true;
        for (j = 0; j < a.length; ++j) {
            //events[i][j] = events[i][j].serialize();
            done = false;
            for (var k in hevents) {
                if (typeof events[i][j] === "object" && "serialize" in events[i][j]) {
                    done = true;
                    break;
                }
                o = hevents[k].deserialize(events[i][j]);
                if (o) {
                    events[i][j] = o;
                    done = true;
                    break;
                }
            }
            if (!done)
                return null;
        }
    }
    var actions = rule.actions;
    var hactions = homework.actions;
    for (i = 0; i < actions.length; ++i) {
        done = false;
        for (j in hactions) {
            if (typeof actions[i] === "object" && "serialize" in actions[i]) {
                done = true;
                break;
            }
            o = hactions[j].deserialize(actions[i]);
            if (o) {
                actions[i] = o;
                done = true;
                break;
            }
        }
        if (!done)
            return null;
    }
    var ret = new Rule(rule.name);
    ret.then.apply(ret, actions);
    for (i = 0; i < events.length; ++i) {
        ret.and.apply(ret, events[i]);
    }
    return ret;
};

Rule.prototype = {
    _name: undefined,
    _maybeTrigger: function(evt) {
        if (this._check(evt))
            this._trigger();
    },

    get name() {
        return this._name;
    },

    and: function() {
        var as = [].slice.apply(arguments);

        var events = [];
        var triggers = [];
        for (var i = 0; i < as.length; ++i) {
            if ("on" in as[i]) {
                as[i].on("triggered", this._maybeTriggerBound);
                events.push(as[i]);
                triggers.push(true);
            } else if ("and" in as[i]) {
                if (as[i].trigger) {
                    as[i].and.on("triggered", this._maybeTriggerBound);
                    triggers.push(true);
                } else {
                    triggers.push(false);
                }
                events.push(as[i].and);
            }
        }
        this._events.push(events);
        this._eventsTrigger.push(triggers);
    },
    then: function() {
        this._actions.push.apply(this._actions, arguments);
    },

    destroy: function() {
        // disconnect from everything
        for (var e = 0; e < this._events.length; ++e) {
            var as = this._events[e];
            for (var i = 0; i < as.length; ++i) {
                as[i].off("triggered", this._maybeTriggerBound);
            }
        }
    },

    _invoke: function(overwrite, call) {
        var events = this._events.slice(0), i;
        var actions = this._actions.slice(0);
        var outs = {};
        if (overwrite) {
            outs.events = events;
            outs.actions = actions;
        } else {
            outs.events = events.map((s) => { return s.map(() => { return null; }); });
            outs.actions = actions.map(() => { return null; });
        }
        for (i = 0; i < events.length; ++i) {
            var out = outs.events[i];
            var a = events[i];
            var ok = true;
            for (var j = 0; j < a.length; ++j) {
                out[j] = a[j][call]();
            }
        }
        for (i = 0; i < actions.length; ++i) {
            outs.actions[i] = actions[i][call]();
        }
        return { name: this._name, events: outs.events, eventsTrigger: this._eventsTrigger, actions: outs.actions };
    },
    serialize: function(overwrite) {
        return this._invoke(overwrite, "serialize");
    },
    format: function() {
        return this._invoke(false, "format");
    },

    _check: function(evt) {
        for (var i = 0; i < this._events.length; ++i) {
            var a = this._events[i];
            var ok = true;
            for (var j = 0; j < a.length; ++j) {
                if (!Object.is(a[j], evt) && !a[j].check()) {
                    ok = false;
                    break;
                }
            }
            if (ok)
                return true;
        }
        return false;
    },
    _trigger: function() {
        for (var i = 0; i < this._actions.length; ++i) {
            this._actions[i].trigger();
        }
    }
};

module.exports = Rule;
