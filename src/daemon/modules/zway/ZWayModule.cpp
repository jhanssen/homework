#include "ZWayModule.h"
#include <Modules.h>
#include <rct/Timer.h>

class ZWayController : public Controller
{
public:
    ZWayController();

    virtual Value describe() const;
    virtual Value get() const;
    virtual void set(const Value& value);
};

class ZWaySensor : public Sensor
{
public:
    ZWaySensor();

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

ZWayController::ZWayController()
    : Controller("zway-controller")
{
}

Value ZWayController::describe() const
{
    const json j = {
        { "completions", {
            { "candidates", { "method " }},
            { "method", {
                { "candidates", { "zwayOn ", "zwayOff " }}
            }}
        }},
        { "methods", { "zwayOn", "zwayOff" }},
        { "events", { "keyPress", "keyRelease" } },
        { "arguments", {
            { "zwayOn", {
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

Value ZWayController::get() const
{
    return Value();
}

void ZWayController::set(const Value& value)
{
    const String method = value.value<String>("method");
    error() << "setting method" << method;
}

ZWaySensor::ZWaySensor()
    : Sensor("zway-sensor"), mTimer(250), mState({Min, Up})
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

Value ZWaySensor::describe() const
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

Value ZWaySensor::get() const
{
    const json j = {
        { "value", mState.cur }
    };
    return Json::toValue(j);
}

ZWayModule::ZWayModule()
    : Module("zway")
{
}

ZWayModule::~ZWayModule()
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

void ZWayModule::initialize()
{
    Controller::SharedPtr zwayController = std::make_shared<ZWayController>();
    Modules::instance()->registerController(zwayController);
    mControllers.append(zwayController);

    Sensor::SharedPtr zwaySensor = std::make_shared<ZWaySensor>();
    Modules::instance()->registerSensor(zwaySensor);
    mSensors.append(zwaySensor);
}
