#ifndef RULEJS_H
#define RULEJS_H

#include "Rule.h"
#include <rct/Hash.h>
#include <rct/Value.h>
#include <memory>

class AlarmSensor;

class RuleJS : public Rule
{
public:
    RuleJS(const String& name);

    void setScript(const String& script);

    static RuleJS* current() { return sCurrent; }

    Value jsValue() { return mJSValue; }

protected:
    virtual bool check();

private:
    Value mValue;
    Value mJSValue;

    int mAlarmId;
    Hash<int, std::weak_ptr<AlarmSensor> > mAlarms;

    static RuleJS* sCurrent;
};

#endif
