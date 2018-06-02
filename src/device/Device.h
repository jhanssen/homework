#ifndef DEVICE_H
#define DEVICE_H

#include "Event.h"
#include "Action.h"
#include "State.h"
#include <cstdint>
#include <event/Signal.h>
#include <util/Creatable.h>

using reckoning::event::Signal;
using reckoning::util::Creatable;

class Device : public std::enable_shared_from_this<Device>, public Creatable<Device>
{
public:
    enum Type {
        Type_Switch,
        Type_Light
    };
    enum Features {
        Feature_SetName,
        Feature_ShouldPoll,
        Feature_Last = Feature_ShouldPoll
    };

    virtual ~Device();

    Type type() const;
    virtual uint8_t features() const;

    std::string name() const;
    Signal<std::shared_ptr<Device>&&>& onNameChanged();
    virtual void setName(const std::string& name);

    typedef std::vector<std::shared_ptr<Event> > Events;
    const Events& events() const;

    typedef std::vector<std::shared_ptr<Action> > Actions;
    const Actions& actions() const;

    typedef std::vector<std::shared_ptr<State> > States;
    const States& states() const;

protected:
    Device(Type t);

    void changeName(const std::string& name);
    void addEvent(std::shared_ptr<Event>&& event);
    void addAction(std::shared_ptr<Action>&& action);
    void addState(std::shared_ptr<State>&& state);

private:
    Type mType;
    std::string mName;
    Events mEvents;
    Actions mActions;
    States mStates;
    Signal<std::shared_ptr<Device>&&> mOnNameChanged;
};

inline Device::Device(Type type)
    : mType(type)
{
}

inline Device::~Device()
{
}

inline Device::Type Device::type() const
{
    return mType;
}

inline uint8_t Device::features() const
{
    return 0;
}

inline std::string Device::name() const
{
    return mName;
}

inline Signal<std::shared_ptr<Device>&&>& Device::onNameChanged()
{
    return mOnNameChanged;
}

inline void Device::setName(const std::string&)
{
}

inline void Device::changeName(const std::string& name)
{
    mName = name;
    mOnNameChanged.emit(shared_from_this());
}

inline const Device::Events& Device::events() const
{
    return mEvents;
}

inline void Device::addEvent(std::shared_ptr<Event>&& event)
{
    mEvents.push_back(std::forward<std::shared_ptr<Event> >(event));
}

inline void Device::addAction(std::shared_ptr<Action>&& action)
{
    mActions.push_back(std::forward<std::shared_ptr<Action> >(action));
}

inline void Device::addState(std::shared_ptr<State>&& state)
{
    mStates.push_back(std::forward<std::shared_ptr<State> >(state));
}

#endif // DEVICE_H
