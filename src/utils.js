/*global module*/

function strip(array) {
    if (!("length" in array))
        return array;
    var a = [].slice.call(array);
    while (a.length > 0 && a[a.length - 1] === "")
        a.splice(a.length - 1, 1);
    return a;
}

function onify(o) {
    o._initOns = function() {
        this._ons = Object.create(null);
    },

    o._emit = function(type, arg) {
        if (type in this._ons) {
            for (var i = 0; i < this._ons[type].length; ++i) {
                this._ons[type][i].call(this, arg);
            }
        }
    };
    o.on = function(type, cb) {
        if (!(type in this._ons))
            this._ons[type] = [cb];
        else
            this._ons[type].push(cb);
    };
}

module.exports = {
    strip: strip,
    onify: onify
};
