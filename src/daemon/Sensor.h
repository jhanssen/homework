#ifndef SENSOR_H
#define SENSOR_H

#include <rct/SignalSlot.h>
#include <json.hpp>
#include <memory>

using nlohmann::json;

class Sensor
{
public:
    typedef std::shared_ptr<Sensor> SharedPtr;
    typedef std::weak_ptr<Sensor> WeakPtr;

    virtual ~Sensor() {}

    virtual json get() const = 0;
    virtual void configure(const json&) { }

    Signal<std::function<void(const json&)> >& stateChanged() { return mStateChanged; }

protected:
    Signal<std::function<void(const json&)> > mStateChanged;
};

#endif
