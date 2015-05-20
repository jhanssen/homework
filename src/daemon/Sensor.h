#ifndef SENSOR_H
#define SENSOR_H

#include <rct/SignalSlot.h>
#include <rct/Value.h>
#include <memory>

class Sensor : public std::enable_shared_from_this<Sensor>
{
public:
    typedef std::shared_ptr<Sensor> SharedPtr;
    typedef std::weak_ptr<Sensor> WeakPtr;

    virtual ~Sensor() {}

    virtual Value get() const = 0;
    virtual void configure(const Value&) { }

    Signal<std::function<void(const Sensor::SharedPtr&, const Value&)> >& stateChanged() { return mStateChanged; }

protected:
    Signal<std::function<void(const Sensor::SharedPtr&, const Value&)> > mStateChanged;
};

inline bool operator<(const Sensor::WeakPtr& a, const Sensor::WeakPtr& b)
{
    return a.owner_before(b);
}

#endif
