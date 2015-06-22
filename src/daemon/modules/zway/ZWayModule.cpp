#include "ZWayModule.h"
#include <Modules.h>
#include <rct/Timer.h>
#include <rct/Thread.h>
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
#include <mutex>
#include <condition_variable>
#include <chrono>

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

class ZWayThread : public Thread
{
public:
    ZWayThread(ZWayModule* mod, const Value& cfg)
        : module(mod), config(cfg), loop(EventLoop::eventLoop()), stopped(false), waited(0)
    {
    }

    void log(Module::LogLevel level, const String& msg)
    {
        EventLoop::SharedPtr eventLoop = loop.lock();
        if (!eventLoop)
            return;
        eventLoop->callLater(std::bind((void(ZWayThread::*)(Module::LogLevel, const String&))&ZWayThread::directLog, this, level, msg));
    }
    void directLog(Module::LogLevel level, const String& msg)
    {
        module->log(level, msg);
    }

    void changeState(const Value& value)
    {
        EventLoop::SharedPtr eventLoop = loop.lock();
        if (!eventLoop)
            return;
        eventLoop->callLater(std::bind(&ZWayThread::directChangeState, this, value));
    }
    void directChangeState(const Value& value)
    {
        module->changeState(value);
    }

    void configure(const Value& value);

    void stop();

protected:
    virtual void run();

private:
    void processCommand(ZWay zway, ZWayThread* thread, const Value& value);

private:
    ZWayModule* module;
    Value config;
    EventLoop::WeakPtr loop;

    std::mutex mutex;
    std::condition_variable cond;
    bool stopped;
    List<Value> commands;

    std::function<void(ZWay)> cancel;
    unsigned int waited;
};

void ZWayThread::configure(const Value& value)
{
    std::lock_guard<std::mutex> locker(mutex);
    commands.append(value);
    cond.notify_one();
}

void ZWayThread::processCommand(ZWay zway, ZWayThread* thread, const Value& value)
{
    String cmd;
    if (value.isString()) {
        cmd = value.toString();
    } else if (value.isMap()) {
        cmd = value["cmd"].toString();
    } else {
        return;
    }
    if (cmd == "list") {
        changeState("listing");
        ZWDevicesList devicesList = zway_devices_list(zway);
        if (devicesList) {
            ZWBYTE* deviceNodeId = devicesList;
            while (*deviceNodeId) {
                const Value typeString = get(zway, *deviceNodeId, "deviceTypeString");
                thread->log(Module::Error, typeString.toJSON());
                ++deviceNodeId;
            }
            zway_devices_list_free(devicesList);
        }
    } else if (cmd == "add_node") {
        changeState("adding");
        const bool highPower = value.value<bool>("highPower", true);
        zway_fc_add_node_to_network(zway, TRUE, highPower, nullptr, nullptr, nullptr);
        std::lock_guard<std::mutex> locker(mutex);
        if (cancel)
            cancel(zway);
        cancel = [highPower](ZWay zway) {
            zway_fc_add_node_to_network(zway, FALSE, highPower, nullptr, nullptr, nullptr);
        };
        waited = 0;
    } else if (cmd == "remove_node") {
        changeState("removing");
        const bool highPower = value.value<bool>("highPower", true);
        zway_fc_remove_node_from_network(zway, TRUE, highPower, nullptr, nullptr, nullptr);
        std::lock_guard<std::mutex> locker(mutex);
        if (cancel)
            cancel(zway);
        cancel = [highPower](ZWay zway) {
            zway_fc_remove_node_from_network(zway, FALSE, highPower, nullptr, nullptr, nullptr);
        };
        waited = 0;
    }
}

void ZWayThread::stop()
{
    std::lock_guard<std::mutex> locker(mutex);
    stopped = true;
    cond.notify_one();
}

