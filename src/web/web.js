/*global WebSocket,location*/

var web = {
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
            console.log("websocket data:", msg.data);
        };
    },
    load: function(req) {
        if (typeof req === "object") {
            var types = ["get", "set", "create", "add", "cfg"];
            for (var idx in types) {
                var type = types[idx];
                if (type in req) {
                    req.type = type;
                    break;
                }
            }
            req = JSON.stringify(req);
        }
        web.connection.send(req);
    },
    menuChanged(url) {
        switch (url) {
        case "scenes-add.html":
            web.load({get: "controllers"});
            break;
        }
    },
    navigate(menu, url) {
        menu.setMainPage(url, {callback: function() { web.menuChanged(url); }});
    }
};
