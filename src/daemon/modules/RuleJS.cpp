#include "RuleJS.h"
#include <rct/ScriptEngine.h>
#include <rct/Log.h>
#include "Alarm.h"
#include "AlarmSensor.h"

RuleJS* RuleJS::sCurrent = 0;

RuleJS::RuleJS(const String& name)
    : Rule(name)
{
    ScriptEngine* engine = ScriptEngine::instance();
    ScriptEngine::Object::SharedPtr obj = engine->createObject();
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
                if (args.size() > modeIdx && args[modeIdx].toBool())
                    mode = Alarm::Mode::Repeat;
                alarm = Alarm::create(args[0].toInteger(), mode);
            } else {
                struct tm result;
                const time_t t = time(nullptr);
                localtime_r(&t, &result);
                Alarm::Time time = { result.tm_year, result.tm_mon + 1, result.tm_wday,
                                     result.tm_hour, result.tm_min, result.tm_sec };
                ScriptEngine::Object::SharedPtr obj = engine->toObject(args[0]);
                if (obj->property("year").isInteger())
                    time.year = obj->property("year").toInteger();
                if (obj->property("month").isInteger())
                    time.month = obj->property("month").toInteger();
                if (obj->property("day").isInteger())
                    time.day = obj->property("day").toInteger();
                if (obj->property("hour").isInteger())
                    time.hour = obj->property("hour").toInteger();
                if (obj->property("minute").isInteger())
                    time.minute = obj->property("minute").toInteger();
                if (obj->property("second").isInteger())
                    time.second = obj->property("second").toInteger();
                alarm = Alarm::create(time);
            }
            if (alarm) {
                AlarmSensor::SharedPtr sensor = AlarmSensor::create(name, alarm);
                registerSensor(sensor);
                sensor->start();
            } else {
                engine->throwException<void>("Couldn't create alarm");
            }
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
