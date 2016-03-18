/*global $,angular,WebSocket,EventEmitter,clearTimeout,setTimeout,clearInterval,setInterval,location*/

"use strict";

$.fn.extend({
    animateCss: function (animationName) {
        var animationEnd = 'webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend';
        $(this).addClass('animated ' + animationName).one(animationEnd, function() {
            $(this).removeClass('animated ' + animationName);
        });
    }
});

var module = angular.module('app', ['ui.bootstrap', 'ui.bootstrap-slider', 'frapontillo.bootstrap-switch', 'colorpicker.module']);
module.controller('mainController', function($scope) {
    location.hash = "#";

    $scope.Type = { Dimmer: 0, Light: 1, Fan: 2, RGBWLed: 5, Sensor: 6 };
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
            case "timerUpdated":
                $scope.listener.emitEvent("timerUpdated", [msg.timerUpdated.type, msg.timerUpdated.name, msg.timerUpdated.value]);
                break;
            case "variableUpdated":
                $scope.listener.emitEvent("variableUpdated", [msg.name, msg.value]);
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
    $scope.clearNavigation = () => {
        $scope.nav = [];
        location.hash = $scope.active;
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

module.controller('devicesController', function($scope) {
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
                    case $scope.Type.RGBWLed:
                        dev._timeout = undefined;
                        dev._pending = undefined;
                        dev._white = undefined;
                        Object.defineProperty(dev, "color", {
                            get: function() {
                                return (dev._pending || dev.values.Color.raw).substr(0, 7);
                            },
                            set: function(v) {
                                if (dev._timeout != undefined)
                                    clearTimeout(dev._timeout);
                                if (v.length == 7)
                                    v += dev._white || "00";
                                dev._pending = v;
                                dev._timeout = setTimeout(() => {
                                    console.log("setting", v);
                                    $scope.request({ type: "setValue", devuuid: dev.uuid, valname: "Color", value: v });
                                    delete dev._timeout;
                                    delete dev._pending;
                                }, 500);
                            }
                        });
                        Object.defineProperty(dev, "colorRGBW", {
                            get: function() {
                                return dev._pending || dev.values.Color.raw;
                            }
                        });
                        Object.defineProperty(dev, "white", {
                            get: function() {
                                var wh = (dev._pending || dev.values.Color.raw).substr(7);
                                if (dev._white === undefined)
                                    dev._white = wh;
                                return parseInt(wh, 16);
                            },
                            set: function(v) {
                                dev._white = v.toString(16);
                                while (dev._white.length < 2)
                                    dev._white = "0" + dev._white;
                                var c = dev.values.Color.raw.substr(0, 7) + dev._white;
                                if (dev._timeout != undefined)
                                    clearTimeout(dev._timeout);
                                dev._pending = c;
                                dev._timeout = setTimeout(() => {
                                    $scope.request({ type: "setValue", devuuid: dev.uuid, valname: "Color", value: c });
                                    console.log("setting white", c);
                                    delete dev._timeout;
                                    delete dev._pending;
                                }, 500);
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
                    case $scope.Type.Sensor:
                        if (dev.values.Motion instanceof Object) {
                            Object.defineProperty(dev, "motion", {
                                get: function() {
                                    return dev.values.Motion.raw;
                                }
                            });
                        }
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
                    // const old = {
                    //     value: val.value,
                    //     raw: val.raw
                    // };
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

module.controller('deviceController', function($scope) {
    var deviceReady = function() {
        var uuid = $scope.nav[0].replace(/_/g, ":");
        console.log("asking for dev", uuid);
        $scope.request({ type: "device", uuid: uuid }).then((response) => {
            console.log("got device", uuid, response);
            $scope.dev = response;

            $scope.request({ type: "values", devuuid: uuid }).then((response) => {
                console.log("all values", response);
                $scope.vals = response;
                $scope.$apply();
            });
        });
    };

    if ($scope.ready) {
        deviceReady();
    } else {
        $scope.listener.on("ready", deviceReady);
    }

    $scope.setValue = (v, val) => {
        console.log("set value?", v, val);
        $scope.request({ type: "setValue", devuuid: $scope.dev.uuid, valname: v.name, value: val !== undefined ? val : v.value });
    };

    const valueUpdated = (updated) => {
        if (updated.devuuid == $scope.dev.uuid) {
            // find value and update
            for (var i = 0; i < $scope.vals.length; ++i) {
                if ($scope.vals[i].name === updated.valname) {
                    const val = $scope.vals[i];
                    val.value = updated.value;
                    val.raw = updated.raw;
                    $scope.$apply();
                    break;
                }
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
    $scope.clearCachedRules = () => {
        delete $scope.rules;
        $scope.clearNavigation();
        ruleReady();
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
            //console.log("rule", $scope.nav[0]);
        }
    };
    $scope.listener.on("navigationChanged", nav);
    $scope.$on("$destroy", () => {
        $scope.listener.off("navigationChanged", nav);
        $scope.listener.off("ready", ruleReady);
    });
});

function applyEditRule($scope, $compile, applyName) {
    const newEvent = () => {
        $scope.events.push({
            ruleAlternatives: [$scope.initialRuleAlternatives.events],
            ruleSelections: [],
            ruleExtra: [],
            ruleNames: ["Events"],
            ruleTrigger: true
        });
    };
    const newAction = () => {
        $scope.actions.push({
            ruleAlternatives: [$scope.initialRuleAlternatives.actions],
            ruleSelections: [],
            ruleExtra: [],
            ruleNames: ["Actions"]
        });
    };

    const setScopeValue = function(type, row, idx, evt) {
        this[row].ruleSelections[idx] = evt;
        this[row].ruleSelections.splice(idx + 1);
        this[row].ruleAlternatives.splice(idx + 1);
        this[row].ruleExtra.splice(idx + 1);
        if (evt !== "(enter value)") {
            $scope.request({ type: type, args: this[row].ruleSelections }).then((comp) => {
                this[row].ruleAlternatives[idx + 1] = comp;
                $scope.$apply();
            });
        }
    };
    const extraScope = function(item, row, idx) {
        return {
            get value() {
                if (row >= 0 && row < item.length) {
                    if (idx >= 0 && idx < item[row].ruleExtra.length)
                        return item[row].ruleExtra[idx];
                }
                return undefined;
            },
            set value(v) {
                if (row >= 0 && row < item.length)
                    item[row].ruleExtra[idx] = v;
            }
        };
    };
    const extraScopeContinue = function(type, row, idx) {
        $scope.request({ type: type, args: this[row].ruleSelections }).then((comp) => {
            this[row].ruleAlternatives[idx + 1] = comp;
            $scope.$apply();
        });
    };
    const triggerScope = function(item, row) {
        return {
            get value() {
                if (row >= 0 && row < item.length)
                    return item[row].ruleTrigger;
                return false;
            },
            set value(v) {
                if (row >= 0 && row < item.length)
                    item[row].ruleTrigger = v;
            }
        };
    };

    $scope.pendingListener = new EventEmitter();
    $scope._reset = () => {
        $scope.generator = undefined;
        $scope.error = undefined;
        $scope.events = [];
        $scope.eventNexts = [];
        $scope.actions = [];
        $scope.initialRuleAlternatives = { events: undefined, actions: undefined };
        $scope.name = "";
        $scope.pendingReset = true;

        $scope.setEventValue = setScopeValue.bind($scope.events, "eventCompletions");
        $scope.extraEventContinue = extraScopeContinue.bind($scope.events, "eventCompletions");
        $scope.extraEvents = extraScope.bind(null, $scope.events);
        $scope.triggerEvent = triggerScope.bind(null, $scope.events);

        $scope.setActionValue = setScopeValue.bind($scope.actions, "actionCompletions");
        $scope.extraActionContinue = extraScopeContinue.bind($scope.actions, "actionCompletions");
        $scope.extraActions = extraScope.bind(null, $scope.actions);

        $scope.request({ type: "ruleTypes" }).then((types) => {
            $scope.initialRuleAlternatives.events = { type: "array", values: types.events };
            $scope.initialRuleAlternatives.actions = { type: "array", values: types.actions };

            newEvent();

            $scope.pendingReset = false;
            $scope.pendingListener.emitEvent(`resetComplete${applyName}`);

            $scope.$apply();
        });
    };
    $scope._reset();

    $scope.eventNext = (row, val) => {
        if (val === "Then") {
            if (!$scope.actions.length)
                newAction();
        } else {
            while (row + 1 >= $scope.events.length)
                newEvent();
        }
        $scope.eventNexts[row] = val;
    };
    $scope.actionNext = (row) => {
        newAction();
    };

    $scope.removeEvent = (row) => {
        $scope.events.splice(row, 1);
        var then = false;
        if (row + 1 === $scope.eventNexts.length && $scope.eventNexts[row] === "Then")
            then = true;
        $scope.eventNexts.splice(row, 1);
        if (then)
            $scope.eventNexts[row - 1] = "Then";
    },
    $scope.removeAction = (row) => {
        $scope.actions.splice(row, 1);
    },

    $scope.initializeFromRule = () => {
        const pushCommon = (cur, item) => {
            // name is the first selection
            cur.ruleSelections.push(item.name);
            for (var s = 0; s < item.steps.length; ++s) {
                var step = item.steps[s];
                var hassel = false;
                cur.ruleAlternatives.push(step.alternatives);
                if (step.alternatives.values instanceof Array) {
                    if (step.alternatives.values.indexOf(step.value) !== -1) {
                        // yep
                        cur.ruleSelections.push(step.value);
                        hassel = true;
                    } else {
                        cur.ruleSelections.push("(enter value)");
                    }
                }
                if (!hassel) {
                    cur.ruleExtra[cur.ruleAlternatives.length - 1] = step.value;
                }
            }
        };
        const pushEvent = (evt, trg) => {
            var cur = $scope.events[$scope.events.length - 1];
            if (cur.ruleSelections.length !== 0) {
                newEvent();
                cur = $scope.events[$scope.events.length - 1];
            }
            cur.ruleTrigger = trg;
            pushCommon(cur, evt);
        };
        const pushAction = (act) => {
            newAction();
            var cur = $scope.actions[$scope.actions.length - 1];
            pushCommon(cur, act);
        };

        if (!$scope.generator)
            return;
        if ($scope.name !== "")
            return;
        $scope.name = $scope.generator.name;
        const evts = $scope.generator.events;
        const trgs = $scope.generator.eventsTrigger;
        // each of the top-level events are ORs, each of the 2nd level events are ANDs.
        // the last event is THEN
        for (var ors = 0; ors < evts.length; ++ors) {
            for (var ands = 0; ands < evts[ors].length; ++ands) {
                pushEvent(evts[ors][ands], trgs[ors][ands]);
                if (ands + 1 < evts[ors].length)
                    $scope.eventNexts.push("And");
            }
            $scope.eventNexts.push((ors + 1 === evts.length) ? "Then" : "Or");
        }
        const acts = $scope.generator.actions;
        for (var act = 0; act < acts.length; ++act) {
            pushAction(acts[act]);
        }
        console.log("initialized", $scope.events, $scope.eventNexts);
    };

    $scope.generate = (rule) => {
        const internal = () => {
            $scope.generator = rule;
            $scope.initializeFromRule();

            const createInput = (key, row, val, def, extra, func, idx) => {
                var list = val.values;
                const isarray = list instanceof Array;
                var ret = "";
                if (isarray) {
                    ret += `<div class="dropdown pull-left"><button class="btn btn-default dropdown-toggle" type="button" id="${key}DropDownMenu-${row}-${idx}" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">${def}<span class="caret"></span></button><ul class="dropdown-menu" aria-labelledby="${key}DropDownMenu-${row}-${idx}">`;
                    if (val.type !== "array") {
                        ret += `<li><a href="" class="btn default" ng-click="${func}(${row}, ${idx}, '(enter value)')">(enter value)</a></li>`;
                    }
                    for (var i in list) {
                        ret += `<li><a href="" class="btn default" ng-click="${func}(${row}, ${idx}, '${list[i]}')">${list[i]}</a></li>`;
                    }
                    ret += "</ul></div>";
                }
                if (!isarray || def === "(enter value)") {
                    var pattern = "";
                    switch (val.type) {
                    case "number":
                        pattern = "[0-9]+";
                    case "boolean":
                    case "string":
                        ret += `<div class="pull-left"><input ng-keydown="$event.which === 13 && extra${key}Continue(${row}, ${idx})" type="text" ng-model="extra${key}s(${row}, ${idx}).value" class="form-control"></input></div>`;
                    }
                }
                return ret;
            };

            var ret = "", row, item, eidx, label, last;
            if ($scope.error) {
                ret += `<div class="alert alert-danger"><strong>Rule error!</strong> ${$scope.error}</div>`;
            }
            if (!$scope.generator)
                ret += `<div><input type="text" placeholder="Name" ng-model="name" class="form-control"></input></div>`;
            for (row = 0; row < $scope.events.length; ++row) {
                item = $scope.events[row];
                for (eidx = 0; eidx < item.ruleAlternatives.length; ++eidx) {
                    // console.log("hey", item.ruleAlternatives[eidx]);
                    if ("type" in item.ruleAlternatives[eidx]) {
                        ret += createInput("Event", row, item.ruleAlternatives[eidx],
                                           item.ruleSelections[eidx] || item.ruleNames[eidx] || "",
                                           item.ruleExtra[eidx] || "",
                                           "setEventValue", eidx);
                    }
                }
                ret += `<div class="pull-left hw-pad"><input type="checkbox" ng-model="triggerEvent(${row}).value"></div>`;
                label = $scope.eventNexts[row] || "More";
                last = row + 1 === $scope.events.length;
                ret += `<div class="dropdown pull-right"><button class="btn btn-default dropdown-toggle" type="button" id="eventDropDownNext-${row}" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">${label}<span class="caret"></span></button><ul class="dropdown-menu" aria-labelledby="eventDropDownNext-${row}">`;
                ret += `<li><a href="" class="btn default" ng-click="eventNext(${row},'And')">And</a></li>`;
                ret += `<li><a href="" class="btn default" ng-click="eventNext(${row},'Or')">Or</a></li>`;
                if (last)
                    ret += `<li><a href="" class="btn default" ng-click="eventNext(${row},'Then')">Then</a></li>`;
                ret += `<li><a href="" class="btn btn-danger" ng-click="removeEvent(${row})">Delete</a></li>`;
                ret += "</ul></div>";
                ret += '<div style="clear: both;"></div>';
            }
            for (row = 0; row < $scope.actions.length; ++row) {
                item = $scope.actions[row];
                for (eidx = 0; eidx < item.ruleAlternatives.length; ++eidx) {
                    // console.log("hey", item.ruleAlternatives[eidx]);
                    if ("type" in item.ruleAlternatives[eidx]) {
                        ret += createInput("Action", row, item.ruleAlternatives[eidx],
                                           item.ruleSelections[eidx] || item.ruleNames[eidx] || "",
                                           item.ruleExtra[eidx] || "",
                                           "setActionValue", eidx);
                    }
                }
                last = row + 1 === $scope.actions.length;
                label = last ? "More" : "And";
                ret += `<div class="dropdown pull-right"><button class="btn btn-default dropdown-toggle" type="button" id="actionDropDownNext-${row}" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">${label}<span class="caret"></span></button><ul class="dropdown-menu" aria-labelledby="actionDropDownNext-${row}">`;
                ret += `<li><a href="" class="btn default" ng-click="actionNext(${row})">And</a></li>`;
                ret += `<li><a href="" class="btn btn-danger" ng-click="removeAction(${row})">Delete</a></li>`;
                ret += "</ul></div>";
                ret += '<div style="clear: both;"></div>';
            }
            if ($scope.generator) {
                ret += '<div class="pull-right"><button type="button" class="btn btn-default" ng-click="cancel()">Cancel</button></div>';
                ret += '<div class="pull-right"><button type="button" class="btn btn-default" ng-click="save()">Save</button></div>';
                ret += '<div style="clear: both;"></div>';
            }
            return ret;
        };
        if (!$scope.pendingReset) {
            return internal();
        } else if (rule) {
            $scope.pendingListener.removeEvent(`resetComplete${applyName}`);
            $scope.pendingListener.on(`resetComplete${applyName}`, () => {
                var content = $compile(internal())($scope);
                var elem = $(`#edit-${rule.safename}`);
                elem.append(content);
            });
        }
        return "";
    };

    $scope.cancel = () => {
        $scope.clearCachedRules();
        $scope._reset();
    },
    $scope.save = () => {
        $scope.error = undefined;

        var events = [[]];
        var event = events[0], cur, sel, ex, s, tr;
        for (var e = 0; e < $scope.events.length; ++e) {
            cur = [];
            sel = $scope.events[e].ruleSelections;
            ex = $scope.events[e].ruleExtra;
            tr = $scope.events[e].ruleTrigger;
            var nx = $scope.eventNexts[e];
            if (nx === undefined) {
                $scope.error = `No next for event:${e}`;
                return;
            }
            for (s = 0; s < sel.length; ++s) {
                if (sel[s] === undefined) {
                    $scope.error = `No selection for event:${e}:${s}`;
                    return;
                }

                cur.push(ex[s] || sel[s]);
            }
            event.push({ trigger: tr, event: cur });
            if (nx === "Or") {
                events.push([]);
                event = events[events.length - 1];
            }
            if (nx === "Then" && e + 1 < $scope.events.length) {
                $scope.error = `Event condition after then for event:${e}`;
                return;
            }
        }
        var actions = [];
        for (var a = 0; a < $scope.actions.length; ++a) {
            cur = [];
            sel = $scope.actions[a].ruleSelections;
            ex = $scope.actions[a].ruleExtra;
            for (s = 0; s < sel.length; ++s) {
                if (sel[s] === undefined) {
                    $scope.error = `No selection for action:${a}:${s}`;
                    return;
                }

                cur.push(ex[s] || sel[s]);
            }
            actions.push(cur);
        }

        console.log(events);
        console.log(actions);
        $scope
            .request({ type: "createRule", rule: { name: $scope.name, events: events, actions: actions } })
            .then((result) => {
                console.log("rule created", result, $scope.generator);
                if ($scope.generator) {
                    $scope.clearCachedRules();
                    $scope.$apply();
                } else {
                    $("#addRuleModal").modal("hide");
                }
            }).catch((error) => {
                $scope.error = error;
                $scope.$apply();
            });
    };
}

module.controller('editRuleController', function($scope, $compile) {
    applyEditRule.call(this, $scope, $compile, 'edit');

    $scope.$on("$destroy", () => {
        $scope._reset();
    });
});

module.controller('addRuleController', function($scope, $compile) {
    applyEditRule.call(this, $scope, $compile, 'add');

    $("#addRuleModal").on('hidden.bs.modal', () => {
        $scope._reset();
    });
});

module.controller('variableController', function($scope) {
    const variableReady = () => {
        $scope.request({ type: "variables" }).then((vars) => {
            $scope.variables = vars.variables;
            $scope.$apply();
        });
    };

    $scope.error = undefined;
    $scope.error = undefined;
    if ($scope.ready) {
        variableReady();
    } else {
        $scope.listener.on("ready", variableReady);
    }

    $scope.addVariable = () => {
        $('#addVariableModal').modal('show');
    };

    $scope.clear = (name) => {
        $scope.variables[name] = null;
    };

    $scope.save = () => {
        $scope
            .request({ type: "setVariables", variables: $scope.variables })
            .then(() => {
                $scope.success = "Saved";
                $scope.$apply();

                setTimeout(() => {
                    $scope.success = undefined;
                    $scope.$apply();
                }, 5000);
            })
            .catch((err) => {
                $scope.error = err;
                $scope.$apply();
            });
    };

    const variableUpdated = (name, val) => {
        $scope.variables[name] = val;
        $scope.$apply();

        $(`#key-${name}`).animateCss("rubberBand");
    };

    $scope.listener.on("variableUpdated", variableUpdated);
    $scope.$on("$destroy", () => {
        $scope.listener.off("variableUpdated", variableUpdated);
    });
});

module.controller('addVariableController', function($scope) {
    $scope.name = "";
    $scope.error = undefined;
    $scope.save = () => {
        $scope
            .request({ type: "createVariable", name: $scope.name })
            .then(() => {
                $('#addVariableModal').modal('hide');
            })
            .catch((err) => {
                $scope.error = err;
                $scope.$apply();
            });
    };
});

module.controller('timerController', function($scope) {
    const timerReady = () => {
        $scope.request({ type: "timers", sub: "all" }).then((response) => {
            $scope.timeout = response.timers.timeout;
            $scope.interval = response.timers.interval;
            $scope.schedule = response.timers.schedule;
            $scope.serverReceived = (new Date()).getTime();
            $scope.serverOffset = $scope.serverReceived - response.timers.now;
            console.log(response);

            const updateTimers = () => {
                const now = new Date().getTime();
                // update all timeouts and intervals

                var k, t, long;
                for (k in $scope.timeout) {
                    t = $scope.timeout[k];
                    if (t.state === "running") {
                        t.now = $scope.serverOffset + now - t.started;
                    }
                }
                for (k in $scope.interval) {
                    t = $scope.interval[k];
                    if (t.state === "running") {
                        t.now = $scope.serverOffset + now - t.started;
                    }
                }
            };

            updateTimers();
            if ($scope._updater)
                clearInterval($scope._updater);
            $scope._updater = setInterval(() => {
                // update and apply
                updateTimers();
                $scope.$apply();
            }, 200);

            $scope.$apply();
        });
    };

    if ($scope.ready) {
        timerReady();
    } else {
        $scope.listener.on("ready", timerReady);
    }

    $scope.adding = undefined;
    $scope.add = (type) => {
        $scope.adding = type;
        $('#addTimerModal').modal('show');
    };
    $scope.stop = (name, sub) => {
        console.log("stop", name, sub);
        $scope
            .request({ type: "stopTimer", name: name, sub: sub })
            .then(() => {
                $scope.success = "Stopped";
                $scope.$apply();

                setTimeout(() => {
                    $scope.success = undefined;
                    $scope.$apply();
                }, 5000);
            })
            .catch((err) => {
                $scope.error = err;
                $scope.$apply();
            });
    };
    $scope.restart = (name, sub) => {
        console.log("restart", name, sub);
        if ($scope.restarting) {
            const r = $scope.restarting;
            console.log(r);

            $('#restartTimerModal').modal('hide');

            const val = parseInt(r.value);
            if (val + "" != r.value) {
                $scope.error = `${r.value} needs to be an integer`;
                return;
            }

            $scope
                .request({ type: "restartTimer", name: r.name, sub: r.sub, value: val })
                .then(() => {
                    $scope.success = "Restarted";
                    $scope.$apply();

                    setTimeout(() => {
                        $scope.success = undefined;
                        $scope.$apply();
                    }, 5000);
                })
                .catch((err) => {
                    $scope.error = err;
                    $scope.$apply();
                });

            return;
        }

        $scope.restarting = { name: name, sub: sub, value: undefined };
        $('#restartTimerModal').modal('show');
    };
    $scope.saveSchedules = () => {
        $scope
            .request({ type: "setSchedules", schedules: $scope.schedule })
            .then(() => {
                $scope.success = "Saved";
                $scope.$apply();

                setTimeout(() => {
                    $scope.success = undefined;
                    $scope.$apply();
                }, 5000);
            })
            .catch((err) => {
                $scope.error = err;
                $scope.$apply();
            });
    };

    const timerUpdated = (type, name, value) => {
        // $scope.variables[name] = val;
        // $scope.$apply();
        switch (type) {
        case "timeout":
        case "interval":
            var prevstate = (name in $scope[type]) ? $scope[type][name].state : "idle";
            var prevstarted = (name in $scope[type]) ? $scope[type][name].started : undefined;
            if (value.state === "idle" && prevstate === "running")
                $(`#${type}-${name}`).animateCss("rubberBand");
            else if (prevstarted !== undefined && value.state === "running" && value.started > prevstarted)
                $(`#${type}-${name}`).animateCss("rubberBand");
        case "schedule":
            // implement me
        }
        if (type in $scope)
            $scope[type][name] = value;
    };

    $scope.listener.on("timerUpdated", timerUpdated);
    $scope.$on("$destroy", () => {
        $scope.listener.off("timerUpdated", timerUpdated);
        clearInterval($scope._updater);
    });

    $("#restartTimerModal").on('hidden.bs.modal', () => {
        $scope.restarting = undefined;
    });
});

module.controller('addTimerController', function($scope) {
    $scope.timername = "";
    $scope.timervalue = "";
    $scope.error = undefined;
    $scope.save = () => {
        $scope
            .request({ type: "createTimer", sub: $scope.adding, name: $scope.timername, value: $scope.timervalue })
            .then(() => {
                $('#addTimerModal').modal('hide');
            })
            .catch((err) => {
                $scope.error = err;
                $scope.$apply();
            });
    };
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
