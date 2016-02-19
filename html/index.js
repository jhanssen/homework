/*global $,angular,WebSocket,EventEmitter,clearTimeout,setTimeout*/

"use strict";

var module = angular.module('app', ['ui.bootstrap', 'ui.bootstrap-slider', 'frapontillo.bootstrap-switch']);
module.controller('mainController', function($scope) {
    $scope.Type = { Dimmer: 0, Light: 1, Fan: 2 };

    $scope.listener = new EventEmitter();
    $scope.id = 0;
    $scope.listener.on("valueUpdated", () => {
        $scope.$apply();
    });
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
    $scope.ready = () => {
        // request devices
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
                };

                // fixup devices
                for (var k in devs) {
                    let dev = devs[k];
                    dev.safeuuid = dev.uuid.replace(":", "_");
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
    $scope.updateValue = (updated) => {
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
                    $scope.listener.emitEvent("valueUpdated", [val, old, dev]);
                } else {
                    console.log("value updated but value not known", updated.devuuid, updated.valname);
                }
            } else {
                console.log("value for unknown device, discarding", updated.devuuid, updated.valname);
            }
        }
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
                    $scope.ready();
                }
                break;
            case "valueUpdated":
                $scope.updateValue(msg.valueUpdated);
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
});
