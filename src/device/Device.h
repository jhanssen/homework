#ifndef DEVICE_H
#define DEVICE_H

#include <Event.h>
#include <Action.h>
#include <State.h>
#include <cstdint>
#include <event/Signal.h>
#include <util/Creatable.h>

using reckoning::event::Signal;
using reckoning::util::Creatable;

class Platform;

class Device : public std::enable_shared_from_this<Device>, public Creatable<Device>
{
public:
    enum Features {
        Feature_SetName,
        Feature_ShouldPoll,
        Feature_Last = Feature_ShouldPoll
    };

    ~Device();

    std::string uniqueId() const;

    std::string group() const;
    Signal<std::shared_ptr<Device>&&>& onGroupChanged();

    uint8_t features() const;

    std::string name() const;
    bool setName(const std::string& name);
    Signal<std::shared_ptr<Device>&&>& onNameChanged();

    typedef std::vector<std::shared_ptr<Event> > Events;
    const Events& events() const;

    std::shared_ptr<Action> findAction(const std::string& name);
    typedef std::vector<std::shared_ptr<Action> > Actions;
    const Actions& actions() const;

    std::shared_ptr<State> findStateById(const std::string& uniqueId);
    std::shared_ptr<State> findStateByName(const std::string& name);
    typedef std::vector<std::shared_ptr<State> > States;
    const States& states() const;

    std::shared_ptr<Platform> platform() const;

protected:
    Device(const std::string& uniqueId, const std::string& group = std::string(), const std::string& name = std::string());

    void changeGroup(const std::string& group);
    void changeName(const std::string& name);
    void addEvent(std::shared_ptr<Event>&& event);
    void addAction(std::shared_ptr<Action>&& action);
    void addState(std::shared_ptr<State>&& state);
    void setPlatform(const std::shared_ptr<Platform>& platform);

private:
    std::string mUniqueId, mGroup, mName;
    Events mEvents;
    Actions mActions;
    States mStates;
    Signal<std::shared_ptr<Device>&&> mOnNameChanged, mOnGroupChanged;
    std::weak_ptr<Platform> mPlatform;

    friend class Platform;
};

inline Device::Device(const std::string& uniqueId, const std::string& group, const std::string& name)
    : mUniqueId(uniqueId), mGroup(group), mName(name)
{
}

inline Device::~Device()
{
}

inline std::string Device::uniqueId() const
{
    return mUniqueId;
}

inline std::string Device::group() const
{
    return mGroup;
}

inline Signal<std::shared_ptr<Device>&&>& Device::onGroupChanged()
{
    return mOnGroupChanged;
}

inline void Device::changeGroup(const std::string& group)
{
    mGroup = group;
    mOnGroupChanged.emit(shared_from_this());
}

inline std::string Device::name() const
{
    return mName;
}

inline Signal<std::shared_ptr<Device>&&>& Device::onNameChanged()
{
    return mOnNameChanged;
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

inline std::shared_ptr<Action> Device::findAction(const std::string& name)
{
    for (const auto& a : mActions) {
        if (a->name() == name)
            return a;
    }
    return std::shared_ptr<Action>();
}

inline const Device::Actions& Device::actions() const
{
    return mActions;
}

inline const Device::States& Device::states() const
{
    return mStates;
}

inline std::shared_ptr<State> Device::findStateById(const std::string& uniqueId)
{
    for (const auto& s : mStates) {
        if (s->uniqueId() == uniqueId)
            return s;
    }
    return std::shared_ptr<State>();
}

inline std::shared_ptr<State> Device::findStateByName(const std::string& name)
{
    for (const auto& s : mStates) {
        if (s->name() == name)
            return s;
    }
    return std::shared_ptr<State>();
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

inline std::shared_ptr<Platform> Device::platform() const
{
    return mPlatform.lock();
}

inline void Device::setPlatform(const std::shared_ptr<Platform>& platform)
{
    mPlatform = platform;
}

#endif // DEVICE_H
