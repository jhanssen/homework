#ifndef SCENE_H
#define SCENE_H

#include <Controller.h>
#include <rct/Map.h>
#include <memory>

class Scene
{
public:
    typedef std::shared_ptr<Scene> SharedPtr;
    typedef std::weak_ptr<Scene> WeakPtr;

    Scene() {}
    ~Scene() {}

    void set(const Controller::SharedPtr& controller, const Value& value);
    void add(const Controller::SharedPtr& controller);
    void remove(const Controller::SharedPtr& controller);

    void enable();

private:
    Map<Controller::WeakPtr, Value> mData;
};

inline void Scene::set(const Controller::SharedPtr& controller, const Value& value)
{
    mData[controller] = value;
}

inline void Scene::add(const Controller::SharedPtr& controller)
{
    mData[controller] = controller->get();
}

inline void Scene::remove(const Controller::SharedPtr& controller)
{
    mData.erase(controller);
}

inline void Scene::enable()
{
    auto it = mData.cbegin();
    const auto end = mData.cend();
    while (it != end) {
        if (Controller::SharedPtr ptr = it->first.lock())
            ptr->set(it->second);
        ++it;
    }
}

inline bool operator<(const Controller::WeakPtr& a, const Controller::WeakPtr& b)
{
    return a.owner_before(b);
}

#endif
