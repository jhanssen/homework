/*global require,module*/
var net = require("net");
var connection = new net.Socket();
var connectionOpts;
var ons = Object.create(null);
var queue = "";

var loginrx = /login: /g;
var passwdrx = /password: /g;
var outputrx = /~(OUTPUT),([^,]+),([^,]+),([^\r]+)\r\n/g;
var promptrx = /GNET> /g;

var states = {
    Login: 0,
    Password: 1,
    Ok: 2
};
var state = states.Login;

function callEventListener(evt, data) {
    if (evt in ons && typeof ons[evt] === "function") {
        ons[evt](data);
    }
}

function check(rx) {
    var res = rx.exec(queue);
    if (res) {
        var args = [];
        for (var i = 2; i < res.length; ++i)
            args.push(res[i]);
        // console.log(res);
        // console.log(args);
        callEventListener(res[1], args);
        return true;
    }
    return false;
}

function parseQueue() {
    var res;

    var clear = function(rx) {
        if (rx instanceof Array) {
            var max = 0;
            for (var i = 0; i < rx.length; ++i) {
                if (rx[i].lastIndex > max) {
                    max = rx[i].lastIndex;
                }
                rx[i].lastIndex = 0;
            }
            queue = queue.substr(max);
        } else {
            queue = queue.substr(rx.lastIndex);
            rx.lastIndex = 0;
        }
    };

    while (queue.length > 0) {
        switch (state) {
        case states.Login:
            res = loginrx.exec(queue);
            if (res) {
                state = states.Password;
                connection.write(connectionOpts.login + "\r\n");
                clear(loginrx);
            } else {
                return;
            }
            break;
        case states.Password:
            res = passwdrx.exec(queue);
            if (res) {
                state = states.Ok;
                connection.write(connectionOpts.password + "\r\n");
                clear(passwdrx);
            } else {
                return;
            }
            break;
        case states.Ok:
            var clears = [];
            if (promptrx.exec(queue)) {
                callEventListener("ready");
                clears.push(promptrx);
            }
            if (check(outputrx)) {
                clears.push(outputrx);
            }
            if (clears.length > 0) {
                clear(clears);
            } else {
                return;
            }
            break;
        }
    }
}

connection.on("close", function(err) {
    callEventListener("close");
});
connection.on("error", function(err) {
    callEventListener("error", err);
});
connection.on("connect", function() {
    // console.log("net connect");
});
connection.on("data", function(data) {
    queue += data;
    //console.log("net data", queue);
    parseQueue();
});
connection.on("timeout", function() {
    callEventListener("timeout");
});

connection.setEncoding("ascii");

module.exports = {
    connect: function(opts) {
        connectionOpts = opts;
        connection.connect(opts);
    },
    on: function(evt, cb) {
        ons[evt] = cb;
    },
    query: function(type, integrationid, actionid) {
        connection.write("?" + type + "," + integrationid + "," + actionid + "\r\n");
    },
    set: function(type, integrationid, actionid, arg) {
        connection.write("#" + type + "," + integrationid + "," + actionid + "," + arg + "\r\n");
    }
};
