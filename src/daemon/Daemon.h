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

    void addScene(const Scene::SharedPtr& scene);
    void removeScene(const Scene::SharedPtr& scene);
    Set<Scene::SharedPtr> scenes() const;

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
};

inline Set<Controller::SharedPtr> Daemon::controllers() const
{
    return mControllers;
}

inline Set<Sensor::SharedPtr> Daemon::sensors() const
{
    return mSensors;
}

inline void Daemon::addScene(const Scene::SharedPtr& scene)
{
    mScenes.insert(scene);
}

inline void Daemon::removeScene(const Scene::SharedPtr& scene)
{
    mScenes.remove(scene);
}

inline Set<Scene::SharedPtr> Daemon::scenes() const
{
    return mScenes;
}

#endif
