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
        : mZway(zway), locked(true)
    {
        zdata_acquire_lock(ZDataRoot(mZway));
    }
    ~ZWayLock()
    {
        if (locked)
            zdata_release_lock(ZDataRoot(mZway));
    }

    void unlock()
    {
        if (!locked)
            return;
        zdata_release_lock(ZDataRoot(mZway));
        locked = false;
    }

    void relock()
    {
        if (locked)
            return;
        zdata_acquire_lock(ZDataRoot(mZway));
        locked = true;
    }

private:
    ZWay mZway;
    bool locked;
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

static inline Value get(ZWay zway, ZWBYTE device, ZWBYTE instance, const char* path)
{
    ZWayLock lock(zway);
    return get(zway, zway_find_device_instance_data(zway, device, instance, path));
}

static inline Value get(ZWay zway, ZWBYTE device, ZWBYTE instance, ZWBYTE command, const char* path)
{
    ZWayLock lock(zway);
    return get(zway, zway_find_device_instance_cc_data(zway, device, instance, command, path));
}

class ZWayThread : public Thread
{
public:
    ZWayThread(ZWayModule* mod, const Value& cfg);
    ~ZWayThread();

    void log(Module::LogLevel level, const String& msg);
    void directLog(Module::LogLevel level, const String& msg);

    void changeState(const Value& value);
    void directChangeState(const Value& value);

    void callback(const ZWay zway, ZWDeviceChangeType type, ZWBYTE node_id, ZWBYTE instance_id, ZWBYTE command_id);
    void directCallback(const ZWay zway, ZWDeviceChangeType type, ZWBYTE node_id, ZWBYTE instance_id, ZWBYTE command_id);

    void configure(const Value& value);

    void stop();

    static ZWayThread* prepareWait();

    enum class State { Clear, Success, Failure };
    State wait();

    static void success(const ZWay zway, ZWBYTE functionId, void* arg);
    static void failure(const ZWay zway, ZWBYTE functionId, void* arg);

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

    State state;
    std::mutex stateMutex;
    std::condition_variable stateCond;

    static ZWayThread* thread;
};

class ZWayController : public Controller
{
public:
    ZWayController(ZWay zway, ZWBYTE node, ZWBYTE instance);

    virtual Value describe() const;
    virtual Value get() const;
    virtual void set(const Value& value);

    template<typename ZWType, ZWBYTE ZWCommand, typename ZWGetter, typename ZWSetter>
    void addMethod(const String& name, const ZWGetter& get, const ZWSetter& set);

private:
    struct Method
    {
        virtual Value get() const = 0;
        virtual void set(const Value& value) = 0;

        ZWay zway;
        ZWBYTE node, instance;
        String name;
    };
    template<typename ZWType, ZWBYTE ZWCommand, typename ZWGetter, typename ZWSetter>
    struct TemplateMethod : public Method
    {
        TemplateMethod(const ZWGetter& get, const ZWSetter& set)
            : getter(get), setter(set)
        {
        }

        virtual Value get() const;
        virtual void set(const Value& value);

        const ZWGetter& getter;
        const ZWSetter& setter;
    };

    ZWay mZway;
    ZWBYTE mNode, mInstance;
    Map<String, std::shared_ptr<Method> > mMethods;
};

template<typename ZWType, ZWBYTE ZWCommand, typename ZWGetter, typename ZWSetter>
Value ZWayController::TemplateMethod<ZWType, ZWCommand, ZWGetter, ZWSetter>::get() const
{
    ZWayLock lock(zway);
    ZWayThread* thread = ZWayThread::prepareWait();
    ZWError result = getter(zway, node, instance, ZWayThread::success, ZWayThread::failure, thread);
    if (result != NoError) {
        return Value();
    }
    lock.unlock();
    if (thread->wait() == ZWayThread::State::Success) {
        lock.relock();
        return ::get(zway, node, instance, ZWCommand, name.constData());
    }
    return Value();
}

template<typename ZWType, ZWBYTE ZWCommand, typename ZWGetter, typename ZWSetter>
void ZWayController::TemplateMethod<ZWType, ZWCommand, ZWGetter, ZWSetter>::set(const Value& value)
{
    ZWayLock lock(zway);
    ZWayThread* thread = ZWayThread::prepareWait();
    ZWError result = setter(zway, node, instance, value.convert<ZWType>(), ZWayThread::success, ZWayThread::failure, thread);
    if (result != NoError) {
        return;
    }
    lock.unlock();
    thread->wait();
}

void ZWayThread::success(const ZWay zway, ZWBYTE functionId, void* arg)
{
    ZWayThread* t = reinterpret_cast<ZWayThread*>(arg);
    std::lock_guard<std::mutex> locker(t->stateMutex);
    t->state = State::Success;
    t->stateCond.notify_one();
}

void ZWayThread::failure(const ZWay zway, ZWBYTE functionId, void* arg)
{
    ZWayThread* t = reinterpret_cast<ZWayThread*>(arg);
    std::lock_guard<std::mutex> locker(t->stateMutex);
    t->state = State::Failure;
    t->stateCond.notify_one();
}

template<typename ZWType, ZWBYTE ZWCommand, typename ZWGetter, typename ZWSetter>
void ZWayController::addMethod(const String& name, const ZWGetter& get, const ZWSetter& set)
{
    Method* method = new TemplateMethod<ZWType, ZWCommand, ZWGetter, ZWSetter>(get, set);
    method->zway = mZway;
    method->node = mNode;
    method->instance = mInstance;
    method->name = name;
    mMethods[name].reset(method);
}

