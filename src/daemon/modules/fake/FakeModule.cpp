#include "FakeModule.h"
#include <Modules.h>
#include <rct/Timer.h>

class FakeController : public Controller
{
public:
    FakeController();

    virtual Value describe() const;
    virtual Value get() const;
    virtual void set(const Value& value);
};

class FakeSensor : public Sensor
{
public:
    FakeSensor();

    enum Range { Min = 0, Max = 100 };
    enum Direction { Down, Up };

    virtual Value describe() const;
    virtual Value get() const;

private:
    Timer mTimer;
    struct
    {
        int cur;
        Direction dir;
    } mState;
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

FakeSensor::FakeSensor()
    : Sensor("fake-sensor"), mTimer(250), mState({Min, Up})
{
    mTimer.timeout().connect([this](Timer*) {
            switch (mState.dir) {
            case Down:
                if (--mState.cur == Min)
                    mState.dir = Up;
                break;
            case Up:
                if (++mState.cur == Max)
                    mState.dir = Down;
                break;
            }
            Value event;
            event["type"] = "timeout";
            event["value"] = mState.cur;
            mStateChanged(shared_from_this(), event);
        });
}

Value FakeSensor::describe() const
{
    const json j = {
        { "events", { "timeout" } },
        { "arguments", {
            { "timeout", {
                { "value", "range" },
                { "range", { Min, Max }}
            }}
        }}
    };
    return Json::toValue(j);
}

Value FakeSensor::get() const
{
    const json j = {
        { "value", mState.cur }
    };
    return Json::toValue(j);
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

    // Sensor::SharedPtr fakeSensor = std::make_shared<FakeSensor>();
    // Modules::instance()->registerSensor(fakeSensor);
    // mSensors.append(fakeSensor);
}
