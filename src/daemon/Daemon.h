#ifndef DAEMON_H
#define DAEMON_H

#include "Controller.h"
#include "Sensor.h"
#include "Scene.h"
#include "Rule.h"
#include "Scene.h"
#include <HttpServer.h>
#include <WebSocket.h>
#include <rct/Hash.h>
#include <rct/List.h>
#include <rct/Set.h>
#include <rct/ScriptEngine.h>
#include <memory>

class Daemon : public std::enable_shared_from_this<Daemon>
{
public:
    typedef std::shared_ptr<Daemon> SharedPtr;
    typedef std::weak_ptr<Daemon> WeakPtr;

    Daemon();
    ~Daemon();

    void init();

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

    static Daemon::SharedPtr instance();

private:
    void initializeModules();
    void initializeScene();

private:
    HttpServer mHttpServer;
    ScriptEngine mScriptEngine;
    Hash<WebSocket*, WebSocket::SharedPtr> mWebSockets;
    Set<Scene::SharedPtr> mScenes;
    Set<Controller::SharedPtr> mControllers;
    Set<Sensor::SharedPtr> mSensors;
    Set<Rule::SharedPtr> mRules;
    Map<Rule::WeakPtr, Set<Scene::WeakPtr> > mRuleConnections;
};

inline Set<Controller::SharedPtr> Daemon::controllers() const
{
    return mControllers;
}

inline Set<Sensor::SharedPtr> Daemon::sensors() const
{
    return mSensors;
}

inline void Daemon::registerScene(const Scene::SharedPtr& scene)
{
    mScenes.insert(scene);
}

inline void Daemon::unregisterScene(const Scene::SharedPtr& scene)
{
    assert(mScenes.contains(scene));
    mScenes.remove(scene);
}

inline Set<Scene::SharedPtr> Daemon::scenes() const
{
    return mScenes;
}

inline void Daemon::registerRule(const Rule::SharedPtr& rule)
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

inline void Daemon::unregisterRule(const Rule::SharedPtr& rule)
{
    assert(mRules.contains(rule));
    assert(mRuleConnections.contains(rule));
    mRules.remove(rule);
    mRuleConnections.remove(rule);
}

inline Set<Rule::SharedPtr> Daemon::rules() const
{
    return mRules;
}

inline void Daemon::connectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)
{
    assert(mRuleConnections.contains(rule));
    mRuleConnections[rule].insert(scene);
}

inline void Daemon::disconnectRule(const Rule::SharedPtr& rule, const Scene::SharedPtr& scene)
{
    assert(mRuleConnections.contains(rule));
    mRuleConnections[rule].erase(scene);
}

inline Map<Rule::WeakPtr, Set<Scene::WeakPtr> > Daemon::ruleConnections() const
{
    return mRuleConnections;
}

#endif
