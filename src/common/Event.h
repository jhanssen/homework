#ifndef EVENT_H
#define EVENT_H

#include <event/Signal.h>
#include <util/Creatable.h>
#include <string>
#include <memory>

using reckoning::event::Signal;
using reckoning::util::Creatable;

class Device;
class Schedule;
class Sunrise;

class Event : public std::enable_shared_from_this<Event>, public Creatable<Event>
{
public:
    std::string name() const;

    Signal<>& onTriggered();

protected:
    Event(const std::string& name);

    void trigger();

private:
    std::string mName;
    Signal<> mOnTriggered;

    friend class Device;
    friend class Schedule;
    friend class Sunrise;
};

inline Event::Event(const std::string& name)
    : mName(name)
{
}

inline std::string Event::name() const
{
    return mName;
}

inline Signal<>& Event::onTriggered()
{
    return mOnTriggered;
}

inline void Event::trigger()
{
    mOnTriggered.emit();
}

#endif // EVENT_H
