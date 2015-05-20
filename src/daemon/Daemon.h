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

    void registerSensor(const Sensor::SharedPtr& sensor);
    void unregisterSensor(const Sensor::SharedPtr& sensor);

    Scene::SharedPtr scene() const;
    void pushScene(const Scene::SharedPtr& scene);
    void popScene();

    static Daemon::SharedPtr instance();

private:
    void initializeModules();
    void initializeScene();

private:
    HttpServer mHttpServer;
    ScriptEngine mScriptEngine;
    Hash<WebSocket*, WebSocket::SharedPtr> mWebSockets;
    List<Scene::SharedPtr> mScenes;
    List<Controller::SharedPtr> mControllers;
    List<Sensor::SharedPtr> mSensors;
};

inline Scene::SharedPtr Daemon::scene() const
{
    assert(!mScenes.isEmpty());
    return mScenes.last();
}

inline void Daemon::pushScene(const Scene::SharedPtr& scene)
{
    mScenes.append(scene);
    scene->enable();
}

inline void Daemon::popScene()
{
    assert(!mScenes.isEmpty());
    mScenes.removeLast();
    if (!mScenes.isEmpty())
        mScenes.last()->enable();
}

#endif
