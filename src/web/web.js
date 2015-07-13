/*global WebSocket,location,angular*/

var web = {
    _currentId: 0,
    _callbacks: Object.create(null),
    _state: Object.create(null),
    _pendingSends: [],
    connection: undefined,
    init: function() {
        web.connection = new WebSocket("ws://" + location.hostname + ":8087/");
        web.connection.onopen = function() {
            console.log("websocket onopen");
            for (var i = 0; i < web._pendingSends.length; ++i) {
                web.connection.send(web._pendingSends[i]);
            }
            web._pendingSends = [];

            var scope = angular.element(document.querySelector('[ng-controller=AppController]')).scope();
            scope.menu.setMainPage('scenes.html');
        };
        web.connection.onclose = function() {
            console.log("websocket close");
            var scope = angular.element(document.querySelector('[ng-controller=AppController]')).scope();
            scope.menu.setMainPage('disabled.html');
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
        if (web.connection.readyState !== 1) {
            web._pendingSends.push(req);
        } else {
            web.connection.send(req);
        }
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
        case "AddSceneComplete":
            $scope.controllers = web._state.controllers;
            $scope.sceneName = web._state.sceneName;
            break;
        case "Scenes":
            $scope.scenes = [];
            web.load({get: "scenes"}, function(data) {
                $scope.scenes = data.data.scenes;
                console.log(data);
                $scope.$apply();
            });
            break;
        }
    },
    setScene: function(scene) {
        web.load({set: "scene", name: scene});
    },
    saveScene: function(menu, state) {
        var input, ctrls, i;
        switch (state) {
        case "controllers":
            // store selected controllers, load controller setup screen
            input = document.querySelector("ons-list-item > input");
            ctrls = document.querySelectorAll("ons-list-item > label > input[type=checkbox]:checked");
            web._state.sceneName = input.value;
            web._state.controllers = [];
            for (i = 0; i < ctrls.length; ++i) {
                web._state.controllers.push(ctrls[i].parentNode.textContent.trim());
            }
            menu.setMainPage('scenes-add-controllers.html');
            break;
        case "complete":
            // create save scene request
            var scope = angular.element(document.querySelector('[ng-controller=AddSceneCompleteController]')).scope();
            input = document.querySelectorAll("ons-list-item > input");
            var values = {};
            for (i = 0; i < input.length; ++i) {
                values[scope.controllers[i]] = input[i].value;
            }
            //console.log(scope.sceneName, values);
            web.load({create: "scene", name: scope.sceneName, controllers: values});
            menu.setMainPage('scenes.html');
        }
    },
    _addCallback: function(cb) {
        var id = web._currentId;
        web._callbacks[id] = cb;
        ++web._currentId;
        return id;
    }
};
