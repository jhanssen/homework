/*global $,angular,WebSocket,EventEmitter,clearTimeout,setTimeout,location*/

"use strict";

var module = angular.module('app', ['ui.bootstrap', 'ui.bootstrap-slider', 'frapontillo.bootstrap-switch']);
module.controller('mainController', function($scope) {
    location.hash = "#";

    $scope.Type = { Dimmer: 0, Light: 1, Fan: 2 };
    $scope.active = "devices";
    $scope.nav = [];

    $scope.ready = false;
    $scope.listener = new EventEmitter();
    $scope.id = 0;
    $scope.isActive = (section) => {
        return section == $scope.active;
    };
    $scope.activeClass = (section) => {
        return $scope.isActive(section) ? "active" : "";
    };
    $scope.request = (req) => {
        const p = new Promise((resolve, reject) => {
            let id = ++$scope.id;
            req.id = id;
            // this.log("sending req", JSON.stringify(req));
            $scope.listener.on("response", (resp) => {
                if ("id" in resp && resp.id == id) {
                    if ("result" in resp) {
                        resolve(resp.result);
                    } else if ("error" in resp) {
                        reject(resp.error);
                    } else {
                        reject("no result or error in response: " + JSON.stringify(resp));
                    }
                }
            });
            $scope.listener.on("close", () => {
                reject("connection closed");
            });
            $scope.socket.send(JSON.stringify(req));
        });
        return p;
    };
    $scope.socket = new WebSocket(`ws://${window.location.hostname}:8093/`);
    $scope.socket.onmessage = (evt) => {
        var msg;
        try {
            msg = JSON.parse(evt.data);
        } catch (e) {
            console.error("can't JSON parse", evt.data);
            return;
        }
        if ("type" in msg) {
            switch (msg.type) {
            case "ready":
                if (msg.ready) {
                    $scope.ready = true;
                    $scope.listener.emitEvent("ready");
                }
                break;
            case "valueUpdated":
                $scope.listener.emitEvent("valueUpdated", [msg.valueUpdated]);
                break;
            default:
                console.log("unrecognized message", msg);
                break;
            }
        } else {
            // might be a response?
            if ("id" in msg) {
                $scope.listener.emitEvent("response", [msg]);
            } else {
                console.log("unrecognized message", msg);
            }
        }
    };
    $scope.socket.onclose = () => {
        $scope.listener.emitEvent("close");
    };

    $(window).on("hashchange", () => {
        const changeLocation = (l) => {
            const split = l.split("/");
            $scope.active = split[0];
            $scope.nav = split.slice(1);
            $scope.listener.emitEvent("navigationChanged");
            $scope.$apply();
        };
        if (!location.hash.length) {
            changeLocation("devices");
        } else {
            changeLocation(location.hash.substr(1));
        }
    });
});

// module.filter("sanitize", ['$sce', function($sce) {
//     return function(htmlCode){
//         return $sce.trustAsHtml(htmlCode);
//     };
// }]);

module.directive('compile', ['$compile', function ($compile) {
    return function(scope, element, attrs) {
        scope.$watch(
            function(scope) {
                // watch the 'compile' expression for changes
                return scope.$eval(attrs.compile);
            },
            function(value) {
                // when the 'compile' expression changes
                // assign it into the current DOM
                element.html(value);

                // compile the new DOM and link it to the current
                // scope.
                // NOTE: we only compile .childNodes so that
                // we don't get into infinite loop compiling ourselves
                $compile(element.contents())(scope);
            }
        );
    };
}]);

