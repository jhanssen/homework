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

var module = angular.module('app', ['ui.bootstrap', 'ui.bootstrap-slider', 'frapontillo.bootstrap-switch', 'colorpicker.module', 'ngDraggable']);
module.controller('mainController', function($scope) {
    location.hash = "#";

    $scope.active = "devices";
    $scope.nav = [];

    $scope.ready = false;
    $scope.listener = new EventEmitter();
    $scope.id = 0;
    $scope.isActive = function(section) {
        return section == $scope.active;
    };
    $scope.activeClass = function(section) {
        return $scope.isActive(section) ? "active" : "";
    };
    $scope.request = function(req) {
        var p = new Promise(function(resolve, reject) {
            var id = ++$scope.id;
            req.id = id;
            // this.log("sending req", JSON.stringify(req));
            $scope.listener.on("response", function(resp) {
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
            $scope.listener.on("close", function() {
                reject("connection closed");
            });
            $scope.socket.send(JSON.stringify(req));
        });
        return p;
    };
    var pingInterval;
    if (window.location.hostname == "www.homework.software") {
        $scope.socket = new WebSocket(`wss://${window.location.hostname}/user/site`);
        //pingInterval = setInterval(function() { $scope.socket.ping(); }, (20 * 1000 * 60));
    } else {
        $scope.socket = new WebSocket(`ws://${window.location.hostname}:8093/`);
    }
    $scope.socket.onmessage = function(evt) {
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

    $scope.socket.onclose = function() {
        $scope.listener.emitEvent("close");
        if (pingInterval) {
            clearInterval(pingInterval);
            pingInterval = undefined;
        }
    };
    $scope.clearNavigation = function() {
        $scope.nav = [];
        location.hash = $scope.active;
    };

    $(window).on("hashchange", function() {
        var changeLocation = function(l) {
            var split = l.split("/");
            var old = { active: $scope.active, nav: $scope.nav };
            $scope.active = split[0];
            $scope.nav = split.slice(1);
            $scope.listener.emitEvent("navigationChanged", [old]);
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
    var updateNavigation = function(nav, old) {
        var setAll = function() {
            $scope.currentDevices = $scope.devices;
            $scope.currentGroup = "all";
        };
        if (nav.length > 0) {
            // we have a group selected
            console.log("device group", nav[0]);
            switch (nav[0]) {
            case "":
            case "all":
                setAll();
                break;
            case "add":
                $scope.oldNav = old;
                $('#addGroupModal').modal('show');
                break;
            default:
                var grp = nav[0];
                $scope.currentDevices = {};
                for (var k in $scope.devices) {
                    if ($scope.devices[k].groups.indexOf(grp) !== -1) {
                        $scope.currentDevices[k] = $scope.devices[k];
                    }
                }
                $scope.currentGroup = grp;
            }
        } else {
            setAll();
        }
    };
    var deviceReady = function() {
        $scope.request({ type: "devices" }).then(function(response) {
            console.log("got devices", response);
            if (!(response instanceof Array))
                return;
            var devs = Object.create(null);
            var grps = [];
            var rem = response.length;
            var done = function() {
                console.log("got all device values");

                var updateColor = function(dev) {
                    var r = dev.max - dev.values.level.raw;
                    var g = dev.values.level.raw;
                    var tohex = function(v, max) {
                        var ret = Math.floor(v / dev.max * max).toString(16);
                        return "00".substr(0, 2 - ret.length) + ret;
                    };
                    var hc = "#" + tohex(r, 210) + tohex(g, 210) + "00";
                    $("#slider-" + dev.safeuuid + " .slider-handle").css("background", hc);
                    var tc = "#" + tohex(r, 110) + tohex(g, 110) + "00";
                    $("#slider-" + dev.safeuuid + " .slider-track").css("background", tc);
                    $("#slider-" + dev.safeuuid + " .slider-selection").css("background", tc);
                };

                // fixup devices
                for (var k in devs) {
                    (function(dev) {
                        for (var gi = 0; gi < dev.groups.length; ++gi) {
                            var grp = dev.groups[gi];
                            if (grps.indexOf(grp) === -1)
                                grps.push(grp);
                        }

                        Object.defineProperty(dev, "fullName", {
                            get: function() {
                                var n = this.name;
                                if (this.room !== undefined)
                                    n = this.room + " " + n;
                                if (this.floor !== undefined)
                                    n = this.floor + " " + n;
                                return n;
                            }
                        });

                        dev.safeuuid = dev.uuid.replace(/:/g, "_");
                        switch (dev.type) {
                        case "Dimmer":
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
                                        dev._timeout = setTimeout(function() {
                                            $scope.request({ type: "setValue", devuuid: dev.uuid, valname: "level", value: v });
                                            delete dev._timeout;
                                        }, 500);
                                    } else {
                                        throw "invalid value type for dimmer: " + (typeof v);
                                    }
                                }
                            });
                            break;
                        case "RGBWLed":
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
                                    dev._timeout = setTimeout(function() {
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
                                    dev._timeout = setTimeout(function() {
                                        $scope.request({ type: "setValue", devuuid: dev.uuid, valname: "Color", value: c });
                                        console.log("setting white", c);
                                        delete dev._timeout;
                                        delete dev._pending;
                                    }, 500);
                                }
                            });
                            break;
                        case "Light":
                        case "Fan":
                            Object.defineProperty(dev, "value", {
                                get: function() {
                                    return dev.values.value.raw != 0;
                                },
                                set: function(a) {
                                    $scope.request({ type: "setValue", devuuid: dev.uuid, valname: "value", value: a ? 1 : 0 });
                                }
                            });
                            break;
                        case "Sensor":
                            if (dev.values.Motion instanceof Object) {
                                Object.defineProperty(dev, "motion", {
                                    get: function() {
                                        return dev.values.Motion.raw;
                                    }
                                });
                            }
                            break;
                        case "GarageDoor":
                            Object.defineProperty(dev, "mode", {
                                set: function(v) {
                                    $scope.request({ type: "setValue", devuuid: dev.uuid, valname: "mode", value: v });
                                    //console.log("setting", dev.uuid, v);
                                }
                            });
                            Object.defineProperty(dev, "state", {
                                get: function() {
                                    return dev.values.state.raw;
                                }
                            });
                        }
                    })(devs[k]);
                }

                $scope.devices = devs;
                updateNavigation($scope.nav);
                $scope.groups = grps;
                $scope.$apply();
            };
            for (var i = 0; i < response.length; ++i) {
                (function(uuid) {
                    devs[uuid] = response[i];
                    devs[uuid].values = Object.create(null);
                    $scope.request({ type: "values", devuuid: uuid }).then(function(response) {
                        if (response instanceof Array) {
                            for (var i = 0; i < response.length; ++i) {
                                var val = response[i];
                                devs[uuid].values[val.name] = val;
                            }
                        }
                        if (!--rem)
                            done();
                    });
                })(response[i].uuid);
            }
        });
    };

    $scope.groups = [];
    updateNavigation($scope.nav);

    $scope.activeGroup = function(grp) {
        return grp == $scope.currentGroup ? "active" : "";
    };

    if ($scope.ready) {
        deviceReady();
    } else {
        $scope.listener.on("ready", deviceReady);
    }

    var valueUpdated = function(updated) {
        if (typeof $scope.devices === "object") {
            if (updated.devuuid in $scope.devices) {
                var dev = $scope.devices[updated.devuuid];
                if (updated.valname in dev.values) {
                    var val = dev.values[updated.valname];
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

    $scope.setLocation = function(loc) {
        if (typeof loc === "string") {
            location.href = loc;
        } else if (typeof loc === "object" && "active" in loc) {
            var l = "#" + loc.active + "/" + loc.nav.join("/");
            location.href = l;
        }
    };

    var nav = function(old) {
        if ($scope.active !== "devices")
            return;
        updateNavigation($scope.nav, old);
        $scope.$apply();
    };

    $("#addGroupModal").on('hidden.bs.modal', function() {
        $scope.$apply();
        $scope.setLocation($scope.oldNav);
    });

    $scope.onDropDevice = function($data, $event, group) {
        console.log("drop", $data, $event, group);
        $scope.request({ type: "setGroup", uuid: $data.uuid, group: group }).then(function() {
            var dev = $scope.devices[$data.uuid];
            dev.groups = [group];
            $scope.$apply();
        });
    };

    $scope.addDevice = function() {
        $('#addDeviceModal').modal('show');
    },
    $scope.restoreDevices = function() {
        $('#restoreDevicesModal').modal('show');
    };
    $scope.clearCachedDevices = function() {
        deviceReady();
    };

    $scope.listener.on("navigationChanged", nav);

    $scope.listener.on("valueUpdated", valueUpdated);
    $scope.$on("$destroy", function() {
        $scope.listener.off("valueUpdated", valueUpdated);
        $scope.listener.off("ready", deviceReady);
        $scope.listener.off("navigationChanged", nav);
    });
});

module.controller('addDeviceController', function($scope) {
    $scope.name = undefined;
    $scope.error = undefined;
    $scope.save = function() {
        if (typeof $scope.name !== "string" || !$scope.name.length) {
            $scope.error = "Invalid name";
            return;
        }
        $scope.request({ type: "addDevice", name: $scope.name }).then(function() {
            $('#addDeviceModal').modal('hide');
        }).catch(function(err) {
            $scope.error = err;
            $scope.$apply();
        });
    };
});

module.controller('restoreDevicesController', function($scope) {
    $('#restoreDevicesModal').on('shown.bs.modal', function() {
        $scope.request({ type: "restore", file: "devices" }).then(function(devices) {
            console.log(devices);
            $scope.deviceCandidates = devices;
            $scope.$apply();
        });
    });

    $scope.restoreDevice = function(sha256) {
        $scope.request({ type: "restore", file: "devices", sha256: sha256 }).then(function() {
            $("#restoreDevicesModal").modal("hide");

            $scope.clearCachedDevices();
        });
    };
});

module.controller('addGroupController', function($scope) {
    $scope.name = "";
    $scope.save = function() {
        if ($scope.name.length > 0 && $scope.groups.indexOf($scope.name) === -1) {
            if ($scope.name !== "add" && $scope.name !== "all")
                $scope.groups.push($scope.name);
        }
        $('#addGroupModal').modal('hide');
    };

    $("#addGroupModal").on('hidden.bs.modal', function() {
        $scope.name = "";
    });
});

module.controller('deviceController', function($scope) {
    var deviceReady = function() {
        var uuid = $scope.nav[0].replace(/_/g, ":");
        console.log("asking for dev", uuid);
        $scope.request({ type: "device", uuid: uuid }).then(function(response) {
            console.log("got device", uuid, response);
            $scope.dev = response;
            $scope.dev.virtual = $scope.dev.type == "Virtual";

            $scope.request({ type: "devicedata" }).then(function(response) {
                $scope.rooms = response.rooms;
                $scope.floors = response.floors;
                $scope.deviceTypes = response.types;
                $scope.request({ type: "values", devuuid: uuid }).then(function(response) {
                    console.log("all values", response);
                    $scope.vals = response;
                    $scope.$apply();
                });
            });
        });
    };

    if ($scope.ready) {
        deviceReady();
    } else {
        $scope.listener.on("ready", deviceReady);
    }

    $scope.setValue = function(v, val) {
        console.log("set value?", v, val);
        $scope.request({ type: "setValue", devuuid: $scope.dev.uuid, valname: v.name, value: val !== undefined ? val : v.value });
    };
    $scope.setName = function(dev) {
        console.log("set name?", dev.name);
        $scope.request({ type: "setName", devuuid: dev.uuid, name: dev.name });
    };
    $scope.setRoom = function(dev, r) {
        console.log("set room", dev.name, r);
        if (r === undefined)
            r = dev.room;
        $scope.request({ type: "setRoom", devuuid: $scope.dev.uuid, room: r })
            .then(function() {
                dev.room = r;
                $scope.$apply();
            });
    };
    $scope.setFloor = function(dev, f) {
        console.log("set floor", dev.name, f);
        if (f === undefined)
            f = dev.floor;
        $scope.request({ type: "setFloor", devuuid: $scope.dev.uuid, floor: f })
            .then(function() {
                dev.floor = f;
                $scope.$apply();
            });
    };
    $scope.setType = function(dev, t) {
        console.log("set type?", dev.uuid, t);
        $scope.request({ type: "setType", devuuid: dev.uuid, devtype: t })
            .then(function() {
                dev.type = t;
                $scope.$apply();
            });
    };
    $scope.addValue = function() {
        $('#addDeviceValueModal').modal('show');
    };

    var valueUpdated = function(updated) {
        if (updated.devuuid == $scope.dev.uuid) {
            // find value and update
            for (var i = 0; i < $scope.vals.length; ++i) {
                if ($scope.vals[i].name === updated.valname) {
                    var val = $scope.vals[i];
                    val.value = updated.value;
                    val.raw = updated.raw;
                    $scope.$apply();
                    break;
                }
            }
        }
    };
    $scope.listener.on("valueUpdated", valueUpdated);
    $scope.$on("$destroy", function() {
        $scope.listener.off("valueUpdated", valueUpdated);
        $scope.listener.off("ready", deviceReady);
    });
});

module.controller('addDeviceValueController', function($scope) {
    $scope.name = undefined;
    $scope.template = undefined;
    $scope.error = undefined;
    $scope.save = function() {
        if (typeof $scope.name !== "string" || !$scope.name.length) {
            $scope.error = "Invalid name";
            return;
        }
        if (typeof $scope.template !== "string" || !$scope.template.length) {
            $scope.error = "Invalid template";
            return;
        }
        $scope.request({ type: "addDeviceValue", uuid: $scope.dev.uuid, name: $scope.name, template: $scope.template }).then(function() {
            $('#addDeviceValueModal').modal('hide');
        }).catch(function(err) {
            $scope.error = err;
            $scope.$apply();
        });
    };
});

function applyEditScene($scope, $compile)
{
    $scope.request({ type: "devices" }).then(function(response) {
        if (!(response instanceof Array))
            return;
        var devs = Object.create(null);
        var rem = response.length;
        var done = function() {
            for (var k in devs) {
                Object.defineProperty(devs[k], "fullName", {
                    get: function() {
                        var n = this.name;
                        if (this.room !== undefined)
                            n = this.room + " " + n;
                        if (this.floor !== undefined)
                            n = this.floor + " " + n;
                        return n;
                    }
                });
            }
            $scope.devices = devs;
            $scope.$apply();
        };
        for (var i = 0; i < response.length; ++i) {
            (function(uuid) {
                devs[uuid] = response[i];
                devs[uuid].values = Object.create(null);
                $scope.request({ type: "values", devuuid: uuid }).then(function(response) {
                    if (response instanceof Array) {
                        for (var i = 0; i < response.length; ++i) {
                            var val = response[i];
                            devs[uuid].values[val.name] = val;
                        }
                    }
                    if (!--rem)
                        done();
                });
            })(response[i].uuid);
        }
    });

    $scope._reset = function() {
        this.name = "";
        this.sceneData = {
            values: [],
            current: Object.create(null)
        };
    };

    $scope._reset();
    $scope.updated = true;

    var addInput = function(key, obj, id, what, disp, idx) {
        var ret = "";
        var found;
        if (key in obj)
            found = obj[key];
        var def = (found && found[disp]) || "";
        ret += `<div class="dropdown pull-left"><button class="btn btn-default dropdown-toggle" type="button" id="${key}DropDownMenu-${id}" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">${def}<span class="caret"></span></button><ul class="dropdown-menu" aria-labelledby="${key}DropDownMenu-${id}">`;
        for (var i in obj) {
            ret += `<li><a href="" class="btn default" ng-click="updateScene('${what}', '${obj[i][what]}', ${idx})">${obj[i][disp]}</a></li>`;
        }
        ret += "</ul></div>";
        return ret;
    };

    var addScene = function(val, idx) {
        var ret = "";
        var id = val.uuid || "new";
        ret += addInput(val.uuid, $scope.devices, id, "uuid", "fullName", idx);
        if (val.uuid) {
            id += val.name || "new";
            // console.log($scope.devices[val.uuid].values);
            ret += addInput(val.name, $scope.devices[val.uuid].values, id, "name", "name", idx);
        }
        if (val.name) {
            ret += `<input type="text" class="pull-left" placeholder="Value" ng-model="sceneValue(${idx}).value" ng-keydown="$event.which === 13 && updateText(${idx})"></input>`;
        }
        if (idx != -1) {
            ret += `<div class="pull-right btn btn-danger" ng-click="removeScene(${idx})">Delete</div>`;
        }
        ret += '<div style="clear: both;"></div>';
        return ret;
    };

    var findValue = function(idx) {
        if (idx == -1)
            return $scope.sceneData.current;
        if (idx < $scope.sceneData.values.length)
            return $scope.sceneData.values[idx];
        return undefined;
    };

    $scope.updateText = function(idx) {
        $scope.updated = true;

        if (!$scope.creating) {
            var val = findValue(idx);
            if (val) {
                // update our scene model directly, this is rather hacky but angular kinda sucks
                for (var s = 0; s < $scope.scenes.length; ++s) {
                    if ($scope.scenes[s].name == $scope.name) {
                        var scene = $scope.scenes[s];
                        if (!(val.uuid in scene.values)) {
                            scene.values[val.uuid] = Object.create(null);
                        }
                        scene.values[val.uuid][val.name] = val.value;
                        break;
                    }
                }
            }
        }

        if (idx == -1) {
            $scope.sceneData.values.push($scope.sceneData.current);
            $scope.sceneData.current = Object.create(null);
        }
        //console.log(event.currentTarget.value, idx);
    },

    $scope.removeScene = function(idx) {
        $scope.updated = true;
        if (!$scope.creating) {
            var val = $scope.sceneData.values[idx];
            for (var s = 0; s < $scope.scenes.length; ++s) {
                if ($scope.scenes[s].name == $scope.name) {
                    var scene = $scope.scenes[s];
                    if (val.uuid in scene.values) {
                        if (val.name in scene.values[val.uuid]) {
                            delete scene.values[val.uuid][val.name];
                            if (!Object.keys(scene.values[val.uuid]).length) {
                                delete scene.values[val.uuid];
                            }
                        }
                    }
                    break;
                }
            }
        }
        $scope.sceneData.values.splice(idx, 1);
    },

    $scope.updateScene = function(what, val, idx) {
        $scope.updated = true;
       // console.log("updateScene", what, val);
        switch (what) {
        case "uuid":
            findValue(idx).uuid = val;
            break;
        case "name":
            findValue(idx).name = val;
            break;
        }
    },

    $scope.sceneValue = function(idx) {
        return {
            get value() {
                var val = findValue(idx);
                return (val && val.value) || "";
            },
            set value(v) {
                var val = findValue(idx);
                if (val)
                    val.value = v;
            }
        };
    },

    $scope.save = function() {
        var vals = Object.create(null);
        // postprocess
        for (var i = 0; i < $scope.sceneData.values.length; ++i) {
            var v = $scope.sceneData.values[i];
            if (!(v.uuid in vals))
                vals[v.uuid] = Object.create(null);
            vals[v.uuid][v.name] = v.value;
        }
        var scene = { type: "setScene", name: $scope.name, values: vals };
        $scope.request(scene).then(function() {
            if ($scope.creating) {
                $("#addSceneModal").modal("hide");
            } else {
                $scope.clearNavigation();
                $scope.$apply();
            }
        });
        $scope._reset();
    },

    $scope.delete = function() {
        if ($scope.creating)
            return;
        $scope.request({ type: "removeScene", name: $scope.name }).then(function() {
            $scope.request({ type: "scenes" }).then(function(scenes) {
                $scope.clearNavigation();
                $scope.$apply();
            });
        });
    },

    $scope.trigger = function() {
        $scope.request({ type: "triggerScene", name: $scope.name });
    },

    $scope.generate = function(scene) {
        if (!$scope.devices)
            return "";
        $scope.creating = (scene === undefined);
        var elem;
        if (scene) {
            if (!$scope.updated)
                return undefined;
            $scope.updated = false;
            $scope.name = scene.name;
            elem = $(`#edit-${scene.name}`);
            // if (elem.children("div").length > 0)
            //     return undefined;
            // update our scene data
            $scope.sceneData.values = [];
            for (var uuid in scene.values) {
                var dev = scene.values[uuid];
                for (var v in dev) {
                    $scope.sceneData.values.push({ uuid: uuid, name: v, value: dev[v] });
                }
            }
        }
        // console.log("lglg");
        var ret = "";
        if (!scene)
            ret += `<div><input type="text" placeholder="Name" ng-model="name" class="form-control"></input></div>`;
        for (var i = 0; i < $scope.sceneData.values.length; ++i) {
            var val = $scope.sceneData.values[i];
            ret += addScene(val, i);
        }
        ret += addScene($scope.sceneData.current, -1);
        if (!$scope.creating) {
            ret += `<div class="pull-right btn btn-success" type="button" ng-click="save()">Save</div>`;
            ret += `<div class="pull-right btn btn-danger" type="button" ng-click="delete()">Delete</div>`;
            ret += `<div class="pull-right btn btn-default" type="button" ng-click="trigger()">Trigger</div><div style="clear: both"></div>`;
        }
        if (scene) {
            // console.log(ret);
            setTimeout(function() {
                var content = $compile(ret)($scope);
                elem.empty();
                elem.append(content);
            }, 0);
            return undefined;
        }
        return ret;
    };
}

module.controller('sceneController', function($scope) {
    $scope.adding = false;

    var requestScenes = function() {
        $scope.request({ type: "scenes" }).then(function(scenes) {
            $scope.scenes = scenes;
            console.log("got scenes", scenes);
            $scope.$apply();
        });
    };
    requestScenes();

    $scope.addScene = function() {
        $scope.adding = true;
        $('#addSceneModal').modal('show');
    };

    $scope.activeScene = function(r) {
        return $scope.nav.length > 0 && $scope.nav[0] == r;
    };

    $("#addSceneModal").on('hidden.bs.modal', function() {
        $scope.adding = false;
        $scope.$apply();
    });

    $scope.restoreScenes = function() {
        $('#restoreScenesModal').modal('show');
    };

    $scope.clearCachedScenes = function() {
        requestScenes();
    };
});

module.controller('restoreScenesController', function($scope) {
    $('#restoreScenesModal').on('shown.bs.modal', function() {
        $scope.request({ type: "restore", file: "scenes" }).then(function(scenes) {
            console.log(scenes);
            $scope.sceneCandidates = scenes;
            $scope.$apply();
        });
    });

    $scope.restoreScene = function(sha256) {
        $scope.request({ type: "restore", file: "scenes", sha256: sha256 }).then(function() {
            $("#restoreScenesModal").modal("hide");

            $scope.clearCachedScenes();
        });
    };
});

module.controller('addSceneController', function($scope, $compile) {
    applyEditScene.call(this, $scope, $compile);

    $("#addSceneModal").on('hidden.bs.modal', function() {
        $scope._reset();
    });
});

module.controller('editSceneController', function($scope, $compile) {
    applyEditScene.call(this, $scope, $compile);

    $scope.$on("$destroy", function() {
        $scope._reset();
    });
});

module.controller('restoreRulesController', function($scope) {
    $('#restoreRulesModal').on('shown.bs.modal', function() {
        $scope.request({ type: "restore", file: "rules" }).then(function(rules) {
            console.log(rules);
            $scope.ruleCandidates = rules;
            $scope.$apply();
        });
    });

    $scope.restoreRule = function(sha256) {
        $scope.request({ type: "restore", file: "rules", sha256: sha256 }).then(function() {
            $("#restoreRulesModal").modal("hide");

            $scope.$parent.clearCachedRules();
            $scope.$parent.$apply();
        });
    };
});

module.controller('ruleController', function($scope) {
    var ruleReady = function() {
        $scope.request({ type: "rules" }).then(function(rules) {
            $scope.rules = rules.map(function(r) { r.safename = r.name.replace(/ /g, "_"); return r; });
            $scope.$apply();
        });
    };

    $scope.adding = false;

    if ($scope.ready) {
        ruleReady();
    } else {
        $scope.listener.on("ready", ruleReady);
    }

    $scope.activeRule = function(r) {
        return $scope.nav.length > 0 && $scope.nav[0] == r;
    };
    $scope.clearCachedRules = function() {
        delete $scope.rules;
        $scope.clearNavigation();
        ruleReady();
    };

    $scope.addRule = function() {
        $scope.adding = true;
        $('#addRuleModal').modal('show');
    };
    $scope.ruleClass = function() {
        return $scope.adding ? "hw-blur" : "";
    };
    $("#addRuleModal").on('hidden.bs.modal', function() {
        $scope.adding = false;
        $scope.$apply();
    });
    $scope.restoreRules = function() {
        $('#restoreRulesModal').modal('show');
    };

    var nav = function() {
        if ($scope.active !== "rules")
            return;
        if ($scope.nav.length > 0) {
            // we have a rule selected
            //console.log("rule", $scope.nav[0]);
        }
    };
    $scope.listener.on("navigationChanged", nav);
    $scope.$on("$destroy", function() {
        $scope.listener.off("navigationChanged", nav);
        $scope.listener.off("ready", ruleReady);
    });
});

function applyEditRule($scope, $compile, applyName) {
    var newEvent = function() {
        $scope.events.push({
            ruleAlternatives: [$scope.initialRuleAlternatives.events],
            ruleSelections: [],
            ruleExtra: [],
            ruleNames: ["Events"],
            ruleTrigger: true
        });
    };
    var newAction = function() {
        $scope.actions.push({
            ruleAlternatives: [$scope.initialRuleAlternatives.actions],
            ruleSelections: [],
            ruleExtra: [],
            ruleNames: ["Actions"]
        });
    };

    var setScopeValue = function(type, row, idx, evt) {
        this[row].ruleSelections[idx] = evt;
        this[row].ruleSelections.splice(idx + 1);
        this[row].ruleAlternatives.splice(idx + 1);
        this[row].ruleExtra.splice(idx + 1);
        if (evt !== "(enter value)") {
            var that = this;
            $scope.request({ type: type, args: that[row].ruleSelections }).then(function(comp) {
                that[row].ruleAlternatives[idx + 1] = comp;
                $scope.$apply();
            });
        }
    };
    var extraScope = function(item, row, idx) {
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
    var extraScopeContinue = function(type, row, idx) {
        var that = this;
        $scope.request({ type: type, args: that[row].ruleSelections }).then(function(comp) {
            that[row].ruleAlternatives[idx + 1] = comp;
            $scope.$apply();
        });
    };
    var triggerScope = function(item, row) {
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
    $scope._reset = function() {
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

        $scope.request({ type: "ruleTypes" }).then(function(types) {
            $scope.initialRuleAlternatives.events = { type: "array", values: types.events };
            $scope.initialRuleAlternatives.actions = { type: "array", values: types.actions };

            newEvent();

            $scope.pendingReset = false;
            $scope.pendingListener.emitEvent(`resetComplete${applyName}`);

            $scope.$apply();
        });
    };
    $scope._reset();

    $scope.eventNext = function(row, val) {
        if (val === "Then") {
            if (!$scope.actions.length)
                newAction();
        } else {
            while (row + 1 >= $scope.events.length)
                newEvent();
        }
        $scope.eventNexts[row] = val;
    };
    $scope.actionNext = function(row) {
        newAction();
    };

    $scope.removeEvent = function(row) {
        $scope.events.splice(row, 1);
        var then = false;
        if (row + 1 === $scope.eventNexts.length && $scope.eventNexts[row] === "Then")
            then = true;
        $scope.eventNexts.splice(row, 1);
        if (then)
            $scope.eventNexts[row - 1] = "Then";
    },
    $scope.removeAction = function(row) {
        $scope.actions.splice(row, 1);
    },

    $scope.initializeFromRule = function() {
        var pushCommon = function(cur, item) {
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
        var pushEvent = function(evt, trg) {
            var cur = $scope.events[$scope.events.length - 1];
            if (cur.ruleSelections.length !== 0) {
                newEvent();
                cur = $scope.events[$scope.events.length - 1];
            }
            cur.ruleTrigger = trg;
            pushCommon(cur, evt);
        };
        var pushAction = function(act) {
            newAction();
            var cur = $scope.actions[$scope.actions.length - 1];
            pushCommon(cur, act);
        };

        if (!$scope.generator)
            return;
        if ($scope.name !== "")
            return;
        $scope.name = $scope.generator.name;
        var evts = $scope.generator.events;
        var trgs = $scope.generator.eventsTrigger;
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
        var acts = $scope.generator.actions;
        for (var act = 0; act < acts.length; ++act) {
            pushAction(acts[act]);
        }
        console.log("initialized", $scope.events, $scope.eventNexts);
    };

    $scope.generate = function(rule) {
        var internal = function() {
            $scope.generator = rule;
            $scope.initializeFromRule();

            var createInput = function(key, row, val, def, extra, func, idx) {
                var list = val.values;
                var isarray = list instanceof Array;
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
            $scope.pendingListener.on(`resetComplete${applyName}`, function() {
                var content = $compile(internal())($scope);
                var elem = $(`#edit-${rule.safename}`);
                elem.append(content);
            });
        }
        return "";
    };

    $scope.cancel = function() {
        $scope.clearCachedRules();
        $scope._reset();
    },
    $scope.save = function() {
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
            .then(function(result) {
                console.log("rule created", result, $scope.generator);
                if (!$scope.generator) {
                    $("#addRuleModal").modal("hide");
                }
                $scope.clearCachedRules();
                $scope.$apply();
            }).catch(function(error) {
                $scope.error = error;
                $scope.$apply();
            });
    };
}

module.controller('editRuleController', function($scope, $compile) {
    applyEditRule.call(this, $scope, $compile, 'edit');

    $scope.$on("$destroy", function() {
        $scope._reset();
    });
});

module.controller('addRuleController', function($scope, $compile) {
    applyEditRule.call(this, $scope, $compile, 'add');

    $("#addRuleModal").on('hidden.bs.modal', function() {
        $scope._reset();
    });
});

module.controller('variableController', function($scope) {
    var variableReady = function() {
        $scope.request({ type: "variables" }).then(function(vars) {
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

    $scope.addVariable = function() {
        $('#addVariableModal').modal('show');
    };

    $scope.clear = function(name) {
        $scope.variables[name] = null;
    };

    $scope.save = function() {
        $scope
            .request({ type: "setVariables", variables: $scope.variables })
            .then(function() {
                $scope.success = "Saved";
                $scope.$apply();

                setTimeout(function() {
                    $scope.success = undefined;
                    $scope.$apply();
                }, 5000);
            })
            .catch(function(err) {
                $scope.error = err;
                $scope.$apply();
            });
    };

    var variableUpdated = function(name, val) {
        $scope.variables[name] = val;
        $scope.$apply();

        $(`#key-${name}`).animateCss("rubberBand");
    };

    $scope.listener.on("variableUpdated", variableUpdated);
    $scope.$on("$destroy", function() {
        $scope.listener.off("variableUpdated", variableUpdated);
    });
});

module.controller('addVariableController', function($scope) {
    $scope.name = "";
    $scope.error = undefined;
    $scope.save = function() {
        $scope
            .request({ type: "createVariable", name: $scope.name })
            .then(function() {
                $('#addVariableModal').modal('hide');
            })
            .catch(function(err) {
                $scope.error = err;
                $scope.$apply();
            });
    };
});

module.controller('timerController', function($scope) {
    var timerReady = function() {
        $scope.request({ type: "timers", sub: "all" }).then(function(response) {
            $scope.timeout = response.timers.timeout;
            $scope.interval = response.timers.interval;
            $scope.schedule = response.timers.schedule;
            $scope.serverReceived = (new Date()).getTime();
            $scope.serverOffset = $scope.serverReceived - response.timers.now;
            console.log(response);

            var updateTimers = function() {
                var now = new Date().getTime();
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
            $scope._updater = setInterval(function() {
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
    $scope.add = function(type) {
        $scope.adding = type;
        $('#addTimerModal').modal('show');
    };
    $scope.stop = function(name, sub) {
        console.log("stop", name, sub);
        $scope
            .request({ type: "stopTimer", name: name, sub: sub })
            .then(function() {
                $scope.success = "Stopped";
                $scope.$apply();

                setTimeout(function() {
                    $scope.success = undefined;
                    $scope.$apply();
                }, 5000);
            })
            .catch(function(err) {
                $scope.error = err;
                $scope.$apply();
            });
    };
    $scope.restart = function(name, sub) {
        console.log("restart", name, sub);
        if ($scope.restarting) {
            var r = $scope.restarting;
            console.log(r);

            $('#restartTimerModal').modal('hide');

            var val = parseInt(r.value);
            if (val + "" != r.value) {
                $scope.error = `${r.value} needs to be an integer`;
                return;
            }

            $scope
                .request({ type: "restartTimer", name: r.name, sub: r.sub, value: val })
                .then(function() {
                    $scope.success = "Restarted";
                    $scope.$apply();

                    setTimeout(function() {
                        $scope.success = undefined;
                        $scope.$apply();
                    }, 5000);
                })
                .catch(function(err) {
                    $scope.error = err;
                    $scope.$apply();
                });

            return;
        }

        $scope.restarting = { name: name, sub: sub, value: undefined };
        $('#restartTimerModal').modal('show');
    };
    $scope.saveSchedules = function() {
        $scope
            .request({ type: "setSchedules", schedules: $scope.schedule })
            .then(function() {
                $scope.success = "Saved";
                $scope.$apply();

                setTimeout(function() {
                    $scope.success = undefined;
                    $scope.$apply();
                }, 5000);
            })
            .catch(function(err) {
                $scope.error = err;
                $scope.$apply();
            });
    };

    var timerUpdated = function(type, name, value) {
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
    $scope.$on("$destroy", function() {
        $scope.listener.off("timerUpdated", timerUpdated);
        clearInterval($scope._updater);
    });

    $("#restartTimerModal").on('hidden.bs.modal', function() {
        $scope.restarting = undefined;
    });
});

module.controller('addTimerController', function($scope) {
    $scope.timername = "";
    $scope.timervalue = "";
    $scope.error = undefined;
    $scope.save = function() {
        $scope
            .request({ type: "createTimer", sub: $scope.adding, name: $scope.timername, value: $scope.timervalue })
            .then(function() {
                $('#addTimerModal').modal('hide');
            })
            .catch(function(err) {
                $scope.error = err;
                $scope.$apply();
            });
    };
});

module.controller('zwaveController', function($scope) {
    $scope.action = function(act) {
        var actions = {
            pair: function() {
                $scope.request({ type: "zwaveAction", action: "pair" });
            },
            depair: function() {
                $scope.request({ type: "zwaveAction", action: "depair" });
            }
        };
        var fn = actions[act];
        if (typeof fn === "function") {
            fn();
        }
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
