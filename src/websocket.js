/*global module,require,global,setInterval,clearInterval,setTimeout*/

"use strict";

const WebSocket = require("ws");
const WebSocketServer = WebSocket.Server;
const dateFormat = require("dateformat");
const Rule = require("./rule.js");
const Variable = require("./variable.js");
const Timer = require("./timer.js");
const WebServer = require("./webserver.js");
const Scene = require("./scene.js").Scene;

var wss = undefined;
var homework = undefined;
var connections = [];

var Console;
var sendCloud;

function findDevice(uuid)
{
    var devs = homework.devices;
    if (!(devs instanceof Array))
        return undefined;
    return devs.find((d) => { return d.uuid == uuid; });
}

function isempty(v)
{
    if (v === undefined || v === null)
        return true;
    if (typeof v === "string" && !v.length)
        return true;
    return false;
}

function send(ws, msg, result)
{
    ws.send(JSON.stringify({ id: msg.id, wsid: msg.wsid, result: result }));
}

function error(ws, msg, err)
{
    ws.send(JSON.stringify({ id: msg.id, wsid: msg.wsid, error: err }));
}

function sendToAll(result)
{
    const data = JSON.stringify(result);
    for (var i = 0; i < connections.length; ++i) {
        connections[i].send(data);
    }
}

function construct(constructor, args) {
    function F() {
        return constructor.apply(this, args);
    }
    F.prototype = constructor.prototype;
    return new F();
}

var requestState = { id: 0, pending: Object.create(null) };
function requestCloud(req)
{
    var p = new Promise(function(resolve, reject) {
        var id = ++requestState.id;
        req.cid = id;
        // this.log("sending req", JSON.stringify(req));
        requestState.pending[id] = { resolve: resolve, reject: reject };
        try {
            sendCloud(req);
        } catch (e) {
            console.log(e);
        }
    });
    return p;
}

function resolveCloud(resp)
{
    if (resp.cid in requestState.pending) {
        let pending = requestState.pending[resp.cid];
        delete requestState.pending[resp.cid];

        if (resp.error) {
            pending.reject(resp.msg);
        } else {
            pending.resolve(resp.msg);
        }
    }
}

function rejectCloud()
{
    for (var k in requestState.pending) {
        requestState.pending[k].reject("Cloud gone");
    }
    requestState.pending = Object.create(null);
    requestState.id = 0;
}

function saveFilesInCloud(files)
{
    homework.save((fn, data) => {
        if (!files || files.indexOf(fn) !== -1) {
            requestCloud({ type: "saveFile", fileName: fn, data: data }).then((msg) => {
                Console.log(msg);
            }).catch((msg) => {
                Console.error("cloud error:", msg);
            });
        } else {
            Console.log("file skipped", fn);
        }
    });
}

