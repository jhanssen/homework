/*global angular,WebSocket,EventEmitter*/

"use strict";

var module = angular.module('app', ['ui.bootstrap']);
module.controller('mainController', function($scope) {
    // // BUTTONS ======================

    // // define some random object
    // $scope.bigData = {};

    // $scope.bigData.breakfast = false;
    // $scope.bigData.lunch = false;
    // $scope.bigData.dinner = false;

    // // COLLAPSE =====================
    // $scope.isCollapsed = false;

    $scope.listener = new EventEmitter();
    $scope.id = 0;
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
            $scope.devices = response;
            $scope.$apply();
        });
    };
    $scope.updateValue = () => {
    };
    $scope.handleResponse = () => {
    };

    $scope.socket = new WebSocket(`ws://${window.location.hostname}:8093/`);
    $scope.socket.onmessage = (evt) => {
        try {
            var msg = JSON.parse(evt.data);
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
