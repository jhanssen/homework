/*global module,setTimeout,clearTimeout,setInterval,clearInterval,require*/

var homework = undefined;
var utils = undefined;

function Event(name, cmp, value)
{
    if (arguments.length != 3) {
        throw "Variable event needs three arguments, name, comparator and value";
    }

    if (!(name in variables.variables)) {
        throw "Variable " + name + " does not exist";
    }
    if (cmp !== "==" && cmp !== "!=") {
        throw "Variable invalid comparator " + cmp;
    }

    this._initOns();
    this._name = name;
    this._cmp = cmp;
    this._value = value;

    variables.on("changed", (name) => {
        if (this._name == name && variables.variables[name] == this._value) {
            homework.Console.log("triggering variable event", this._name, this._value);
            this._emit("triggered");
        }
    });
    variables.on("destroyed", (name) => {
        if (this._name == name) {
            this._emit("cancel");
        }
    });
}

Event.prototype = {
    _name: undefined,
    _value: undefined,
    _cmp: undefined,

    check: function() {
        if (this._name in variables.variables) {
            if (this._cmp == "==")
                return variables.variables[this._name] == this._value;
            else
                return variables.variables[this._name] != this._value;
        }
        return false;
    },
    serialize: function() {
        return { type: "VariableEvent", name: this._name, cmp: this._cmp, value: this._value };
    }
};

function Action(name, value)
{
    if (arguments.length != 2) {
        throw "Variable action needs at least two arguments, name and value";
    }

    if (!(name in variables.variables)) {
        throw "Variable " + name + " does not exist";
    }

    this._initOns();
    this._name = name;
    this._value = value;

    variables.on("destroyed", (name) => {
        if (this._name == name) {
            this._emit("cancel");
        }
    });
}

Action.prototype = {
    trigger: function() {
        homework.Console.log("trigger variable action", this._name, this._value);
        variables.change(this._name, this._value);
    },
    serialize: function() {
        return { type: "VariableAction", name: this._name, value: this._value };
    }
};

function eventCompleter()
{
    if (!arguments.length) {
        return { type: "list", values: Object.keys(variables.variables) };
    } else if (arguments.length === 1 || (arguments.length === 2 && arguments[1].length < 2)) {
        return { type: "list", values: ["==", "!="] };
    } else if (arguments.length === 2) {
        return { type: "string" };
    }
    return { values: [] };
}

function eventDeserializer(e)
{
    if (!(typeof e === "object"))
        return null;

    if (e.type !== "VariableEvent")
        return null;

    var event;
    try {
        variables.create(e.name);
        event = new Event(e.name, e.cmp, e.value);
    } catch (e) {
        return null;
    }
    return event;
}

function actionCompleter()
{
    if (!arguments.length) {
        return Object.keys(variables.variables);
    }
    return [];
}

function actionDeserializer(e)
{
    if (!(typeof e === "object"))
        return null;

    if (e.type !== "VariableAction")
        return null;

    var event;
    try {
        variables.create(e.name);
        event = new Action(e.name, e.value);
    } catch (e) {
        return null;
    }
    return event;
}

const variables = {
    variables: Object.create(null),

    init: function(hw)
    {
        homework = hw;
        utils = hw.utils;

        utils.onify(Event.prototype);
        utils.onify(Action.prototype);

        homework.registerEvent("Variable", Event,  eventCompleter, eventDeserializer);
        homework.registerAction("Variable", Action, actionCompleter, actionDeserializer);

        homework.loadRules();

        utils.onify(this);
        this._initOns();
    },
    names: function()
    {
        return Object.keys(this.variables);
    },
    create: function(name)
    {
        if (name in this.variables)
            return false;
        this.variables[name] = undefined;
        return true;
    },
    destroy: function(name)
    {
        if (name in this.variables) {
            delete this.variables[name];
            this._emit("destroyed", name);
            return true;
        }
        return false;
    },
    change: function(name, value) {
        if (!(name in this.variables)) {
            return false;
        }
        this.variables[name] = value;
        this._emit("changed", name);
        return true;
    }
};

module.exports = variables;