const types = {
    call: (ws, msg) => {
        // find the thing
        if (typeof msg.call !== "string") {
            Console.log("no call:", msg);
            error(ws, msg, "message has no call");
            return;
        }
        var split = msg.call.split(".");
        var callee = undefined;
        var thing = homework;
        for (var i = 0; i < split.length; ++i) {
            if (!(split[i] in thing)) {
                Console.log(`no ${split[i]} in ${thing}`);
                error(ws, msg, "message has invalid call");
                return;
            }
            callee = thing;
            thing = thing[split[i]];
        }
        var ret;
        if (typeof thing === "function") {
            if (typeof callee !== "object")
                callee = undefined;
            if (msg.arguments instanceof Array) {
                ret = thing.apply(callee ? callee : null, msg.arguments);
            } else {
                ret = thing.call(callee ? callee : null);
            }
        } else {
            ret = thing;
        }
        var retmsg;
        try {
            retmsg = JSON.stringify({ id: msg.id, wsid: msg.wsid, result: ret });
        } catch (e) {
            Console.log("ws data exception", e);
            retmsg = JSON.stringify({ id: msg.id, wsid: msg.wsid, error: "message data exception" });
        }
        ws.send(retmsg);
    },
    devices: (ws, msg) => {
        Console.log("asked for devices");
        const devs = homework.devices;
        if (devs instanceof Array) {
            const ret = devs.map((e) => { return { type: e.type, name: e.name, room: e.room, floor: e.floor, uuid: e.uuid, groups: e.groups }; });
            send(ws, msg, ret);
        } else {
            error(ws, msg, "no devices");
        }
    },
    device: (ws, msg) => {
        var uuid = msg.uuid;
        var devs = homework.devices;
        if (devs instanceof Array) {
            for (var i = 0; i < devs.length; ++i) {
                if (devs[i].uuid == uuid) {
                    var d = devs[i];
                    send(ws, msg, { type: d.type, name: d.name, room: d.room, floor: d.floor, uuid: d.uuid, groups: d.groups });
                    return;
                }
            }
        }
        error(ws, msg, "no such device");
    },
    addGroup: (ws, msg) => {
        var group = msg.group;
        if (typeof group !== "string" || !group.length) {
            error(ws, msg, "no group name");
        } else {
            var dev = findDevice(msg.uuid);
            if (dev instanceof Object) {
                dev.addGroup(group);
                send(ws, msg, "ok");
            } else {
                error(ws, msg, `no such device ${msg.uuid}`);
            }
        }
    },
    removeGroup: (ws, msg) => {
        var group = msg.group;
        if (typeof group !== "string" || !group.length) {
            error(ws, msg, "no group name");
        } else {
            var dev = findDevice(msg.uuid);
            if (dev instanceof Object) {
                dev.removeGroup(group);
                send(ws, msg, "ok");
            } else {
                error(ws, msg, `no such device ${msg.uuid}`);
            }
        }
    },
    setGroup: (ws, msg) => {
        var group = msg.group;
        if (typeof group !== "string" || !group.length) {
            error(ws, msg, "no group name");
        } else {
            var dev = findDevice(msg.uuid);
            if (dev instanceof Object) {
                dev.groups = [group];
                send(ws, msg, "ok");

                saveFilesInCloud(["devices.json"]);
                homework.saveDevices();
            } else {
                error(ws, msg, `no such device ${msg.uuid}`);
            }
        }
    },
    rules: (ws, msg) => {
        const rs = homework.rules;
        if (rs instanceof Array) {
            var complete = (from, array) => {
                // first element of the array is the key in 'from'
                var f = from[array[0]];
                if (f === undefined) {
                    throw `No event/action named '${array[0]}' registered`;
                }
                // Console.log(`--${array[0]}--`);
                // call consecutive complete with the rest of the array
                var ret = { name: array[0], steps: [] };
                var len = array.length - 1;
                for (var i = 0; i < len; ++i) {
                    var rest = array.slice(1);
                    rest.splice(i);
                    var comps = f.completion.apply(null, rest);
                    // Console.log("comps for " + JSON.stringify(rest) + ": " + JSON.stringify(comps) + "(val: " + array[i + 1] + ")");
                    ret.steps.push({ alternatives: comps, value: array[i + 1] });
                }
                return ret;
            };

            try {
                const ret = rs.map((r) => {
                    var fmt = r.format();
                    var acts = fmt.actions;

                    // actions is an array of arrays
                    for (var a = 0; a < acts.length; ++a) {
                        acts[a] = complete(homework.actions, acts[a]);
                    }

                    var evts = fmt.events;
                    // events is an arary of arrays of arrays
                    for (var es = 0; es < evts.length; ++es) {
                        for (var e = 0; e < evts[es].length; ++e) {
                            evts[es][e] = complete(homework.events, evts[es][e]);
                        }
                    }
                    return fmt;
                });
                send(ws, msg, ret);
            } catch (e) {
                error(ws, msg, `Exception mapping rule: ${e}`);
            }
        } else {
            error(ws, msg, "no devices");
        }
    },
    ruleTypes: (ws, msg) => {
        const ret = {
            events: Object.keys(homework.events),
            actions: Object.keys(homework.actions)
        };
        send(ws, msg, ret);
    },
    eventCompletions: (ws, msg) => {
        const args = msg.args;
        if (!(args instanceof Array)) {
            error(ws, msg, "args needs to be an array");
        } else {
            const evt = homework.events[args[0]];
            if (!(typeof evt === "object") || !("completion" in evt)) {
                error(ws, msg, "no event");
            } else {
                // Console.log("asking for completions", args.slice(1));
                const ret = evt.completion.apply(null, args.slice(1));
                // Console.log("got", ret);
                send(ws, msg, ret);
            }
        }
    },
    actionCompletions: (ws, msg) => {
        const args = msg.args;
        if (!(args instanceof Array)) {
            error(ws, msg, "args needs to be an array");
        } else {
            const act = homework.actions[args[0]];
            if (!(typeof act === "object") || !("completion" in act)) {
                error(ws, msg, "no action");
            } else {
                // Console.log("asking for completions", args.slice(1));
                const ret = act.completion.apply(null, args.slice(1));
                // Console.log("got", ret);
                send(ws, msg, ret);
            }
        }
    },
    createRule: (ws, msg) => {
        if (typeof msg.rule !== "object") {
            error(ws, msg, "No rule");
            return;
        }
        const desc = msg.rule;
        if (typeof desc.name !== "string" || !desc.name.length) {
            error(ws, msg, "No name");
            return;
        }
        const events = desc.events;
        const actions = desc.actions;
        if (!(events instanceof Array)) {
            error(ws, msg, "Events is not an array");
            return;
        }
        if (!(actions instanceof Array)) {
            error(ws, msg, "Actions is not an array");
            return;
        }
        var rule = new Rule(desc.name);
        var andCount = 0;
        for (var es = 0; es < events.length; ++es) {
            if (!(events[es] instanceof Array)) {
                error(ws, msg, `Event is not an array: ${es}`);
                return;
            }
            var ands = [];
            for (var e = 0; e < events[es].length; ++e) {
                var tr = events[es][e].trigger;
                var event = events[es][e].event;
                if (!(event instanceof Array) || !event.length) {
                    error(ws, msg, `Sub event is not an array: ${es}:${e}`);
                    return;
                }
                const ector = homework.events[event[0]];
                if (typeof ector !== "object" || !("ctor" in ector)) {
                    error(ws, msg, `Sub event doesn't have a constructor ${event[0]}`);
                    return;
                }
                try {
                    ands.push({ trigger: tr, and: construct(ector.ctor, event.slice(1)) });
                    ++andCount;
                } catch (e) {
                    error(ws, msg, `Error in event ctor ${event[0]}: ${e}`);
                    return;
                }
            }
            rule.and.apply(rule, ands);
        }
        if (!andCount) {
            error(ws, msg, `No events for rule`);
            return;
        }

        var thens = [];
        for (var as = 0; as < actions.length; ++as) {
            var action = actions[as];
            if (!(action instanceof Array) || !action.length) {
                error(ws, msg, `Action is not an array: ${as}`);
                return;
            }
            const actor = homework.actions[action[0]];
            if (typeof actor !== "object" || !("ctor" in actor)) {
                error(ws, msg, `Sub action doesn't have a constructor ${action[0]}`);
                return;
            }
            try {
                thens.push(construct(actor.ctor, action.slice(1)));
            } catch (e) {
                error(ws, msg, `Error in action ctor ${action[0]}: ${e}`);
                return;
            }
        }
        if (!thens.length) {
            error(ws, msg, `No actions for rule`);
            return;
        }
        rule.then.apply(rule, thens);
        homework.removeRuleByName(rule.name);
        homework.addRule(rule);
        send(ws, msg, { name: desc.name, success: true });

        saveFilesInCloud(["rules.json"]);
    },
    devicedata: (ws, msg) => {
        // return a list of all rooms and floors
        var rooms = Object.create(null);
        var floors = Object.create(null);
        const devs = homework.devices;
        for (var i = 0; i < devs.length; ++i) {
            var dev = devs[i];
            if (dev.room)
                rooms[dev.room] = true;
            if (dev.floor)
                floors[dev.floor] = true;
        }
        var ret = {
            rooms: Object.keys(rooms),
            floors: Object.keys(floors),
            types: homework.Device.Types
        };
        send(ws, msg, ret);
    },
    values: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg, "unknown device");
            return;
        }
        var ret = [];
        for (var v in dev.values) {
            let val = dev.values[v];
            ret.push({ name: val.name, value: val.value, raw: val.raw,
                       values: val.values, range: val.range, units: val.units,
                       readOnly: val.readOnly, type: val.type });
        }
        send(ws, msg, ret);
    },
    getValue: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg, "unknown device");
            return;
        }
        if (!("valname" in msg)) {
            error(ws, msg, "no valname in message");
            return;
        }
        if (!(msg.valname in dev.values)) {
            error(ws, msg, "valname not found");
            return;
        }
        const val = dev.values[msg.valname];
        const ret = { name: val.name, value: val.value, raw: val.raw,
                      values: val.values, range: val.range, units: val.units,
                      readOnly: val.readOnly, type: val.type };
        send(ws, msg, ret);
    },
    setName: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg, "unknown device");
            return;
        }
        if (typeof msg.name !== "string" || !msg.name.length) {
            error(ws, msg, `invalid name ${msg.name}`);
            return;
        }
        dev.name = msg.name;
        send(ws, msg, "ok");

        saveFilesInCloud(["devices.json"]);
        homework.saveDevices();
    },
    setRoom: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg, "unknown device");
            return;
        }
        if (typeof msg.room !== "string") {
            error(ws, msg, `invalid room ${msg.room}`);
            return;
        }
        if (msg.room.length > 0)
            dev.room = msg.room;
        else
            dev.room = undefined;
        send(ws, msg, "ok");

        saveFilesInCloud(["devices.json"]);
        homework.saveDevices();
    },
    setFloor: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg, "unknown device");
            return;
        }
        if (typeof msg.floor !== "string") {
            error(ws, msg, `invalid floor ${msg.floor}`);
            return;
        }
        if (msg.floor.length > 0)
            dev.floor = msg.floor;
        else
            dev.floor = undefined;
        send(ws, msg, "ok");

        saveFilesInCloud(["devices.json"]);
        homework.saveDevices();
    },
    setType: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg, "unknown device");
            return;
        }
        if (typeof msg.devtype !== "string") {
            error(ws, msg, `invalid type ${msg.devtype}`);
            return;
        }
        dev.type = msg.devtype;
        send(ws, msg, "ok");

        saveFilesInCloud(["devices.json"]);
        homework.saveDevices();
    },
    setValue: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg, "unknown device");
            return;
        }
        if (!("valname" in msg)) {
            error(ws, msg, "no valname in message");
            return;
        }
        if (!(msg.valname in dev.values)) {
            error(ws, msg, "valname not found");
            return;
        }
        if (!("value" in msg)) {
            error(ws, msg, "no value in message");
            return;
        }
        const val = dev.values[msg.valname];
        if (val.readOnly) {
            error(ws, msg, "read only value");
            return;
        }
        val.value = msg.value;

        send(ws, msg, "ok");
    },
    addValue: (ws, msg) => {
        const devs = homework.devices;
        if (!("devuuid" in msg)) {
            error(ws, msg, "no devuuid in message");
            return;
        }
        var dev;
        for (var i = 0; i < devs.length; ++i) {
            if (devs[i].uuid == msg.devuuid) {
                dev = devs[i];
                break;
            }
        }
        if (!dev) {
            error(ws, msg, "unknown device");
            return;
        }
        if (!("valname" in msg)) {
            error(ws, msg, "no valname in message");
            return;
        }
        if (!(msg.valname in dev.values)) {
            error(ws, msg, "valname not found");
            return;
        }
        if (!("delta" in msg)) {
            error(ws, msg, "no delta in message");
            return;
        }
        const val = dev.values[msg.valname];
        if (val.readOnly) {
            error(ws, msg, "read only value");
            return;
        }
        val.value = val.raw + msg.delta;

        send(ws, msg, "ok");
    },
    variables: (ws, msg) => {
        // JSON.stringify screws me over
        var ret = Object.create(null);
        for (var k in Variable.variables) {
            ret[k] = Variable.variables[k];
            if (ret[k] === undefined)
                ret[k] = null;
        }
        send(ws, msg, { variables: ret });
    },
    setVariables: (ws, msg) => {
        var name;
        for (name in msg.variables) {
            if (!(name in Variable.variables)) {
                error(ws, msg, `variable ${name} doesn't exist`);
                return;
            }
        }
        for (name in msg.variables) {
            Variable.change(name, msg.variables[name]);
        }
        send(ws, msg, { success: true });
    },
    createVariable: (ws, msg) => {
        if (typeof msg.name !== "string" || !msg.name.length) {
            error(ws, msg, `no name for variable`);
            return;
        }
        if (!Variable.create(msg.name)) {
            error(ws, msg, `variable ${msg.name} already exists`);
            return;
        }
        send(ws, msg, { success: true });
        const obj = { type: "variableUpdated", name: msg.name, value: null };
        sendToAll(obj);
        sendCloud(obj);
    },
    timers: (ws, msg) => {
        const sub = msg.sub;
        var ret = Object.create(null);

        const serializeTimers = (timers, type, ret) => {
            var out = Object.create(null);
            for (var n in timers) {
                var t = timers[n];
                out[n] = {
                    state: t.state,
                    started: t.started,
                    timeout: t.timeout
                };
            }
            ret[type] = out;
        };

        if (sub == "timeout" || sub == "all") {
            serializeTimers(Timer.timeout, "timeout", ret);
        }
        if (sub == "interval" || sub == "all") {
            serializeTimers(Timer.interval, "interval", ret);
        }
        if (sub == "schedule" || sub == "all") {
            var out = Object.create(null);
            for (var k in Timer.schedule) {
                out[k] = Timer.schedule[k].date;
            }
            ret.schedule = out;
        }
        ret["now"] = Date.now();
        send(ws, msg, { timers: ret });
    },
    stopTimer: (ws, msg) => {
        var err = "";
        if (msg.sub in Timer) {
            if (msg.name in Timer[msg.sub]) {
                var t = Timer[msg.sub][msg.name];
                if ("stop" in t) {
                    t.stop();
                } else {
                    err = "No stop";
                }
            } else {
                err = "Timer out found";
            }
        } else {
            err = "Timer group not found";
        }
        if (err != "") {
            error(ws, msg, `${err} for ${msg.name} in group ${msg.sub}`);
        } else {
            send(ws, msg, { success: true });
        }
    },
    restartTimer: (ws, msg) => {
        var err = "";
        if (msg.sub in Timer) {
            if (msg.name in Timer[msg.sub]) {
                var t = Timer[msg.sub][msg.name];
                if ("start" in t) {
                    t.start(msg.value);
                } else {
                    err = "No start";
                }
            } else {
                err = "Timer out found";
            }
        } else {
            err = "Timer group not found";
        }
        if (err != "") {
            error(ws, msg, `${err} for ${msg.name} in group ${msg.sub}`);
        } else {
            send(ws, msg, { success: true });
        }
    },
    createTimer: (ws, msg) => {
        if (isempty(msg.name)) {
            error(ws, msg, `No name for timer`);
            return;
        }
        if (isempty(msg.sub)) {
            error(ws, msg, `No type for timer ${msg.name}`);
            return;
        }
        if (msg.sub === "schedule" && isempty(msg.value)) {
            error(ws, msg, `No value for timer ${msg.name}`);
            return;
        }
        try {
            Timer.create(msg.sub, msg.name, msg.value);
        } catch (e) {
            error(ws, msg, `Couldn't create timer: ${e}`);
            return;
        }
        send(ws, msg, { success: true });
    },
    setSchedules: (ws, msg) => {
        var name;
        for (name in msg.schedules) {
            if (!(name in Timer.schedule)) {
                error(ws, msg, `schedule ${name} doesn't exist`);
                return;
            }
        }
        var err = "";
        for (name in msg.schedules) {
            try {
                Timer.schedule[name].date = msg.schedules[name];
            } catch (e) {
                err += JSON.stringify(e) + "\n";
            }
        }
        if (err != "") {
            error(ws, msg, err);
        } else {
            send(ws, msg, { success: true });
        }
    },
    web: (ws, msg) => {
        if ("path" in msg) {
            var path = msg.path;
            var q = path.indexOf('?');
            if (q !== -1)
                path = path.substr(0, q);
            WebServer.get(path, (statusCode, headers, body, binary) => {
                send(ws, msg, { statusCode: statusCode, headers: headers, body: body, binary: binary });
            });
        } else {
            error(ws, msg, "no path in msg");
        }
    },
    scenes: (ws, msg) => {
        var hwscenes = homework.scenes;
        var scenes = [];
        for (var i = 0; i < hwscenes.length; ++i) {
            var scene = hwscenes[i];
            scenes.push({ name: scene.name, values: scene.values });
        }
        send(ws, msg, scenes);
    },
    removeScene: (ws, msg) => {
        if (!("name" in msg)) {
            error(ws, msg, "no name in msg");
            return;
        }
        if (homework.removeScene(msg.name)) {
            send(ws, msg, "ok");
        } else {
            error(ws, msg, `no such scene: ${msg.name}`);
        }
    },
    setScene: (ws, msg) => {
        if (!("name" in msg)) {
            error(ws, msg, "no name in msg");
            return;
        }
        if (!("values" in msg)) {
            error(ws, msg, "no values in msg");
            return;
        }
        if (typeof msg.values !== "object") {
            error(ws, msg, "values is not an object");
            return;
        }
        homework.removeScene(msg.name);
        homework.addScene(new Scene(msg.name, msg.values));
        send(ws, msg, "ok");
    },
    triggerScene: (ws, msg) => {
        if (!("name" in msg)) {
            error(ws, msg, "no name in msg");
            return;
        }
        let scenes = homework.scenes;
        for (var i = 0; i < scenes.length; ++i) {
            if (scenes[i].name == msg.name) {
                scenes[i].trigger();
                send(ws, msg, "ok");
                return;
            }
        }
        error(ws, msg, `no such scene: ${msg.name}`);
    },
    restore: (ws, msg) => {
        if (!("file" in msg)) {
            error(ws, msg, "no file name in msg");
            return;
        }
        let fn = msg.file;
        if (!("sha256" in msg)) {
            requestCloud({ type: "loadFile", fileName: `${fn}.json` }).then((data) => {
                for (var idx in data) {
                    data[idx].date = dateFormat(data[idx].date, "dddd, mmmm dS, yyyy, h:MM:ss TT");
                }
                send(ws, msg, data);
            }).catch((err) => {
                error(ws, msg, err);
            });
        } else {
            requestCloud({ type: "loadFile", fileName: `${fn}.json`, sha256: msg.sha256 }).then((data) => {
                switch (fn) {
                case "rules":
                    console.log("restoring rules", data);
                    homework.restoreRules(data);
                    homework.saveRules();
                    break;
                case "scenes":
                    console.log("restoring scenes", data);
                    homework.restoreScenes(data);
                    homework.saveScenes();
                    break;
                case "devices":
                    //homework.removeVirtualDevices();
                    console.log("restoring devices", data);
                    for (let uuid in data) {
                        // find this device
                        let dev = findDevice(uuid);
                        let desc = data[uuid];
                        if (dev) {
                            if ("name" in desc)
                                dev.name = desc.name;
                            if ("room" in desc)
                                dev.room = desc.room;
                            if ("floor" in desc)
                                dev.floor = desc.floor;
                            if ("groups" in desc)
                                dev.groups = desc.groups;
                            if ("type" in desc)
                                dev.type = desc.type;
                        } else {
                            // virtual? if so, create
                        }
                    }
                    homework.saveDevices();
                    break;
                }
                send(ws, msg, "ok");
            }).catch((err) => {
                error(ws, msg, err);
            });
        }
    }
};

