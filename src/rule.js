/*global module*/

function Rule(name)
{
    this._name = name;
}

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
    _events: [],
    _actions: [],

    get name() {
        return this._name;
    },

    and: function() {
        var as = [].slice.apply(arguments);
        this._events.push(as);

        var that = this;
        for (var i = 0; i < as.length; ++i) {
            as[i].on("triggered", () => {
                if (that._check())
                    that._trigger();
            });
        }
    },
    then: function() {
        this._actions.push.apply(this._actions, arguments);
    },

    serialize: function() {
        var events = this._events.slice(0), i;
        for (i = 0; i < events.length; ++i) {
            var a = events[i];
            var ok = true;
            for (var j = 0; j < a.length; ++j) {
                events[i][j] = events[i][j].serialize();
            }
        }
        var actions = this._actions.slice(0);
        for (i = 0; i < actions.length; ++i) {
            actions[i] = actions[i].serialize();
        }
        return { name: this._name, events: events, actions: actions };
    },

    _check: function() {
        for (var i = 0; i < this._events.length; ++i) {
            var a = this._events[i];
            var ok = true;
            for (var j = 0; j < a.length; ++j) {
                if (!a[j].check()) {
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
