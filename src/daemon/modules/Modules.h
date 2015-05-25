#ifndef MODULES_H
#define MODULES_H

#include "Module.h"
#include "Controller.h"
#include "Sensor.h"
#include "Scene.h"
#include "Rule.h"
#include <rct/ScriptEngine.h>
#include <rct/SignalSlot.h>
#include <rct/Set.h>
#include <rct/List.h>
#include <rct/Map.h>
#include <memory>
#include <stdio.h>

class Modules
{
public:
    typedef std::shared_ptr<Modules> SharedPtr;
    typedef std::weak_ptr<Modules> WeakPtr;

    Modules();
    ~Modules();

    static Modules* instance();

    template<typename T>
    void add();

    void initialize();

    void registerController(const Controller::SharedPtr& controller);
    void unregisterController(const Controller::SharedPtr& controller);
    Set<Controller::SharedPtr> controllers() const;
    Controller::SharedPtr controller(const String& name) const;
    Signal<std::function<void(const Controller::SharedPtr&)> >& controllerAdded();
    Signal<std::function<void(const Controller::SharedPtr&)> >& controllerRemoved();

    void registerSensor(const Sensor::SharedPtr& sensor);
    void unregisterSensor(const Sensor::SharedPtr& sensor);
    Set<Sensor::SharedPtr> sensors() const;
    Sensor::SharedPtr sensor(const String& name) const;
    Signal<std::function<void(const Sensor::SharedPtr&)> >& sensorAdded();
    Signal<std::function<void(const Sensor::SharedPtr&)> >& sensorRemoved();

    void registerScene(const Scene::SharedPtr& scene);
    void unregisterScene(const Scene::SharedPtr& scene);
    Set<Scene::SharedPtr> scenes() const;
    Scene::SharedPtr scene(const String& name) const;
    Signal<std::function<void(const Scene::SharedPtr&)> >& sceneAdded();
    Signal<std::function<void(const Scene::SharedPtr&)> >& sceneRemoved();

    void registerRule(const Rule::SharedPtr& rule);
    void unregisterRule(const Rule::SharedPtr& rule);
    Set<Rule::SharedPtr> rules() const;
    Rule::SharedPtr rule(const String& name) const;
    Signal<std::function<void(const Rule::SharedPtr&)> >& ruleAdded();
    Signal<std::function<void(const Rule::SharedPtr&)> >& ruleRemoved();

    void connectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene);
    void disconnectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene);
    Map<Rule::WeakPtr, Set<Scene::WeakPtr> > ruleConnections() const;
    Signal<std::function<void(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)> >& ruleConnectionAdded();
    Signal<std::function<void(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)> >& ruleConnectionRemoved();

private:
    void initializeScene();

    void loadRules();
    void loadScenes();
    void loadRuleConnections();

    void flushRules();
    void flushScenes();
    void flushRuleConnections();

    void createPendingRules();
    void createPendingScenes();
    void createPendingRuleConnections();

private:
    List<Module::SharedPtr> mModules;
    ScriptEngine mScriptEngine;
    Set<Scene::SharedPtr> mScenes;
    Set<Controller::SharedPtr> mControllers;
    Set<Sensor::SharedPtr> mSensors;
    Set<Rule::SharedPtr> mRules;
    Map<Rule::WeakPtr, Set<Scene::WeakPtr> > mRuleConnections;

    struct PendingRule
    {
        String name;
        Value arguments;
        List<String> sensors;
    };
    List<PendingRule> mPendingRules;

    struct PendingScene
    {
        String name;
        Map<String, Value> controllers;
    };
    List<PendingScene> mPendingScenes;

    struct PendingRuleConnection
    {
        String rule, scene;
    };
    List<PendingRuleConnection> mPendingRuleConnections;

    Signal<std::function<void(const Controller::SharedPtr&)> > mControllerAdded, mControllerRemoved;
    Signal<std::function<void(const Sensor::SharedPtr&)> > mSensorAdded, mSensorRemoved;
    Signal<std::function<void(const Scene::SharedPtr&)> > mSceneAdded, mSceneRemoved;
    Signal<std::function<void(const Rule::SharedPtr&)> > mRuleAdded, mRuleRemoved;
    Signal<std::function<void(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)> > mRuleConnectionAdded, mRuleConnectionRemoved;

    static Modules* sInstance;
};