module.controller('deviceController', function($scope) {
    // request devices
    const deviceReady = () => {
        $scope.request({ type: "devices" }).then((response) => {
            console.log("got devices", response);
            if (!(response instanceof Array))
                return;
            var devs = Object.create(null);
            var rem = response.length;
            var done = () => {
                console.log("got all device values");

                var updateColor = (dev) => {
                    const r = dev.max - dev.values.level.raw;
                    const g = dev.values.level.raw;
                    const tohex = (v, max) => {
                        var ret = Math.floor(v / dev.max * max).toString(16);
                        return "00".substr(0, 2 - ret.length) + ret;
                    };
                    const hc = "#" + tohex(r, 210) + tohex(g, 210) + "00";
                    $("#slider-" + dev.safeuuid + " .slider-handle").css("background", hc);
                    const tc = "#" + tohex(r, 110) + tohex(g, 110) + "00";
                    $("#slider-" + dev.safeuuid + " .slider-track").css("background", tc);
                    $("#slider-" + dev.safeuuid + " .slider-selection").css("background", tc);
                };

                // fixup devices
                for (var k in devs) {
                    let dev = devs[k];
                    dev.safeuuid = dev.uuid.replace(/:/g, "_");
                    switch (dev.type) {
                    case $scope.Type.Dimmer:
                        dev.max = dev.values.level.range[1];
                        dev._timeout = undefined;
                        Object.defineProperty(dev, "level", {
                            get: function() {
                                updateColor(dev);
                                return dev.values.level.raw;
                            },
                            set: function(v) {
                                if (typeof v === "number") {
                                    if (dev._timeout != undefined)
                                        clearTimeout(dev._timeout);
                                    dev._timeout = setTimeout(() => {
                                        $scope.request({ type: "setValue", devuuid: dev.uuid, valname: "level", value: v });
                                        delete dev._timeout;
                                    }, 500);
                                } else {
                                    throw "invalid value type for dimmer: " + (typeof v);
                                }
                            }
                        });
                        break;
                    case $scope.Type.Light:
                    case $scope.Type.Fan:
                        Object.defineProperty(dev, "value", {
                            get: function() {
                                return dev.values.value.raw != 0;
                            },
                            set: function(a) {
                                $scope.request({ type: "setValue", devuuid: dev.uuid, valname: "value", value: a ? 1 : 0 });
                            }
                        });
                        break;
                    }
                }

                $scope.devices = devs;
                $scope.$apply();
            };
            for (var i = 0; i < response.length; ++i) {
                let uuid = response[i].uuid;
                devs[uuid] = response[i];
                devs[uuid].values = Object.create(null);
                $scope.request({ type: "values", devuuid: uuid }).then((response) => {
                    if (response instanceof Array) {
                        for (var i = 0; i < response.length; ++i) {
                            let val = response[i];
                            devs[uuid].values[val.name] = val;
                        }
                    }
                    if (!--rem)
                        done();
                });
            }
        });
    };

    if ($scope.ready) {
        deviceReady();
    } else {
        $scope.listener.on("ready", deviceReady);
    }

    const valueUpdated = (updated) => {
        if (typeof $scope.devices === "object") {
            if (updated.devuuid in $scope.devices) {
                const dev = $scope.devices[updated.devuuid];
                if (updated.valname in dev.values) {
                    const val = dev.values[updated.valname];
                    const old = {
                        value: val.value,
                        raw: val.raw
                    };
                    val.value = updated.value;
                    val.raw = updated.raw;

                    $scope.$apply();
                } else {
                    console.log("value updated but value not known", updated.devuuid, updated.valname);
                }
            } else {
                console.log("value for unknown device, discarding", updated.devuuid, updated.valname);
            }
        }
    };
    $scope.listener.on("valueUpdated", valueUpdated);
    $scope.$on("$destroy", () => {
        $scope.listener.off("valueUpdated", valueUpdated);
        $scope.listener.off("ready", deviceReady);
    });
});

module.controller('ruleController', function($scope) {
    const ruleReady = () => {
        $scope.request({ type: "rules" }).then((rules) => {
            $scope.rules = rules.map((r) => { r.safename = r.name.replace(/ /g, "_"); return r; });
            $scope.$apply();
        });
    };

    $scope.adding = false;

    if ($scope.ready) {
        ruleReady();
    } else {
        $scope.listener.on("ready", ruleReady);
    }

    $scope.activeRule = (r) => {
        return $scope.nav.length > 0 && $scope.nav[0] == r;
    };

    $scope.addRule = () => {
        $scope.adding = true;
        $('#addRuleModal').modal('show');
    };
    $scope.ruleClass = () => {
        return $scope.adding ? "hw-blur" : "";
    };
    $("#addRuleModal").on('hidden.bs.modal', () => {
        $scope.adding = false;
        $scope.$apply();
    });

    const nav = () => {
        if ($scope.active !== "rules")
            return;
        if ($scope.nav.length > 0) {
            // we have a rule selected
            console.log("rule", $scope.nav[0]);
        }
    };
    $scope.listener.on("navigationChanged", nav);
    $scope.$on("$destroy", () => {
        $scope.listener.off("navigationChanged", nav);
        $scope.listener.off("ready", ruleReady);
    });
});

