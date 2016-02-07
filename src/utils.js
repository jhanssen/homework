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
    o._ons = Object.create(null);
    o._emit = (type, arg) => {
        if (type in o._ons) {
            for (var i = 0; i < o._ons[type].length; ++i) {
                o._ons[type][i].call(this, arg);
            }
        }
    };
    o.on = (type, cb) => {
        if (!(type in o._ons))
            o._ons[type] = [cb];
        else
            o._ons[type].push(cb);
    };
}

module.exports = {
    strip: strip,
    onify: onify
};
