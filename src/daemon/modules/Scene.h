#ifndef SCENE_H
#define SCENE_H

#include <Controller.h>
#include <rct/Map.h>
#include <rct/String.h>
#include <memory>

class Scene
{
public:
    typedef std::shared_ptr<Scene> SharedPtr;
    typedef std::weak_ptr<Scene> WeakPtr;

    Scene(const String& name) : mName(name) {}
    ~Scene() {}

    void set(const Controller::SharedPtr& controller, const Value& value);
    void add(const Controller::SharedPtr& controller);
    void remove(const Controller::SharedPtr& controller);

    String name() const { return mName; }
    Map<Controller::SharedPtr, Value> controllers() const;

    void enable();

private:
    Map<Controller::WeakPtr, Value> mData;
    String mName;
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

inline Map<Controller::SharedPtr, Value> Scene::controllers() const
{
    Map<Controller::SharedPtr, Value> ret;
    for (auto p : mData) {
        if (Controller::SharedPtr controller = p.first.lock()) {
            ret[controller] = p.second;
        }
    }
    return ret;
}

inline bool operator<(const Scene::WeakPtr& a, const Scene::WeakPtr& b)
{
    return a.owner_before(b);
}

#endif