module.controller('addRuleController', function($scope) {
    const newEvent = () => {
        $scope.events.push({
            ruleAlternatives: [$scope.initialRuleAlternatives.events],
            ruleSelections: [],
            ruleExtra: [],
            ruleNames: ["Events"]
        });
    };

    var reset = () => {
        $scope.events = [];
        $scope.eventNexts = [];
        $scope.initialRuleAlternatives = { events: undefined, actions: undefined };

        $scope.request({ type: "ruleTypes" }).then((types) => {
            $scope.initialRuleAlternatives.events = { type: "array", values: types.events };
            $scope.initialRuleAlternatives.actions = { type: "array", values: types.actions };

            newEvent();
            $scope.$apply();
        });
    };
    reset();

    $scope.setEventValue = (row, idx, evt) => {
        $scope.events[row].ruleSelections[idx] = evt;
        $scope.events[row].ruleSelections.splice(idx + 1);
        $scope.events[row].ruleAlternatives.splice(idx + 1);
        $scope.events[row].ruleExtra.splice(idx + 1);
        if (evt !== "(enter value)") {
            $scope.request({ type: "eventCompletions", args: $scope.events[row].ruleSelections }).then((comp) => {
                $scope.events[row].ruleAlternatives[idx + 1] = comp;
                $scope.$apply();
            });
        }
    };
    $scope.extraEvents = (row, idx) => {
        return {
            get value() { return $scope.events[row].ruleExtra[idx]; },
            set value(v) { $scope.events[row].ruleExtra[idx] = v; }
        };
    },
    $scope.extraEventContinue = (row, idx) => {
        $scope.request({ type: "eventCompletions", args: $scope.events[row].ruleSelections }).then((comp) => {
            $scope.events[row].ruleAlternatives[idx + 1] = comp;
            $scope.$apply();
        });
    };
    $scope.eventNext = (row, val) => {
        while (row + 1 >= $scope.events.length)
            newEvent();
        $scope.eventNexts[row] = val;
    };
    $scope.removeEvent = (row) => {
        $scope.events.splice(row, 1);
    },
    $scope.generate = () => {
        const createInput = (row, val, def, extra, func, idx) => {
            var list = val.values;
            var ret = "";
            if (list instanceof Array) {
                ret += `<div class="dropdown pull-left"><button class="btn btn-default dropdown-toggle" type="button" id="eventDropDownMenu-${row}-${idx}" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">${def}<span class="caret"></span></button><ul class="dropdown-menu" aria-labelledby="eventDropDownMenu-${row}-${idx}">`;
                if (val.type !== "array") {
                    ret += `<li><a href="" class="btn default" ng-click="${func}(${row}, ${idx}, '(enter value)')">(enter value)</a></li>`;
                }
                for (var i in list) {
                    ret += `<li><a href="" class="btn default" ng-click="${func}(${row}, ${idx}, '${list[i]}')">${list[i]}</a></li>`;
                }
                ret += "</ul></div>";
            }
            if (def === "(enter value)") {
                var pattern = "";
                switch (val.type) {
                case "number":
                    pattern = "[0-9]+";
                case "string":
                    ret += `<div class="pull-left"><input ng-keydown="$event.which === 13 && extraEventContinue(${row}, ${idx})" type="text" ng-model="extraEvents(${row}, ${idx}).value" class="form-control"></input></div>`;
                }
            }
            return ret;
        };

        var ret = "";
        for (var row = 0; row < $scope.events.length; ++row) {
            var item = $scope.events[row];
            for (var eidx = 0; eidx < item.ruleAlternatives.length; ++eidx) {
                // console.log("hey", item.ruleAlternatives[eidx]);
                if ("type" in item.ruleAlternatives[eidx]) {
                    ret += createInput(row, item.ruleAlternatives[eidx],
                                       item.ruleSelections[eidx] || item.ruleNames[eidx] || "",
                                       item.ruleExtra[eidx] || "",
                                       "setEventValue", eidx);
                }
            }
            var label = $scope.eventNexts[row] || "More";
            ret += `<div class="dropdown pull-right"><button class="btn btn-default dropdown-toggle" type="button" id="eventDropDownNext-${row}" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">${label}<span class="caret"></span></button><ul class="dropdown-menu" aria-labelledby="eventDropDownNext-${row}">`;
            ret += `<li><a href="" class="btn default" ng-click="eventNext(${row},'And')">And</a></li>`;
            ret += `<li><a href="" class="btn default" ng-click="eventNext(${row},'Or')">Or</a></li>`;
            ret += `<li><a href="" class="btn default" ng-click="eventNext(${row},'Then')">Then</a></li>`;
            ret += `<li><a href="" class="btn btn-danger" ng-click="removeEvent(${row})">Delete</a></li>`;
            ret += "</ul></div>";
            ret += '<div style="clear: both;"></div>';
        }
        return ret;
    };

    $("#addRuleModal").on('hidden.bs.modal', () => {
        reset();
    });
});

$(document).ready(function() {
    //stick in the fixed 100% height behind the navbar but don't wrap it
    $('#slide-nav.navbar-inverse').after($('<div class="inverse" id="navbar-height-col"></div>'));
    $('#slide-nav.navbar-default').after($('<div id="navbar-height-col"></div>'));

    // Enter your ids or classes
    var toggler = '.navbar-toggle';
    var pagewrapper = '#page-content';
    var navigationwrapper = '.navbar-header';
    var menuwidth = '100%'; // the menu inside the slide menu itself
    var slidewidth = '80%';
    var menuneg = '-100%';
    var slideneg = '-80%';

    $("#slide-nav").on("click", toggler, function(e) {
        var selected = $(this).hasClass('slide-active');
        $('#slidemenu').stop().animate({
            left: selected ? menuneg : '0px'
        });
        $('#navbar-height-col').stop().animate({
            left: selected ? slideneg : '0px'
        });
        $(pagewrapper).stop().animate({
            left: selected ? '0px' : slidewidth
        });
        $(navigationwrapper).stop().animate({
            left: selected ? '0px' : slidewidth
        });

        $(this).toggleClass('slide-active', !selected);
        $('#slidemenu').toggleClass('slide-active');
        $('#page-content, .navbar, body, .navbar-header').toggleClass('slide-active');
    });

    var selected = '#slidemenu, #page-content, body, .navbar, .navbar-header';

    $(window).on("resize", function() {
        if ($(window).width() > 767 && $('.navbar-toggle').is(':hidden')) {
            $(selected).removeClass('slide-active');
        }
    });
});