ZWayThread* ZWayThread::thread = 0;

ZWayThread::ZWayThread(ZWayModule* mod, const Value& cfg)
    : module(mod), config(cfg), loop(EventLoop::eventLoop()), stopped(false), waited(0)
{
    assert(!thread);
    thread = this;
}

ZWayThread::~ZWayThread()
{
    assert(thread == this);
    thread = 0;
}

ZWayThread* ZWayThread::prepareWait()
{
    std::lock_guard<std::mutex> locker(thread->stateMutex);
    thread->state = State::Clear;
    return thread;
}

ZWayThread::State ZWayThread::wait()
{
    std::unique_lock<std::mutex> locker(stateMutex);
    while (state == State::Clear) {
        stateCond.wait(locker);
    }
    return state;
}

void ZWayThread::log(Module::LogLevel level, const String& msg)
{
    EventLoop::SharedPtr eventLoop = loop.lock();
    if (!eventLoop)
        return;
    eventLoop->callLater(std::bind((void(ZWayThread::*)(Module::LogLevel, const String&))&ZWayThread::directLog, this, level, msg));
}

void ZWayThread::directLog(Module::LogLevel level, const String& msg)
{
    module->log(level, msg);
}

void ZWayThread::changeState(const Value& value)
{
    EventLoop::SharedPtr eventLoop = loop.lock();
    if (!eventLoop)
        return;
    eventLoop->callLater(std::bind(&ZWayThread::directChangeState, this, value));
}

void ZWayThread::directChangeState(const Value& value)
{
    module->changeState(value);
}

void ZWayThread::callback(const ZWay zway, ZWDeviceChangeType type, ZWBYTE node_id, ZWBYTE instance_id, ZWBYTE command_id)
{
    EventLoop::SharedPtr eventLoop = loop.lock();
    if (!eventLoop)
        return;
    eventLoop->callLater(std::bind(&ZWayThread::directCallback, this, zway, type, node_id, instance_id, command_id));
}

void ZWayThread::directCallback(const ZWay zway, ZWDeviceChangeType type, ZWBYTE node_id, ZWBYTE instance_id, ZWBYTE command_id)
{
    switch (type) {
    case DeviceAdded:
        error() << "device added" << node_id;
        break;
    case DeviceRemoved:
        error() << "device removed" << node_id;
        break;
    case InstanceAdded:
        error() << "instance added" << node_id << instance_id;
        break;
    case InstanceRemoved:
        error() << "instance removed" << node_id << instance_id;
        break;
    case CommandAdded:
        error() << "command added" << node_id << instance_id << command_id;
        switch (command_id) {
        case 0x26: // SwitchMultiLevel
            break;
        case 0x25: { // SwitchBinary
            std::shared_ptr<ZWayController> ctrl = std::make_shared<ZWayController>(zway, node_id, instance_id);
            ctrl->addMethod<bool, 0x25>("level", zway_cc_switch_binary_get, zway_cc_switch_binary_set);
            Modules::instance()->registerController(ctrl);
            module->mControllers.append(ctrl);
            break; }
        case 0x20: // Basic
            break;
        case 0x8a: // Time
            break;
        case 0x85: // Association
            break;
        case 0x81: // Clock
            break;
        case 0x77: // NodeNaming
            break;
        case 0x73: // PowerLevel
            break;
        case 0x5B: // CentralScene
            break;
        case 0x2B: // SceneActivation
            break;
        case 0x27: { // Switch All
            std::shared_ptr<ZWayController> ctrl = std::make_shared<ZWayController>(zway, node_id, instance_id);
            ctrl->addMethod<int, 0x27>("mode", zway_cc_switch_all_get, zway_cc_switch_all_set);
            Modules::instance()->registerController(ctrl);
            module->mControllers.append(ctrl);
            break; }
        case 0x75: // Protection
            break;
        }
        break;
    case CommandRemoved:
        error() << "command removed" << node_id << instance_id << command_id;
        break;
    default:
        error() << "unknown change type" << type;
        break;
    }
}

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
        thread->callback(zway, type, node_id, instance_id, command_id);
        // thread->log(Module::Info, "zway callback");
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

ZWayController::ZWayController(ZWay zway, ZWBYTE node, ZWBYTE instance)
    : Controller(), mZway(zway), mNode(node), mInstance(instance)
{
    setName(String::format<64>("zway:%d:%d", mNode, mInstance));
}

Value ZWayController::describe() const
{
    json::array_t methods;
    for (auto method : mMethods) {
        methods.push_back(method.first);
    }

    const json j = {
        { "completions", {
            { "candidates", { "method " }},
            { "method", {
                { "candidates", methods }
            }}
        }},
        { "methods", methods }
    };
    return Json::toValue(j);
}

Value ZWayController::get() const
{
    Value ret;
    for (auto method : mMethods) {
        ret[method.first] = method.second->get();
    }
    return ret;
}

void ZWayController::set(const Value& value)
{
    const String method = value.value<String>("method");
    error() << "setting method" << method << value.toJSON();
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

    // Controller::SharedPtr zwayController = std::make_shared<ZWayController>();
    // Modules::instance()->registerController(zwayController);
    // mControllers.append(zwayController);

    Sensor::SharedPtr zwaySensor = std::make_shared<ZWaySensor>();
    Modules::instance()->registerSensor(zwaySensor);
    mSensors.append(zwaySensor);
}
