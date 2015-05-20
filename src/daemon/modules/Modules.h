#ifndef MODULES_H
#define MODULES_H

#include "Module.h"
#include "Controller.h"
#include "Sensor.h"
#include "Scene.h"
#include "Rule.h"
#include <rct/ScriptEngine.h>
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

    void registerSensor(const Sensor::SharedPtr& sensor);
    void unregisterSensor(const Sensor::SharedPtr& sensor);
    Set<Sensor::SharedPtr> sensors() const;

    void registerScene(const Scene::SharedPtr& scene);
    void unregisterScene(const Scene::SharedPtr& scene);
    Set<Scene::SharedPtr> scenes() const;

    void registerRule(const Rule::SharedPtr& rule);
    void unregisterRule(const Rule::SharedPtr& rule);
    Set<Rule::SharedPtr> rules() const;

    void connectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene);
    void disconnectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene);
    Map<Rule::WeakPtr, Set<Scene::WeakPtr> > ruleConnections() const;

private:
    void initializeScene();

private:
    List<Module::SharedPtr> mModules;
    ScriptEngine mScriptEngine;
    Set<Scene::SharedPtr> mScenes;
    Set<Controller::SharedPtr> mControllers;
    Set<Sensor::SharedPtr> mSensors;
    Set<Rule::SharedPtr> mRules;
    Map<Rule::WeakPtr, Set<Scene::WeakPtr> > mRuleConnections;

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
}

inline void Modules::unregisterScene(const Scene::SharedPtr& scene)
{
    assert(mScenes.contains(scene));
    mScenes.remove(scene);
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
}

inline void Modules::unregisterRule(const Rule::SharedPtr& rule)
{
    assert(mRules.contains(rule));
    assert(mRuleConnections.contains(rule));
    mRules.remove(rule);
    mRuleConnections.remove(rule);
}

inline Set<Rule::SharedPtr> Modules::rules() const
{
    return mRules;
}

inline void Modules::connectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)
{
    assert(mRuleConnections.contains(rule));
    mRuleConnections[rule].insert(scene);
}

inline void Modules::disconnectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)
{
    assert(mRuleConnections.contains(rule));
    mRuleConnections[rule].erase(scene);
}

inline Map<Rule::WeakPtr, Set<Scene::WeakPtr> > Modules::ruleConnections() const
{
    return mRuleConnections;
}

#endif
