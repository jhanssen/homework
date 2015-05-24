#include "RuleJS.h"
#include <rct/ScriptEngine.h>

RuleJS::RuleJS(const String& name, const String& script)
    : Rule(name)
{
    if (!script.isEmpty())
        setScript(script);
}

void RuleJS::setScript(const String& script)
{
    ScriptEngine* engine = ScriptEngine::instance();
    mValue = engine->evaluate(script);
    mValid = engine->isFunction(mValue);
}

bool RuleJS::check()
{
    if (!mValid)
        return false;

    Value list;

    auto sensor = mSensors.cbegin();
    const auto end = mSensors.cend();
    while (sensor != end) {
        if (Sensor::SharedPtr ptr = sensor->first.lock()) {
            list.push_back(sensor->second.value);
        }
        ++sensor;
    }

    ScriptEngine* engine = ScriptEngine::instance();
    ScriptEngine::Object::SharedPtr object = engine->toObject(mValue);
    assert(object && object->isFunction());
    const Value ret = object->call({ list });
    return ret.isBoolean() && ret.toBool();
}
