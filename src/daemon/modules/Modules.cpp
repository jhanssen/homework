#include "Modules.h"

Modules* Modules::sInstance = 0;

Modules::Modules()
{
    assert(!sInstance);
    sInstance = this;
}

Modules::~Modules()
{
    assert(sInstance);
    sInstance = 0;
}

void Modules::initializeScene()
{
    Scene::SharedPtr scene = std::make_shared<Scene>();

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
}

void Modules::unregisterSensor(const Sensor::SharedPtr& sensor)
{
    mSensors.remove(sensor);
}