inline Modules* Modules::instance()
{
    return sInstance;
}

template<typename T>
inline void Modules::add()
{
    mModules.append(std::make_shared<T>());
}

inline void Modules::initialize()
{
    auto module = mModules.cbegin();
    const auto end = mModules.cend();
    while (module != end) {
        (*module)->log().connect([](Module::LogLevel level, const String& name, const String& msg) {
                printf("Log: %s: %s\n", name.constData(), msg.constData());
            });
        (*module)->initialize();
        ++module;
    }
    initializeScene();
}

inline Set<Controller::SharedPtr> Modules::controllers() const
{
    return mControllers;
}

inline Set<Sensor::SharedPtr> Modules::sensors() const
{
    return mSensors;
}

inline void Modules::registerScene(const Scene::SharedPtr& scene)
{
    mScenes.insert(scene);
    flushScenes();
    mSceneAdded(scene);
}

inline void Modules::unregisterScene(const Scene::SharedPtr& scene)
{
    assert(mScenes.contains(scene));
    mScenes.remove(scene);
    flushScenes();
    mSceneRemoved(scene);
}

inline Set<Scene::SharedPtr> Modules::scenes() const
{
    return mScenes;
}

inline void Modules::registerRule(const Rule::SharedPtr& rule)
{
    rule->triggered().connect([this](const Rule::SharedPtr& rule) {
            assert(mRules.contains(rule));
            assert(mRuleConnections.contains(rule));
            const Set<Scene::WeakPtr>& scenes = mRuleConnections[rule];

            auto scene = scenes.cbegin();
            const auto end = scenes.cend();
            while (scene != end) {
                if (Scene::SharedPtr ptr = scene->lock())
                    ptr->enable();
                ++scene;
            }
        });
    mRules.insert(rule);
    flushRules();
    rule->modified().connect([this](const Rule::SharedPtr&) {
            flushRules();
        });
    mRuleAdded(rule);
}

inline void Modules::unregisterRule(const Rule::SharedPtr& rule)
{
    assert(mRules.contains(rule));
    assert(mRuleConnections.contains(rule));
    mRules.remove(rule);
    mRuleConnections.remove(rule);
    flushRules();
    mRuleRemoved(rule);
}

inline Set<Rule::SharedPtr> Modules::rules() const
{
    return mRules;
}

inline void Modules::connectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)
{
    assert(mRuleConnections.contains(rule));
    mRuleConnections[rule].insert(scene);
    flushRuleConnections();
    mRuleConnectionAdded(rule, scene);
}

inline void Modules::disconnectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)
{
    assert(mRuleConnections.contains(rule));
    mRuleConnections[rule].erase(scene);
    flushRuleConnections();
    mRuleConnectionRemoved(rule, scene);
}

inline Map<Rule::WeakPtr, Set<Scene::WeakPtr> > Modules::ruleConnections() const
{
    return mRuleConnections;
}

inline Signal<std::function<void(const Controller::SharedPtr&)> >& Modules::controllerAdded()
{
    return mControllerAdded;
}

inline Signal<std::function<void(const Controller::SharedPtr&)> >& Modules::controllerRemoved()
{
    return mControllerRemoved;
}

inline Signal<std::function<void(const Sensor::SharedPtr&)> >& Modules::sensorAdded()
{
    return mSensorAdded;
}

inline Signal<std::function<void(const Sensor::SharedPtr&)> >& Modules::sensorRemoved()
{
    return mSensorRemoved;
}

inline Signal<std::function<void(const Scene::SharedPtr&)> >& Modules::sceneAdded()
{
    return mSceneAdded;
}

inline Signal<std::function<void(const Scene::SharedPtr&)> >& Modules::sceneRemoved()
{
    return mSceneRemoved;
}

inline Signal<std::function<void(const Rule::SharedPtr&)> >& Modules::ruleAdded()
{
    return mRuleAdded;
}

inline Signal<std::function<void(const Rule::SharedPtr&)> >& Modules::ruleRemoved()
{
    return mRuleRemoved;
}

inline Signal<std::function<void(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)> >& Modules::ruleConnectionAdded()
{
    return mRuleConnectionAdded;
}

inline Signal<std::function<void(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)> >& Modules::ruleConnectionRemoved()
{
    return mRuleConnectionRemoved;
}

#endif
