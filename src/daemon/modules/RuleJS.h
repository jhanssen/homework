#ifndef RULEJS_H
#define RULEJS_H

#include "Rule.h"
#include <rct/Value.h>

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

    static RuleJS* sCurrent;
};

#endif
