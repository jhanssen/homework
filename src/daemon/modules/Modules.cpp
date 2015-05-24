#include "Modules.h"
#include <rct/Path.h>

Modules* Modules::sInstance = 0;

static inline Value readConfiguration(const String& name)
{
    const Path fn = Path::home().ensureTrailingSlash() + ".config/homework/" + name + ".json";
    if (!fn.isFile())
        return Value();
    return Value::fromJSON(fn.readAll());
}

static inline bool writeConfiguration(const String& name, const Value& data)
{
    const Path dir = Path::home().ensureTrailingSlash() + ".config/homework/";
    if (dir.exists() && !dir.isDir())
        return false;
    if (!dir.exists() && !dir.mkdir(Path::Recursive))
        return false;
    const Path fn = dir + name + ".json";
    return fn.write(data.toJSON(true));
}

Modules::Modules()
{
    assert(!sInstance);
    sInstance = this;

    loadRules();
    loadScenes();
    loadRuleConnections();
}

Modules::~Modules()
{
    assert(sInstance);
    sInstance = 0;
}

void Modules::initializeScene()
{
    Scene::SharedPtr scene = std::make_shared<Scene>("default-scene");

    auto controller = mControllers.cbegin();
    const auto end = mControllers.cend();
    while (controller != end) {
        scene->add(*controller);
        ++controller;
    }

    mScenes.insert(scene);
}

void Modules::registerController(const Controller::SharedPtr& controller)
{
    mControllers.insert(controller);

    // add to all scenes
    auto scene = mScenes.cbegin();
    const auto end = mScenes.cend();
    while (scene != end) {
        (*scene)->add(controller);
        ++scene;
    }

    createPendingRules();
    createPendingScenes();
    createPendingRuleConnections();

    mControllerAdded(controller);
}

void Modules::unregisterController(const Controller::SharedPtr& controller)
{
    mControllers.remove(controller);

    // remove from all scenes
    auto scene = mScenes.cbegin();
    const auto end = mScenes.cend();
    while (scene != end) {
        (*scene)->remove(controller);
        ++scene;
    }

    mControllerRemoved(controller);
}

Controller::SharedPtr Modules::controller(const String& name) const
{
    auto ctrl = mControllers.cbegin();
    const auto end = mControllers.cend();
    while (ctrl != end) {
        if ((*ctrl)->name() == name) {
            return *ctrl;
        }
        ++ctrl;
    }
    return Controller::SharedPtr();
}

void Modules::registerSensor(const Sensor::SharedPtr& sensor)
{
    mSensors.insert(sensor);
    mSensorAdded(sensor);

    createPendingRules();
}

void Modules::unregisterSensor(const Sensor::SharedPtr& sensor)
{
    mSensors.remove(sensor);
    mSensorRemoved(sensor);
}

void Modules::loadRules()
{
    const Value rules = readConfiguration("rules");
    if (!rules.isList()) {
        error() << "rules.json is not an array";
        return;
    }
    auto it = rules.listBegin();
    const auto end = rules.listEnd();
    while (it != end) {
        const Value& entry = *it;
        if (!entry.isMap()) {
            error() << "entry in rules.json is not an object";
            return;
        }
        PendingRule pending;
        pending.name = entry.value<String>("name");
        pending.arguments = entry["arguments"];
        const Value sensors = entry["sensors"];
        if (pending.name.isEmpty()) {
            error() << "no name for entry in rules.json";
            return;
        }
        if (!sensors.isList()) {
            error() << "sensors for" << pending.name << "in rules.json is not an array";
            return;
        }
        auto sensor = sensors.listBegin();
        const auto sensorend = sensors.listEnd();
        while (sensor != sensorend) {
            pending.sensors.append(sensor->toString());
            if (pending.sensors.last().isEmpty()) {
                error() << "empty sensor name for" << pending.name << "in rules.json";
                return;
            }
            ++sensor;
        }
        mPendingRules.append(pending);
        ++it;
    }
}

