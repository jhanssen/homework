#include "Module.h"
#include <rct/Path.h>

Value Module::configuration(const String& name) const
{
    const Path fn = Path::home().ensureTrailingSlash() + ".config/homework/" + name + ".json";
    if (!fn.isFile())
        return Value();
    return Value::fromJSON(fn.readAll());
}
