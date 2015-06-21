#include "ZWayModule.h"
#include <Modules.h>
#include <rct/Timer.h>
#define String ZWayString
#define Empty ZWayEmpty
#define Boolean ZWayBoolean
#define Integer ZWayInteger
#define Float ZWayFloat
#define Binary ZWayBinary
#define ArrayOfInteger ZWayArrayOfInteger
#define ArrayOfFloat ZWayArrayOfFloat
#define ArrayOfString ZWayArrayOfString
#include <ZWayLib.h>
#include <ZData.h>
#include <ZLogging.h>
#undef String
#undef Empty
#undef Boolean
#undef Integer
#undef Float
#undef Binary
#undef ArrayOfInteger
#undef ArrayOfFloat
#undef ArrayOfString
#include <unistd.h>

class ZWayLock
{
public:
    ZWayLock(ZWay zway)
        : mZway(zway)
    {
        zdata_acquire_lock(ZDataRoot(mZway));
    }
    ~ZWayLock()
    {
        zdata_release_lock(ZDataRoot(mZway));
    }

private:
    ZWay mZway;
};

template<typename ZWayType, typename ZWayGetter>
static inline Value get(ZDataHolder data, ZWayGetter getter)
{
    ZWayType type;
    const ZWError ret = getter(data, &type);
    if (ret == NoError)
        return Value(type);
    return Value();
}

template<typename ZWayType, typename ZWayGetter>
static inline Value getarray(ZDataHolder data, ZWayGetter getter)
{
    ZWayType* type = 0;
    size_t sz;
    const ZWError ret = getter(data, &type, &sz);
    if (ret == NoError && type) {
        Value ret;
        for (size_t i = 0; i < sz; ++i) {
            ret.push_back(Value(type[i]));
        }
        return ret;
    }
    return Value();
}

template<typename ZWayGetter>
static inline List<ZWBYTE> getbinary(ZDataHolder data, ZWayGetter getter)
{
    const ZWBYTE* type = 0;
    size_t sz;
    const ZWError ret = getter(data, &type, &sz);
    if (ret == NoError && type) {
        List<ZWBYTE> ret;
        for (size_t i = 0; i < sz; ++i) {
            ret.push_back(type[i]);
        }
        return ret;
    }
    return List<ZWBYTE>();
}

static Value get(ZWay zway, ZDataHolder data)
{
    if (!data)
        return Value();
    ZWayLock lock(zway);
    ZWDataType type;
    zdata_get_type(data, &type);
    switch (type) {
    case ZWayEmpty:
        return Value();
    case ZWayString:
        return get<ZWCSTR>(data, zdata_get_string);
    case ZWayBoolean:
        return get<ZWBOOL>(data, zdata_get_boolean);
    case ZWayInteger:
        return get<int>(data, zdata_get_integer);
    case ZWayFloat:
        return get<float>(data, zdata_get_float);
    case ZWayBinary:
        return getbinary(data, zdata_get_binary);
    case ZWayArrayOfInteger:
        return getarray<const int>(data, zdata_get_integer_array);
    case ZWayArrayOfFloat:
        return getarray<const float>(data, zdata_get_float_array);
    case ZWayArrayOfString:
        return getarray<const ZWCSTR>(data, zdata_get_string_array);
    }
    return Value();
}

static inline Value get(ZWay zway, ZWBYTE device, const char* path)
{
    ZWayLock lock(zway);
    return get(zway, zway_find_device_data(zway, device, path));
}

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
    : Module("zway"), mZway(0), mZwlog(0)
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
    if (mZway) {
        ZWError result = zway_stop(mZway);
        if (result != NoError) {
            log(Error, "zway_stop error");
            return;
        }
        zway_terminate(&mZway);
    }
    if (mZwlog)
        zlog_close(mZwlog);
}

void ZWayModule::initialize()
{
    const String defaultPath = "/opt/z-way-server/";
    const Value cfg = configuration("zway");
    const String port = cfg.value<String>("port", "/dev/ttyAMA0");
    const String configPath = cfg.value<String>("config", defaultPath + "config");
    const String translationsPath = cfg.value<String>("translations", defaultPath + "translations");
    const String zddxPath = cfg.value<String>("ZDDX", defaultPath + "ZDDX");
    memset(&mZway, 0, sizeof(mZway));
    mZwlog = zlog_create_syslog(::Warning);
    ZWError result = zway_init(&mZway, port.constData(), configPath.constData(),
                               translationsPath.constData(), zddxPath.constData(),
                               "homework", mZwlog);
    if (result != NoError) {
        log(Error, "zway_init error");
        return;
    }

    auto callback = [](const ZWay zway, ZWDeviceChangeType type, ZWBYTE node_id, ZWBYTE instance_id, ZWBYTE command_id, void *ptr) {
        ZWayModule* module = static_cast<ZWayModule*>(ptr);
        module->log(Info, "zway callback");
    };
    zway_device_add_callback(mZway, DeviceAdded|DeviceRemoved|InstanceAdded|InstanceRemoved|CommandAdded|CommandRemoved, callback, this);

    result = zway_start(mZway, [](ZWay zway, void* ptr) {
            ZWayModule* module = static_cast<ZWayModule*>(ptr);
            module->log(Info, "zway terminated");
        }, this);
    if (result != NoError) {
        log(Error, "zway_start error");
        zway_terminate(&mZway);
        mZway = 0;
        return;
    }
    result = zway_discover(mZway);
    if (result != NoError) {
        log(Error, "zway_discover error");
        zway_stop(mZway);
        zway_terminate(&mZway);
        mZway = 0;
        return;
    }
    // this is a really weird API
    while (!zway_is_idle(mZway)) {
        usleep(500000); // 500ms
    }
#if 0
    zway_fc_add_node_to_network(mZway, TRUE, TRUE, nullptr, nullptr, nullptr);
    while (!zway_is_idle(mZway)) {
        usleep(500000); // 500ms
    }
#endif
    ZWDevicesList devicesList = zway_devices_list(mZway);
    if (devicesList) {
        ZWBYTE* deviceNodeId = devicesList;
        while (*deviceNodeId) {
            const Value typeString = get(mZway, *deviceNodeId, "deviceTypeString");
            log(Error, typeString.toJSON());
            ++deviceNodeId;
        }
        zway_devices_list_free(devicesList);
    }

    Controller::SharedPtr zwayController = std::make_shared<ZWayController>();
    Modules::instance()->registerController(zwayController);
    mControllers.append(zwayController);

    Sensor::SharedPtr zwaySensor = std::make_shared<ZWaySensor>();
    Modules::instance()->registerSensor(zwaySensor);
    mSensors.append(zwaySensor);
}