function cloud(ws, msg)
{
    Console.log("cloud", msg);
}

var extraTypes = Object.create(null);

const HWWebSocket = {
    _ready: undefined,
    _cloud: undefined,
    _cloudOk: false,
    _cloudPending: [],
    _cloudInterval: undefined,
    _cloudSentReady: false,

    sendCloud: function(d) {
        if (this._cloud && this._cloudOk) {
            if (d) {
                var data = JSON.stringify(d);
                this._cloud.send(data);
            } else if (this._cloudPending.length > 0) {
                for (var i = 0; i < this._cloudPending.length; ++i) {
                    this._cloud.send(JSON.stringify(this._cloudPending[i]));
                }
                this._cloudPending = [];
            }
        } else if (this._cloud) {
            this._cloudPending.push(d);
        } else {
            Console.log("no cloud");
        }
    },

    _setupWS: function(ws) {
        ws.on("message", (data, flags) => {
            // we only support rpc for now
            var msg;
            try {
                msg = JSON.parse(data);
            } catch (e) {
                Console.log("invalid ws message:", data);
                ws.send(JSON.stringify({ error: "invalid message" }));
                return;
            }
            if (typeof msg !== "object") {
                Console.log("ws message is not an object:", msg);
                ws.send(JSON.stringify({ error: "message is not an object" }));
                return;
            }
            if (!("id" in msg)) {
                if ("type" in msg) {
                    if (msg.type == "cloud") {
                        this._cloudOk = true;
                        this.sendCloud();
                        return;
                    } else if (msg.type == "error") {
                        Console.error("cloud error:", msg.msg);
                        return;
                    }
                }
                if ("cid" in msg) {
                    resolveCloud(msg);
                    return;
                }
                Console.log("no id in message", msg);
                ws.send(JSON.stringify({ error: "message has no id" }));
                return;
            }
            if ("type" in msg && msg.type in types) {
                types[msg.type](ws, msg);
            } else if ("type" in msg && msg.type in extraTypes) {
                extraTypes[msg.type](ws, msg);
            } else {
                Console.log("unhandled ws message:", msg);
            }
        });
    },

    _cloudConnect: function(cfg, state)
    {
        const again = () => {
            const timeout = state.next;
            state.next *= 10;
            if (state.next > (10 * 60))
                state.next = 10 * 60;
            setTimeout(() => { this._cloudConnect(cfg, state); }, timeout * 1000);
        };
        const stop = () => {
            this._cloud = undefined;
            this._cloudOk = false;
            this._cloudSentReady = false;
            if (this._cloudInterval) {
                clearInterval(this._cloudInterval);
                this._cloudInterval = undefined;
            }
        };

        this._cloud = new WebSocket("wss://www.homework.software:443/user/websocket",
                                    //this._cloud = new WebSocket("ws://192.168.1.22:3000/user/websocket",
                                    { headers: {
                                        "X-Homework-Key": cfg.key
                                    }});
        this._cloud.on("open", () => {
            state.next = 1;
            Console.log("cloud available");
            this._setupWS(this._cloud);
            if (this._ready && !this._cloudSentReady) {
                this._cloudSentReady = true;
                Console.log("telling cloud we're ready (1)");
                this.sendCloud({ type: "ready", ready: true });
            }
            this._cloudInterval = setInterval(() => {
                Console.log("ping cloud");
                this._cloud.ping();
            }, cfg.cloudPingInterval || (20 * 1000 * 60));

            saveFilesInCloud();
        });
        this._cloud.on("close", () => {
            Console.log("cloud gone");
            rejectCloud();

            stop();
            again();
        });
        this._cloud.on("error", (err) => {
            Console.log("cloud error", err);
            rejectCloud();

            this._cloud.close();
            stop();
            again();
        });
    },

    init: function(hw, cfg) {
        Console = hw.Console;

        sendCloud = this.sendCloud.bind(this);

        Variable.on("changed", (name) => {
            const obj = { type: "variableUpdated", name: name, value: Variable.variables[name] };
            sendToAll(obj);
            this.sendCloud(obj);
        });

        this._ready = false;

        if (cfg && cfg.key) {
            let connectState = { next: 1 };
            this._cloudConnect(cfg, connectState);
        } else {
            Console.log("no cloud key, not connecting");
        }

        homework = hw;
        homework.on("valueUpdated", (value) => {
            const obj = { type: "valueUpdated", valueUpdated: { devuuid: value.device ? value.device.uuid : null, valname: value.name, value: value.value, raw: value.raw }};
            sendToAll(obj);
            this.sendCloud(obj);
        });
        homework.on("timerUpdated", (timer) => {
            const t = Timer[timer.type][timer.name];
            if (timer.type === "schedule") {
                timer.value = t.date;
            } else {
                timer.value = {
                    state: t.state,
                    started: t.started,
                    timeout: t.timeout
                };
            }
            const obj = { type: "timerUpdated", timerUpdated: timer };
            sendToAll(obj);
            this.sendCloud(obj);
        });
        homework.on("ready", () => {
            this._ready = true;
            sendToAll({ type: "ready", ready: true });
            if (!this._cloudSentReady) {
                Console.log("telling cloud we're ready (2)");
                this.sendCloud({ type: "ready", ready: true });
                this._cloudSentReady = true;
            }
        });
        wss = new WebSocketServer({ port: 8093 });
        wss.on("connection", (ws) => {
            connections.push(ws);

            if (this._ready) {
                ws.send(JSON.stringify({ type: "ready", ready: true }));
            }

            this._setupWS(ws);
            ws.on("close", () => {
                const idx = connections.indexOf(ws);
                if (idx !== -1) {
                    connections.splice(idx, 1);
                }
            });
        });
    },
    registerCommand: function(cmd, cb) {
        extraTypes[cmd] = cb;
    },
    send: send,
    error: error
};

module.exports = HWWebSocket;
