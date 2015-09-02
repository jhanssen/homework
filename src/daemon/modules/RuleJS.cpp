#include "RuleJS.h"
#include <rct/ScriptEngine.h>
#include <rct/Log.h>
#include "Alarm.h"
#include "AlarmSensor.h"

RuleJS* RuleJS::sCurrent = 0;

RuleJS::RuleJS(const String& name)
    : Rule(name), mAlarmId(0)
{
    enum { Single, Repeat };

    ScriptEngine* engine = ScriptEngine::instance();
    ScriptEngine::Object::SharedPtr obj = engine->createObject();
    obj->registerProperty("SINGLE", [](const ScriptEngine::Object::SharedPtr&) -> Value {
            return Single;
        });
    obj->registerProperty("REPEAT", [](const ScriptEngine::Object::SharedPtr&) -> Value {
            return Repeat;
        });
    obj->registerFunction("alarm", [this, engine](const ScriptEngine::Object::SharedPtr&, const List<Value> &args) -> Value {
            if (args.isEmpty()) {
                engine->throwException<void>("alarm takes at least one argument");
                return Value();
            }
            int modeIdx = 1;
            String name;
            if (args.size() > 1 && args[1].isString()) {
                ++modeIdx;
                name = args[1].toString();
            }
            Alarm::SharedPtr alarm;
            if (args[0].isInteger()) {
                // seconds
                Alarm::Mode mode = Alarm::Mode::Single;
                if (args.size() > modeIdx && args[modeIdx].isInteger() && args[modeIdx].toInteger() == Repeat)
                    mode = Alarm::Mode::Repeat;
                alarm = Alarm::create(args[0].toInteger(), mode);
            } else if (args[0].isMap()) {
                struct tm result;
                const time_t t = time(nullptr);
                localtime_r(&t, &result);
                Alarm::Time time = { result.tm_year, result.tm_mon + 1, result.tm_mday,
                                     result.tm_hour, result.tm_min, result.tm_sec };
                const Value& obj = args[0];
                if (obj.contains("year") && obj["year"].isInteger())
                    time.year = obj["year"].toInteger();
                if (obj.contains("month") && obj["month"].isInteger())
                    time.month = obj["month"].toInteger();
                if (obj.contains("day") && obj["day"].isInteger())
                    time.day = obj["day"].toInteger();
                if (obj.contains("hour") && obj["hour"].isInteger())
                    time.hour = obj["hour"].toInteger();
                if (obj.contains("minute") && obj["minute"].isInteger())
                    time.minute = obj["minute"].toInteger();
                if (obj.contains("second") && obj["second"].isInteger())
                    time.second = obj["second"].toInteger();
                alarm = Alarm::create(time);
            }
            if (alarm) {
                AlarmSensor::SharedPtr sensor = AlarmSensor::create(name, alarm);
                sensor->expired().connect([this](const AlarmSensor::SharedPtr& sensor) {
                        unregisterSensor(sensor);
                    });
                registerSensor(sensor);
                sensor->start();
                mAlarms[mAlarmId] = sensor;
                return Value(mAlarmId++);
            } else {
                engine->throwException<void>("Couldn't create alarm");
            }
            return Value();
        });
    obj->registerFunction("stopAlarm", [this, engine](const ScriptEngine::Object::SharedPtr&, const List<Value> &args) -> Value {
            if (args.isEmpty()) {
                engine->throwException<void>("stopAlarm takes at least one argument");
                return Value();
            }
            if (!args[0].isInteger()) {
                engine->throwException<void>("stopAlarm takes an integer argument");
                return Value();
            }
            auto alarm = mAlarms.find(args[0].toInteger());
            if (alarm == mAlarms.end()) {
                engine->throwException<void>("alarm not found in stopAlarm");
                return Value();
            }
            AlarmSensor::SharedPtr sensor = alarm->second.lock();
            if (!sensor) {
                mAlarms.erase(alarm);
                engine->throwException<void>("couldn't lock alarm in stopAlarm");
                return Value();
            }
            AlarmSensor::remove(sensor);
            return Value();
        });
    obj->registerProperty("name", [this](const ScriptEngine::Object::SharedPtr) -> Value {
            return mName;
        });

    mJSValue = engine->fromObject(obj);
}

void RuleJS::setScript(const String& script)
{
    sCurrent = this;

    ScriptEngine* engine = ScriptEngine::instance();
    String err;
    mValue = engine->evaluate(script, Path(), &err);
    mValid = engine->isFunction(mValue);
    mArgs = script;
    mModified(shared_from_this());

    if (!mValid) {
        error() << "Rule not valid" << script << err;
    }

    sCurrent = 0;
}

bool RuleJS::check()
{
    if (!mValid)
        return false;

    sCurrent = this;

    Value list;

    auto sensor = mSensors.cbegin();
    const auto end = mSensors.cend();
    while (sensor != end) {
        if (Sensor::SharedPtr ptr = sensor->first.lock()) {
            Value val;
            val["name"] = ptr->name();
            val["value"] = sensor->second.value;
            list.push_back(val);
        }
        ++sensor;
    }

    ScriptEngine* engine = ScriptEngine::instance();
    ScriptEngine::Object::SharedPtr object = engine->toObject(mValue);
    assert(object && object->isFunction());
    const Value ret = object->call({ list });

    sCurrent = 0;

    return ret.isBoolean() && ret.toBool();
}
