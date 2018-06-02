#ifndef EVENT_H
#define EVENT_H

#include <event/Signal.h>
#include <util/Creatable.h>
#include <memory>

using reckoning::event::Signal;
using reckoning::util::Creatable;

class Device;

class Event : public std::enable_shared_from_this<Event>, public Creatable<Event>
{
public:
    Signal<>& onTriggered();

protected:
    Event();

    void trigger();

private:
    Signal<> mOnTriggered;

    friend class Device;
};

inline Event::Event()
{
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
