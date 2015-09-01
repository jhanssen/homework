#include "AlarmSensor.h"

Set<AlarmSensor::SharedPtr> AlarmSensor::sAlarms;

Value AlarmSensor::describe() const
{
    const json j = {
        { "events", { "triggered" } }
    };
    return Json::toValue(j);
}

