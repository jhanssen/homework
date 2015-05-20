#ifndef RULE_H
#define RULE_H

#include "Sensor.h"
#include <rct/Set.h>
#include <rct/SignalSlot.h>

class Rule
{
public:
    Rule() { }
    virtual ~Rule() { }

    void registerSensor(const Sensor::SharedPtr& sensor);
    void unregisterSensor(const Sensor::SharedPtr& sensor);

    Signal<std::function<void()> >& triggered() { return mTriggered; }

protected:
    virtual bool check() = 0;

protected:
    Set<Sensor::WeakPtr> mSensors;
    Signal<std::function<void()> > mTriggered;
};

inline void Rule::registerSensor(const Sensor::SharedPtr& sensor)
{
    mSensors.insert(sensor);
}

inline void Rule::unregisterSensor(const Sensor::SharedPtr& sensor)
{
    mSensors.remove(sensor);
}

inline bool operator<(const Sensor::WeakPtr& a, const Sensor::WeakPtr& b)
{
    return a.owner_before(b);
}

#endif
