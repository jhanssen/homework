/*global WebSocket,location*/

var web = {
    _currentId: 0,
    _callbacks: Object.create(null),
    $scope: undefined,
    connection: undefined,
    init: function($scope) {
        web.$scope = $scope;
        web.connection = new WebSocket("ws://" + location.hostname + ":8087/");
        web.connection.onopen = function() {
            console.log("websocket onopen");
        };
        web.connection.onclose = function() {
            console.log("websocket close");
        };
        web.connection.onerror = function(err) {
            console.error("websocket error:", err);
        };
        web.connection.onmessage = function(msg) {
            try {
                var obj = JSON.parse(msg.data);
            } catch (e) {
                console.error("JSON parse error", e);
                return;
            }
            if (obj instanceof Object && obj.hasOwnProperty("id")) {
                // look up the callback
                if (obj.id in web._callbacks) {
                    var cb = web._callbacks[obj.id];
                    delete web._callbacks[obj.id];
                    cb(obj);
                    return;
                }
            }
            console.log("websocket data:", msg.data);
        };
    },
    load: function(req, callback) {
        if (typeof req === "object") {
            var types = ["get", "set", "create", "add", "cfg"];
            for (var idx in types) {
                var type = types[idx];
                if (type in req) {
                    req.type = type;
                    break;
                }
            }
            if (callback) {
                req.id = web._addCallback(callback);
            }
            req = JSON.stringify(req);
        }
        web.connection.send(req);
    },
    transition: function(name, $scope) {
        switch (name) {
        case "AddScene":
            $scope.controllers = [];
            web.load({get: "controllers"}, function(data) {
                $scope.controllers = data.data.controllers.filter(function() {
                    var seen = {};
                    return function(element, index, array) {
                        return !(element in seen) && (seen[element] = 1);
                    };
                }()).sort();
                $scope.$apply();
            });
            break;
        }
    },
    saveScene: function(menu, state) {
        switch (state) {
        case "controllers":
            // store selected controllers, load controller setup screen
            var input = document.querySelector("ons-list-item > input");
            console.log(input.value);
            var ctrls = document.querySelectorAll("ons-list-item > label > input[type=checkbox]:checked");
            for (var i = 0; i < ctrls.length; ++i) {
                console.log(ctrls[i].parentNode.textContent.trim());
            }
            menu.setMainPage('scenes-add-controllers.html');
            break;
        }
    },
    _addCallback: function(cb) {
        var id = web._currentId;
        web._callbacks[id] = cb;
        ++web._currentId;
        return id;
    }
};
