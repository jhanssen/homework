#include "FakeModule.h"
#include <Modules.h>

class FakeController : public Controller
{
public:
    FakeController();

    virtual Value describe() const;
    virtual Value get() const;
    virtual void set(const Value& value);
};

FakeController::FakeController()
    : Controller("fake-controller")
{
}

Value FakeController::describe() const
{
    const json j = {
        { "completions", {
            { "candidates", { "method " }},
            { "method", {
                { "candidates", { "fakeOn ", "fakeOff " }}
            }}
        }},
        { "methods", { "fakeOn", "fakeOff" }},
        { "events", { "keyPress", "keyRelease" } },
        { "arguments", {
            { "fakeOn", {
                { "reallyOn", "boolean" }
            }},
            { "keyPress", {
                { "key", "string" },
                { "cecCode", "int" }
            }},
            { "keyRelease", {
                { "key", "string" },
                { "cecCode", "int" }
            }}
        }}
    };
    return Json::toValue(j);
}

Value FakeController::get() const
{
    return Value();
}

void FakeController::set(const Value& value)
{
    const String method = value.value<String>("method");
    error() << "setting method" << method;
}

FakeModule::FakeModule()
    : Module("fake")
{
}

FakeModule::~FakeModule()
{
    {
        auto it = mControllers.cbegin();
        const auto end = mControllers.cend();
        while (it != end) {
            if (Controller::SharedPtr ptr = it->lock())
                Modules::instance()->unregisterController(ptr);
            ++it;
        }
    }
}

void FakeModule::initialize()
{
    Controller::SharedPtr fakeController = std::make_shared<FakeController>();
    Modules::instance()->registerController(fakeController);
    mControllers.append(fakeController);
}
