/*global WebSocket,R,angular,$,$compile*/

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
                    this._value.value = val;
                    client._conn.send(JSON.stringify({ what: "set", data: { id: this.identifier, value: val } }));
                };
                dev.controllers.push(ctrl);
            }
            client._devices[dev.identifier] = dev;
        }

        var scope = $("#devices").scope();
        scope.devices = client._devices;
        scope.$apply();
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

client._requestDevices = function()
{
    if (client._conn)
        client._conn.send(JSON.stringify({ what: "request", data: "devices" }));
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
        client._conn.onopen = function() {
            client._requestDevices();
        };
        client._conn.onclose = function() {
            console.log("closed");
        };

        var scope = $("#devices").scope();
        // scope.mainScope.text = "123";
        // scope.mainScope.$apply();
        scope.text = "123";
        scope.$apply();
    });

    // var MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
    // client._observer = new MutationObserver(function(mutations) {
    //     mutations.forEach(function(mutation) {
    //         if (mutation.type === 'childList') {
    //             if (mutation.addedNodes) {
    //                 for (var i = 0; i < mutation.addedNodes.length; ++i) {
    //                     var n = mutation.addedNodes[i];
    //                     // if (n.tagName === "INPUT" && n.type === "checkbox")
    //                     //     n.bootstrapSwitch();
    //                 }
    //             }
    //         }
    //     });
    // });
    // client._observer.observe(document.body, { childList: true, subtree: true });
};

client._app = angular.module('homework', ['ui.bootstrap', 'frapontillo.bootstrap-switch', 'nya.bootstrap.select']);
client._app.controller("AppController", function($scope) {
    $scope.entries = {Devices: true, Scenes: false};
});
client._app.controller("DeviceController", function($scope) {
    client._requestDevices();
    $scope.controllerBody = function(controller) {
        var ret, alts, i;
        if (controller.readOnly) {
            if (controller.type === "list") {
                ret = '<ul class="list-group">';
                alts = controller.values;
                for (i = 0; i < alts.length; ++i) {
                    ret += '<li data-value="' + alts[i] + '" class="list-group-item' + (controller.value === alts[i] ? ' active' : '') +'">' + alts[i] + '</li>';
                }
                return ret + '</ul>';
            }
            return controller.value;
        }
        switch (controller.type) {
        case "bool":
            return '<input bs-switch type="checkbox" ng-model="currentDeviceController.value"></input>';
        case "decimal":
        case "byte":
        case "string":
            return '<input type="text" ng-model="currentDeviceController.value"></input>';
        case "list":
            ret = '<ol class="nya-bs-select" ng-model="currentDeviceController.value">';
            alts = controller.values;
            for (i = 0; i < alts.length; ++i) {
                ret += '<li data-value="' + alts[i] + '" class="nya-bs-option"><a>' + alts[i] + '</a></li>';
            }
            return ret + '</ol>';
        };
        return controller.type;
    };
    $scope.modalBack = function() {
        delete $scope.currentDeviceController;
        window.history.back();
    };
});
client._app.controller("MainController", function($scope) {
    $scope.$parent.text = "abc";
    $scope.$parent.mainScope = $scope;
});
client._app.directive('compileTemplate', function($compile, $parse){
    return {
        link: function(scope, element, attr){
            var parsed = $parse(attr.ngBindHtml);
            function getStringValue() { return (parsed(scope) || '').toString(); }

            //Recompile if the template changes
            scope.$watch(getStringValue, function() {
                $compile(element, null, -9999)(scope);  //The -9999 makes it skip directives so that we do not recompile ourselves
            });
        }
    };
});
client._app.filter("sanitize", ['$sce', function($sce) {
    return function(htmlCode){
        return $sce.trustAsHtml(htmlCode);
    };
}]);
// client._app.directive('input', function() {
//     return {
//         restrict: 'E',
//         require: 'ngModel',
//         link: function(scope, element, attrs, ngModelCtrl) {
//             if (attrs.type === 'checkbox')
//                 $(element).bootstrapSwitch({
//                     onSwitchChange: function(event, state) {
//                         scope.$apply(function() {
//                             ngModelCtrl.$setViewValue(state);
//                         });
//                     }
//                 });
//         }
//     };
// });

function changeEntry(href)
{
    var scope = $("body").scope();
    for (var i in scope.entries) {
        if (i === href) {
            scope.entries[i] = true;
        } else {
            scope.entries[i] = false;
        }
    }
    scope.$apply();
}

function changeDevice(href)
{
    var scope = $("#devices").scope();
    scope.currentDevice = scope.devices[href];
    scope.$apply();
    $("#deviceModal").modal();
}

function changeDeviceController(href)
{
    var scope = $("#devices").scope();
    if (!scope.currentDevice)
        return;
    var ctrls = scope.currentDevice.controllers;
    for (var i = 0; i < ctrls.length; ++i) {
        if (ctrls[i].identifier === href) {
            scope.currentDeviceController = ctrls[i];
            scope.$apply();
            break;
        }
    }
}

$(document).on("hidden.bs.modal", "#deviceModal", function() {
    var scope = $("#devices").scope();
    delete scope.currentDeviceController;
    delete scope.currentDevice;
    scope.$apply();

    window.location.hash = "";
});


window.location.hash = "";
window.onhashchange = function() {
    var h = window.location.hash;
    var dash = h.indexOf('-');
    if (dash === -1)
        return;
    var section = h.substr(1, dash - 1);
    var href = h.substr(dash + 1);
    switch (section) {
    case "entry":
        changeEntry(href);
        break;
    case "device":
        changeDevice(href);
        break;
    case "deviceController":
        changeDeviceController(href);
        break;
    }
};