void ZWayThread::run()
{
    changeState("running");

    ZWay zway;
    ZWLog zwlog;

    const String defaultPath = "/opt/z-way-server/";
    const String port = config.value<String>("port", "/dev/ttyAMA0");
    const String configPath = config.value<String>("config", defaultPath + "config");
    const String translationsPath = config.value<String>("translations", defaultPath + "translations");
    const String zddxPath = config.value<String>("ZDDX", defaultPath + "ZDDX");
    memset(&zway, 0, sizeof(zway));
    zwlog = zlog_create_syslog(Warning);
    ZWError result = zway_init(&zway, port.constData(), configPath.constData(),
                               translationsPath.constData(), zddxPath.constData(),
                               "homework", zwlog);
    if (result != NoError) {
        changeState("error");
        log(Module::Error, "zway_init error");
        return;
    }

    auto callback = [](const ZWay zway, ZWDeviceChangeType type, ZWBYTE node_id, ZWBYTE instance_id, ZWBYTE command_id, void *ptr) {
        ZWayThread* thread = static_cast<ZWayThread*>(ptr);
        thread->log(Module::Info, "zway callback");
    };
    zway_device_add_callback(zway, DeviceAdded|DeviceRemoved|InstanceAdded|InstanceRemoved|CommandAdded|CommandRemoved, callback, this);

    result = zway_start(zway, [](ZWay zway, void* ptr) {
            ZWayThread* thread = static_cast<ZWayThread*>(ptr);
            thread->log(Module::Info, "zway terminated");
        }, this);
    if (result != NoError) {
        changeState("error");
        log(Module::Error, "zway_start error");
        zway_terminate(&zway);
        zway = 0;
        return;
    }
    result = zway_discover(zway);
    if (result != NoError) {
        changeState("error");
        log(Module::Error, "zway_discover error");
        zway_stop(zway);
        zway_terminate(&zway);
        zway = 0;
        return;
    }

    enum { WaitFor = 500, WaitMax = 10000 };

    for (;;) {
        if (!zway_is_running(zway)) {
            changeState("killed");
            zway_stop(zway);
            zway_terminate(&zway);
            zlog_close(zwlog);
            return;
        }
        bool idle = true;
        while (!zway_is_idle(zway)) {
            if (idle) {
                idle = false;
                changeState("busy");
            }
            if (cancel && waited >= WaitMax) {
                cancel(zway);
                cancel = nullptr;
                changeState("canceling");
            } else {
                std::this_thread::sleep_for(std::chrono::milliseconds(WaitFor));
                waited += WaitFor;
            }
        }
        changeState("idle");
        List<Value> cmds;
        {
            std::lock_guard<std::mutex> locker(mutex);
            if (stopped)
                break;
            std::swap(commands, cmds);
        }
        for (const Value& cmd : cmds) {
            processCommand(zway, this, cmd);
        }
        if (!cmds.isEmpty())
            changeState("idle");
        std::unique_lock<std::mutex> locker(mutex);
        while (!stopped && commands.isEmpty()) {
            cond.wait(locker);
        }
        if (stopped)
            break;
    }

    changeState("stopping");
    zway_stop(zway);
    changeState("stopped");
    zway_terminate(&zway);
    zlog_close(zwlog);
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
    : Module("zway"), mThread(0)
{
}

ZWayModule::~ZWayModule()
{
    if (mThread) {
        mThread->stop();
        mThread->join();
        delete mThread;
    }
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

void ZWayModule::configure(const Value& value)
{
    if (!mThread)
        return;
    mThread->configure(value);
}

void ZWayModule::initialize()
{
    changeState("starting");
    const Value cfg = configuration("zway");
    mThread = new ZWayThread(this, cfg);
    mThread->start();
    // mThread->configure("list");
    /*
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
    */

    Controller::SharedPtr zwayController = std::make_shared<ZWayController>();
    Modules::instance()->registerController(zwayController);
    mControllers.append(zwayController);

    Sensor::SharedPtr zwaySensor = std::make_shared<ZWaySensor>();
    Modules::instance()->registerSensor(zwaySensor);
    mSensors.append(zwaySensor);
}
