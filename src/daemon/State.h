#ifndef STATE_H
#define STATE_H

#include <Controller.h>
#include <rct/Map.h>
#include <memory>

class State
{
public:
    typedef std::shared_ptr<State> SharedPtr;
    typedef std::weak_ptr<State> WeakPtr;

    State() {}
    ~State() {}

    void set(const Controller::SharedPtr& controller, const json& json);
    void add(const Controller::SharedPtr& controller);
    void remove(const Controller::SharedPtr& controller);

    void restore();

private:
    Map<Controller::WeakPtr, json> mData;
};

inline void State::set(const Controller::SharedPtr& controller, const json& json)
{
    mData[controller] = json;
    controller->set(json);
}

inline void State::add(const Controller::SharedPtr& controller)
{
    mData[controller] = controller->get();
}

inline void State::remove(const Controller::SharedPtr& controller)
{
    mData.erase(controller);
}

inline void State::restore()
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
