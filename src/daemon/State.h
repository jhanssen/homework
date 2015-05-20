#ifndef STATE_H
#define STATE_H

#include <Controller.h>
#include <rct/Hash.h>
#include <memory>

class State
{
public:
    typedef std::shared_ptr<State> SharedPtr;
    typedef std::weak_ptr<State> WeakPtr;

    State() {}
    ~State() {}

    void set(const Controller::SharedPtr& controller, const json& json);
    void remove(const Controller::SharedPtr& controller);

    void restore();

private:
    Hash<Controller::SharedPtr, json> mData;
};

inline void State::set(const Controller::SharedPtr& controller, const json& json)
{
    mData[controller] = json;
    controller->set(json);
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
        it->first->set(it->second);
        ++it;
    }
}

#endif
