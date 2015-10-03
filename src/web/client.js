/*global WebSocket,R,angular,$*/

var client = { _devices: Object.create(null) };

client._handlers = {
    "devices": function(msg) {
        for (var k in msg) {
            var obj = msg[k];
            var dev = new client._ctors.Device(obj._id, obj._node);
            for (var l in obj.controllers) {
                var sub = obj.controllers[l];
                var ctrl = new client._ctors.Controller(sub._value);
                ctrl._setValue = function(val)
                {
                    client._conn.send(JSON.stringify({ what: "set", data: { id: this.identifier, value: val } }));
                };
                dev.controllers.push(ctrl);
            }
            client._devices[obj._id] = dev;
        }
    }
};

client._handleMessage = function(msg)
{
    if (!("what" in msg) || !client._handlers.hasOwnProperty(msg.what)) {
        console.log("can't handle", msg);
        return;
    }
    client._handlers[msg.what](msg.data);
};

client.start = function()
{
    R("./devices", function(err, devices) {
        if (err) {
            console.log(err);
            return;
        }
        client._ctors = devices;

        client._conn = new WebSocket("ws://" + window.location.hostname + ":8087/");
        client._conn.onerror = function(err) {
            console.log("ws error");
        };
        client._conn.onmessage = function(e) {
            client._handleMessage(JSON.parse(e.data));
        };
        client._conn.onclose = function() {
            console.log("closed");
        };

        var scope = $("#main").scope();
        scope.text = "123";
        scope.$apply();
    });
};

client._app = angular.module('homework', ['ui.bootstrap']);
client._app.controller("MainController", function($scope) {
    $scope.text = "abc";
});
