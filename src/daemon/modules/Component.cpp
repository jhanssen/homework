#include "Component.h"
#include <rct/ScriptEngine.h>
#include <json.hpp>

using namespace nlohmann;

List<Component*> Component::sCurrent;

Component::Component(const String& name, const Path& pwd)
{
    sCurrent.append(this);

    bool ok;
    mPath = Path::resolved(name, Path::MakeAbsolute, pwd, &ok);
    if (!ok) {
        // try .js
        mPath = Path::resolved(name + ".js", Path::MakeAbsolute, pwd, &ok);
        if (!ok) {
            mPath.clear();
            return;
        }
    }
    if (mPath.resolved().isDir()) {
        // do we have a component.json file here?
        const Path cjs = mPath.ensureTrailingSlash() + "component.json";
        if (cjs.resolved().isFile()) {
            const String& data = cjs.readAll();
            const json j = json::parse(data);
            if (j.is_object()) {
                json::const_iterator main = j.find("main");
                if (main != j.end() && main->is_string()) {
                    mPath = mPath.ensureTrailingSlash() + main->get<std::string>();
                } else {
                    mPath = mPath.ensureTrailingSlash() + "index.js";
                }
            }
        }
    }
    if (!mPath.resolved().isFile()) {
        // try .js
        mPath += ".js";
        if (!mPath.resolved().isFile()) {
            mPath.clear();
        }
    }
}

Component::~Component()
{
    assert(!sCurrent.isEmpty() && sCurrent.last() == this);
    sCurrent.removeLast();
}

Value Component::eval() const
{
    const String& js = mPath.readAll();
    if (js.isEmpty())
        return Value();
    ScriptEngine* engine = ScriptEngine::instance();
    assert(engine);

    // make a modules object for us to keep
    ScriptEngine::Object::SharedPtr module = engine->createObject();
    // invoke the JS with modules as an argument
    const String call = "(function(module) {" + js + "})";
    ScriptEngine::Object::SharedPtr func = engine->toObject(engine->evaluate(call));
    assert(func->isFunction());
    func->call({ engine->fromObject(module) });
    return module->property("exports");
}
