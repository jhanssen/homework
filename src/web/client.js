/*global WebSocket,R,angular,$,$compile*/

function arrayRemove(arr, item) {
    for (var i = 0; i < arr.length; ++i) {
        if (arr[i] === item) {
            arr.splice(i, 1);
            break;
        }
    }
}

var client = { _devices: Object.create(null), _reqs: { devices: [] } };

client._handlers = {
    devices: function(msg) {
        for (var k in msg) {
            var obj = msg[k];
            var dev = new client._ctors.Device(obj._id, obj._node);
            console.log(obj);
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

        var scope = $("#app").scope();
        scope.devices = client._devices;
        scope.$apply();

        client._callReqs("devices");
    },
    state: function(msg)
    {
        var scope = $("#configure").scope();
        scope.state = msg.state;
        scope.$apply();
    },
    value: function(msg)
    {
        if (msg.devices in client._devices) {
            var dev = client._devices[msg.device];
            for (var i = 0; i < dev.controllers; ++i) {
                if (dev.controllers[i].identifier === msg.controller) {
                    dev.controllers[i]._value.value = msg.value;
                    break;
                }
            }
        }
    },
    scenes: function(msg)
    {
        var scope = $("#scenes").scope();
        scope.scenes = msg;
        scope.$apply();
    }
};

client._addScene = function(name, ctrls)
{
    var values = Object.create(null);
    for (var i = 0; i < ctrls.length; ++i) {
        var ctrl = ctrls[i];
        if (!(ctrl.nodeid in values))
            values[ctrl.nodeid] = {};
        values[ctrl.nodeid][ctrl.identifier] = ctrl.value;
    }
    if (client._conn)
        client._conn.send(JSON.stringify({ what: "addScene", data: { name: name, ctrls: values } }));
};

client._callReqs = function(what)
{
    if (client._reqs[what].length > 0) {
        var r = client._reqs[what];
        client._reqs[what] = [];
        for (var i = 0; i < r.length; ++i) {
            r[i]();
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

client._requestDevices = function(cb)
{
    if (client._conn) {
        if (cb)
            client._reqs.devices.push(cb);
        client._conn.send(JSON.stringify({ what: "request", data: "devices" }));
    }
};

client._requestScenes = function()
{
    if (client._conn)
        client._conn.send(JSON.stringify({ what: "request", data: "scenes" }));
};

client._requestState = function()
{
    if (client._conn)
        client._conn.send(JSON.stringify({ what: "request", data: "state" }));
};

client._requestRules = function()
{
    if (client._conn)
        client._conn.send(JSON.stringify({ what: "request", data: "rules" }));
};

client._sendConfigure = function(cfg)
{
    if (client._conn)
        client._conn.send(JSON.stringify({ what: "configure", data: cfg }));
};

client._sendSceneToggle = function(scene)
{
    if (client._conn)
        client._conn.send(JSON.stringify({ what: "toggleScene", data: scene }));
};

client._sendSceneRemove = function(scene)
{
    if (client._conn)
        client._conn.send(JSON.stringify({ what: "removeScene", data: scene }));
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

client._app = angular.module('homework', ['ui.bootstrap', 'frapontillo.bootstrap-switch', 'nya.bootstrap.select', 'ui.codemirror']);
client._app.controller("AppController", function($scope) {
    $scope.entries = {Devices: true, Scenes: false, Rules: false, Configure: false};
    $scope.controllerBody = function(controller, name) {
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
            return '<input bs-switch type="checkbox" ng-model="' + name + '.value"></input>';
        case "decimal":
        case "byte":
        case "string":
            return '<input type="text" ng-model="' + name + '.value"></input>';
        case "list":
            ret = '<ol class="nya-bs-select" ng-model="' + name + '.value">';
            alts = controller.values;
            for (i = 0; i < alts.length; ++i) {
                ret += '<li data-value="' + alts[i] + '" class="nya-bs-option"><a>' + alts[i] + '</a></li>';
            }
            return ret + '</ol>';
        };
        return controller.type;
    };
});
client._app.controller("ScenesController", function($scope) {
    client._requestScenes();
    $scope.removing = false;
});
client._app.controller("AddSceneController", function($scope) {
    console.log($scope);
    $scope.addScene = function(step)
    {
        if (step === "Next") {
            window.location.hash = "#scene-AddControllers";
            $scope.addState = "AddControllers";
            $scope.addButtonName = "Save";
        } else {
            client._addScene($scope.sceneName, $scope.selectedControllers);
            $("#addSceneModal").modal("hide");
        }
    };
});
client._app.controller("AddSceneSub2Controller", function($scope) {
    var flattened = [];
    for (var i in $scope.selectedDevices) {
        var dev = $scope.devices[i];
        var findCtrl = function(dev, id) {
            for (var i = 0; i < dev.controllers.length; ++i) {
                if (dev.controllers[i].identifier === id)
                    return dev.controllers[i];
            }
            return null;
        };
        for (var j in $scope.selectedDevices[i]) {
            var ctrlid = $scope.selectedDevices[i][j];
            var ctrl = findCtrl(dev, ctrlid);
            if (ctrl) {
                var newctrl = new client._ctors.Controller(ctrl._value);
                newctrl._setValue = function(val)
                {
                    this._value.value = val;
                };
                flattened.push(newctrl);
            }
        }
    }
    $scope.$parent.$parent.selectedControllers = flattened;
});
client._app.controller("AddSceneSub1Controller", function($scope) {
    client._requestDevices(function() {
        var tree = [];
        for (var i in client._devices) {
            var dev = client._devices[i];
            var item = { text: dev.name, homeworkId: dev.identifier, selectable: false };
            if (dev.controllers.length > 0) {
                var nodes = [];
                for (var j = 0; j < dev.controllers.length; ++j) {
                    var ctrl = dev.controllers[j];
                    if (ctrl.readOnly)
                        continue;
                    nodes.push({ text: ctrl.name, homeworkId: ctrl.identifier });
                }
                if (nodes.length > 0)
                    item.nodes = nodes;
            }
            tree.push(item);
        }
        var dom = $("#addSceneTree");
        dom.treeview({data: tree, multiSelect: true});
        dom.on('nodeSelected', function(event, data) {
            var parent = dom.treeview("getParent", data);
            if (!(parent.homeworkId in $scope.selectedDevices))
                $scope.selectedDevices[parent.homeworkId] = [data.homeworkId];
            else
                $scope.selectedDevices[parent.homeworkId].push(data.homeworkId);
        });
        dom.on('nodeUnselected', function(event, data) {
            var parent = dom.treeview("getParent", data);
            arrayRemove($scope.selectedDevices[parent.homeworkId], data.homeworkId);
            if ($scope.selectedDevices[parent.homeworkId].length === 0)
                delete $scope.selectedDevices[parent.homeworkId];
        });
    });
});
client._app.controller("DeviceController", function($scope) {
    client._requestDevices();
    $scope.modalBack = function() {
        delete $scope.currentDeviceController;
        window.history.back();
    };
});
client._app.controller("MainController", function($scope) {
    $scope.$parent.text = "abc";
    $scope.$parent.mainScope = $scope;
});
client._app.controller("ConfigController", function($scope) {
    client._requestState();
});
client._app.controller("RulesController", function($scope) {
    client._requestRules();
});
client._app.controller("AddRuleController", function($scope) {
    $scope.ruleName = "";
    $scope.editorOptions = {
        lineWrapping: true,
        lineNumbers: true,
        matchBrackets: true,
        styleActiveLine: true,
        styleSelectedText: true,
        theme: "3024-day",
        mode: "text/javascript"
    };
    $scope.code = "";
    $scope.saveRule = function() {
        console.log("saving", $scope.ruleName, $scope.code);
        $("#addRuleModal").modal("hide");
    };
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
    var scope = $("#app").scope();
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

function configure(href)
{
    client._sendConfigure(href);
}

function sceneRemove(href)
{
    var scope = $("#scenes").scope();
    if (scope.removing) {
        var really = confirm("Really remove?");
        if (really)
            client._sendSceneRemove(href);
        scope.removing = false;
        scope.$apply();
    }
}

function toggleScene(href)
{
    client._sendSceneToggle(href);
}

function toggleRemoveScene()
{
    var scope = $("#scenes").scope();
    scope.removing = !scope.removing;
    scope.$apply();
}

function addScene()
{
    $("#addSceneModal").modal();
    var scope = $("#addSceneModal").scope();
    scope.selectedDevices = Object.create(null);
    scope.addState = "AddScene";
    scope.addButtonName = "Next";
    scope.$apply();
}

function addRule()
{
    $("#addRuleModal").modal();
    // var scope = $("#addSceneModal").scope();
    // scope.selectedDevices = Object.create(null);
    // scope.addState = "AddScene";
    // scope.addButtonName = "Next";
    // scope.$apply();
}

$(document).on("hidden.bs.modal", "#deviceModal", function() {
    var scope = $("#devices").scope();
    delete scope.currentDeviceController;
    delete scope.currentDevice;
    scope.$apply();

    window.location.hash = "";
});

$(document).on("hidden.bs.modal", "#addSceneModal", function() {
    window.location.hash = "#entry-Scenes";
});

$(document).on("hidden.bs.modal", "#addRuleModal", function() {
    window.location.hash = "#entry-Rules";
});

$(document).on("shown.bs.modal", "#addRuleModal", function() {
    // geh
    var sizer = $("div.CodeMirror-sizer");
    if (sizer.length !== 1)
        return;
    if (sizer[0].style.marginLeft === "0px")
        sizer[0].style.marginLeft = "29px";
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
    case "configure":
        configure(href);
        break;
    case "scene":
        if (href === "Add") {
            addScene();
        } else if (href === "Remove") {
            toggleRemoveScene();
        } else {
            toggleScene(href);
        }
        break;
    case "rule":
        if (href === "Add") {
            addRule();
        }
        break;
    case "sceneRemove":
        sceneRemove(href);
        break;
    }
};
