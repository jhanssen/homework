#include "RuleJS.h"
#include <rct/ScriptEngine.h>
#include <rct/Log.h>

RuleJS::RuleJS(const String& name)
    : Rule(name)
{
}

void RuleJS::setScript(const String& script)
{
    ScriptEngine* engine = ScriptEngine::instance();
    String err;
    mValue = engine->evaluate(script, Path(), &err);
    mValid = engine->isFunction(mValue);
    mArgs = script;
    mModified(shared_from_this());

    if (!mValid) {
        error() << "Rule not valid" << script << err;
    }
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
