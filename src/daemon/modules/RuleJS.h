#ifndef RULEJS_H
#define RULEJS_H

#include "Rule.h"
#include <rct/Value.h>

class RuleJS : public Rule
{
public:
    RuleJS(const String& name, const String& script = String());

    void setScript(const String& script);

protected:
    virtual bool check();

private:
    Value mValue;
};

#endif
