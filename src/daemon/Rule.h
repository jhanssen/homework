#ifndef RULE_H
#define RULE_H

#include "Sensor.h"
#include <rct/Map.h>
#include <rct/SignalSlot.h>
#include <rct/Value.h>
#include <memory>
#include <assert.h>

class Rule : public std::enable_shared_from_this<Rule>
{
public:
    typedef std::shared_ptr<Rule> SharedPtr;
    typedef std::weak_ptr<Rule> WeakPtr;

    Rule() : mValid(false) { }
    virtual ~Rule() { }

    void registerSensor(const Sensor::SharedPtr& sensor);
    void unregisterSensor(const Sensor::SharedPtr& sensor);

    Signal<std::function<void(const Rule::SharedPtr&)> >& triggered() { return mTriggered; }

    bool isValid() const { return mValid; }

protected:
    virtual bool check() = 0;

protected:
    struct Data
    {
        Value value;
        unsigned int connectKey;
    };
    Map<Sensor::WeakPtr, Data> mSensors;
    Signal<std::function<void(const Rule::SharedPtr&)> > mTriggered;
    bool mValid;

private:
    void sensorChanged(const Sensor::SharedPtr& sensor, const Value& value);
    void checkTriggered();
};

inline void Rule::registerSensor(const Sensor::SharedPtr& sensor)
{
    const unsigned int key = sensor->stateChanged().connect(std::bind(&Rule::sensorChanged, this, std::placeholders::_1, std::placeholders::_2));
    mSensors[sensor] = { sensor->get(), key };
}

inline void Rule::unregisterSensor(const Sensor::SharedPtr& sensor)
{
    assert(mSensors.contains(sensor));
    const Data& d = mSensors[sensor];
    sensor->stateChanged().disconnect(d.connectKey);
    mSensors.remove(sensor);
}

inline void Rule::sensorChanged(const Sensor::SharedPtr& sensor, const Value& value)
{
    assert(mSensors.contains(sensor));
    mSensors[sensor].value = value;
    checkTriggered();
}

inline void Rule::checkTriggered()
{
    if (check())
        mTriggered(shared_from_this());
}

inline bool operator<(const Rule::WeakPtr& a, const Rule::WeakPtr& b)
{
    return a.owner_before(b);
}

#endif
