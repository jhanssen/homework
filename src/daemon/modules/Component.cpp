#include "Component.h"
#include <rct/ScriptEngine.h>
#include <json.hpp>

using namespace nlohmann;

List<Component*> Component::sCurrent;

Component::Component(const String& name, const Path& pwd)
{
    sCurrent.append(this);

    mPath = Path::resolved(name, Path::RealPath, pwd);
    if (mPath.isDir()) {
        // do we have a component.js file here?
        const Path cjs = mPath.ensureTrailingSlash() + "component.js";
        if (cjs.isFile()) {
            const String& data= cjs.readAll();
            const json j = json::parse(data);
            if (j.is_object()) {
                json::const_iterator main = j.find("main");
                if (main != j.end() && main->is_string()) {
                    mPath = mPath.ensureTrailingSlash() + main->get<std::string>();
                } else {
                    mPath = mPath.ensureTrailingSlash() + "index.js";
                }
                mPath.resolve();
            }
        }
    }
    if (!mPath.isFile())
        mPath.clear();
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
