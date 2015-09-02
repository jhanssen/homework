#ifndef ALARMSENSOR_H
#define ALARMSENSOR_H

#include "Sensor.h"
#include <Alarm.h>
#include <rct/Value.h>
#include <rct/Rct.h>
#include <rct/Set.h>
#include <time.h>

class AlarmSensor : public Sensor
{
public:
    typedef std::shared_ptr<AlarmSensor> SharedPtr;

    static SharedPtr create(const String& name, const Alarm::SharedPtr& alarm);
    static void remove(const SharedPtr& sensor);

    void start() { mAlarm->start(); }
    void stop() { mAlarm->stop(); }

    virtual Value describe() const;
    virtual Value get() const;
    virtual bool isPersistent() const { return false; }

    Signal<std::function<void(const SharedPtr&)> >& expired() { return mExpired; }

private:
    AlarmSensor(const String& name, const Alarm::SharedPtr& alarm);

private:
    Alarm::SharedPtr mAlarm;
    uint64_t mStarted;
    Signal<std::function<void(const SharedPtr&)> > mExpired;

    static Set<SharedPtr> sAlarms;
};

inline AlarmSensor::AlarmSensor(const String& name, const Alarm::SharedPtr& alarm)
    : mAlarm(alarm), mStarted(Rct::monoMs())
{
    mAlarm->fired().connect([this](const Alarm::SharedPtr&) {
            mStateChanged(shared_from_this(), get());
        });
}

inline AlarmSensor::SharedPtr AlarmSensor::create(const String& name, const Alarm::SharedPtr& alarm)
{
    const SharedPtr ptr(new AlarmSensor(name, alarm));
    const std::weak_ptr<AlarmSensor> weak = ptr;
    alarm->expired().connect([weak](const Alarm::SharedPtr&) {
            if (SharedPtr ptr = weak.lock()) {
                ptr->mExpired(ptr);
            }
        });
    sAlarms.insert(ptr);
    return ptr;
}

inline void AlarmSensor::remove(const SharedPtr& sensor)
{
    sAlarms.erase(sensor);
}

inline Value AlarmSensor::get() const
{
    struct tm result;
    const time_t t = time(nullptr);
    localtime_r(&t, &result);

    Value ret;
    ret["year"] = result.tm_year;
    ret["month"] = result.tm_mon + 1;
    ret["day"] = result.tm_mday;
    ret["hour"] = result.tm_hour;
    ret["minute"] = result.tm_min;
    ret["second"] = result.tm_sec;
    ret["relapsed"] = Rct::monoMs() - mStarted;

    return ret;
}

#endif
