#ifndef EVENT_H
#define EVENT_H

#include <event/Signal.h>
#include <memory>

using reckoning::event::Signal;

class Device;

class Event
{
public:
    Signal<>& onTriggered();

protected:
    void trigger();

private:
    Signal<> mOnTriggered;

    friend class Device;
};

inline Signal<>& Event::onTriggered()
{
    return mOnTriggered;
}

inline void Event::trigger()
{
    mOnTriggered.emit();
}

#endif // EVENT_H