void Modules::loadScenes()
{
    const Value scenes = readConfiguration("scenes");
    if (!scenes.isList()) {
        error() << "scenes.json is not an array";
        return;
    }
    auto it = scenes.listBegin();
    const auto end = scenes.listEnd();
    while (it != end) {
        const Value& entry = *it;
        if (!entry.isMap()) {
            error() << "entry in scenes.json is not an object";
            return;
        }
        PendingScene pending;
        pending.name = entry.value<String>("name");
        const Value controllers = entry["controllers"];
        if (pending.name.isEmpty()) {
            error() << "no name for entry in scenes.json";
            return;
        }
        if (!controllers.isList()) {
            error() << "controllers for" << pending.name << "in scenes.json is not an array";
            return;
        }
        auto controller = controllers.listBegin();
        const auto controllerend = controllers.listEnd();
        while (controller != controllerend) {
            pending.controllers.append(controller->toString());
            if (pending.controllers.last().isEmpty()) {
                error() << "empty controller name for" << pending.name << "in scenes.json";
                return;
            }
            ++controller;
        }
        mPendingScenes.append(pending);
        ++it;
    }
}

void Modules::loadRuleConnections()
{
    const Value ruleConnections = readConfiguration("ruleconnections");
    if (!ruleConnections.isList()) {
        error() << "ruleconnections.json is not an array";
        return;
    }
    auto it = ruleConnections.listBegin();
    const auto end = ruleConnections.listEnd();
    while (it != end) {
        const Value& entry = *it;
        if (!entry.isMap()) {
            error() << "entry in ruleconnections.json is not an object";
            return;
        }
        PendingRuleConnection pending;
        pending.rule = entry.value<String>("rule");
        pending.scene = entry.value<String>("scene");
        if (pending.rule.isEmpty()) {
            error() << "no rule name for entry in ruleconnections.json";
            return;
        }
        if (pending.scene.isEmpty()) {
            error() << "no scene name for entry in ruleconnections.json";
            return;
        }

        mPendingRuleConnections.append(pending);
        ++it;
    }
}

void Modules::flushRules()
{
    Value rules;
    // write both pending and created rules
    for (const auto& rule : mPendingRules) {
        Value obj;
        obj["name"] = rule.name;
        obj["arguments"] = rule.arguments;
        Value sensors;
        for (const String& sensor : rule.sensors) {
            sensors.push_back(sensor);
        }
        obj["sensors"] = sensors;
        rules.push_back(obj);
    }
    for (const auto& rule : mRules) {
        Value obj;
        obj["name"] = rule->name();
        obj["arguments"] = rule->arguments();
        Value sensors;
        auto list = rule->sensors();
        for (const auto& sensor : list) {
            sensors.push_back(sensor->name());
        }
        obj["sensors"] = sensors;
        rules.push_back(obj);
    }
    writeConfiguration("rules", rules);
}

void Modules::flushScenes()
{
    Value scenes;
    // write both pending and created scenes
    for (const auto& scene : mPendingScenes) {
        Value obj;
        obj["name"] = scene.name;
        Value controllers;
        for (const String& controller : scene.controllers) {
            controllers.push_back(controller);
        }
        obj["controllers"] = controllers;
        scenes.push_back(obj);
    }
    for (const auto& scene : mScenes) {
        Value obj;
        obj["name"] = scene->name();
        Value controllers;
        auto list = scene->controllers();
        for (const auto& controller : list) {
            controllers.push_back(controller->name());
        }
        obj["controllers"] = controllers;
        scenes.push_back(obj);
    }
    writeConfiguration("scenes", scenes);
}

void Modules::flushRuleConnections()
{
    Value ruleConnections;
    // write both pending and created ruleconnections
    for (const auto& ruleConnection : mPendingRuleConnections) {
        Value obj;
        obj["rule"] = ruleConnection.rule;
        obj["scene"] = ruleConnection.scene;
        ruleConnections.push_back(obj);
    }
    for (const auto& ruleConnection : mRuleConnections) {
        if (Rule::SharedPtr rule = ruleConnection.first.lock()) {
            for (const auto& scenePtr : ruleConnection.second) {
                if (Scene::SharedPtr scene = scenePtr.lock()) {
                    Value obj;
                    obj["rule"] = rule->name();
                    obj["scene"] = scene->name();
                    ruleConnections.push_back(obj);
                }
            }
        }
    }
    writeConfiguration("ruleconnections", ruleConnections);
}

void Modules::createPendingRules()
{
}

void Modules::createPendingScenes()
{
}

void Modules::createPendingRuleConnections()
{
}
