/*global module*/

function Rule(name)
{
    this._name = name;
}

Rule.prototype = {
    _name: undefined,
    _events: [],
    _actions: [],

    get name() {
        return this._name;
    },

    and: function() {
        var as = [].slice.apply(arguments);
        console.log("balls", as);
        this._events.push(as);

        var that = this;
        for (var i = 0; i < as.length; ++i) {
            as[i].on("triggered", function() {
                if (that._check())
                    that._trigger();
            });
        }
    },
    then: function() {
        console.log(arguments);
        this._actions.push.apply(this._actions, arguments);
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
