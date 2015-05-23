#include "CecModule.h"
#include <Controller.h>
#include <Daemon.h>
#include <rct/Log.h>
#include <libcec/cec.h>

using namespace CEC;

class CecController : public Controller
{
public:
    CecController(const String& name, const std::shared_ptr<CecModule::Connection>& connection);

    CecModule* module() const;

    virtual Value describe() const;
    virtual Value get() const;
    virtual void set(const Value& value);

    void changeState(const Value& value);

    std::shared_ptr<CecModule::Connection> connection() const;

private:
    void log(Module::LogLevel level, const String& msg);

private:
    std::weak_ptr<CecModule::Connection> mConnection;
};

CecController::CecController(const String& name, const std::shared_ptr<CecModule::Connection>& connection)
    : Controller(name), mConnection(connection)
{
}

void CecController::changeState(const Value& value)
{
    mStateChanged(shared_from_this(), value);
}

CecModule* CecController::module() const
{
    if (std::shared_ptr<CecModule::Connection> conn = mConnection.lock())
        return conn->module;
    return 0;
}

void CecController::log(Module::LogLevel level, const String& msg)
{
    if (std::shared_ptr<CecModule::Connection> conn = mConnection.lock())
        conn->module->log(level, msg);
}

std::shared_ptr<CecModule::Connection> CecController::connection() const
{
    return mConnection.lock();
}

Value CecController::describe() const
{
    const json j = {
        { "completions", {
            { "candidates", { "method " }},
            { "method", {
                { "candidates", { "powerOn", "powerOff", "message ", "setActive" }}
            }}
        }},
        { "methods", { "powerOn", "powerOff", "message", "setActive" }},
        { "events", { "keyPress", "keyRelease" } },
        { "arguments", {
            { "message", {
                { "message", "string" }
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

Value CecController::get() const
{
    Value value;
    if (std::shared_ptr<CecModule::Connection> conn = mConnection.lock()) {
        const cec_osd_name name = conn->adapter->GetDeviceOSDName(CECDEVICE_TV);
        value["name"] = name.name;

        const cec_power_status status = conn->adapter->GetDevicePowerStatus(CECDEVICE_TV);
        switch (status) {
        case CEC_POWER_STATUS_ON:
        case CEC_POWER_STATUS_IN_TRANSITION_STANDBY_TO_ON:
            value["status"] = "on";
            break;
        case CEC_POWER_STATUS_STANDBY:
        case CEC_POWER_STATUS_IN_TRANSITION_ON_TO_STANDBY:
            value["status"] = "standby";
            break;
        case CEC_POWER_STATUS_UNKNOWN:
            value["status"] = "unknown";
            break;
        }
    }
    return value;
}

void CecController::set(const Value& value)
{
    if (std::shared_ptr<CecModule::Connection> conn = mConnection.lock()) {
        const String cmd = value.value<String>("method");
        if (cmd == "powerOn") {
            if (!conn->adapter->PowerOnDevices(CECDEVICE_TV))
                log(Module::Error, "unable to turn tv on");
        } else if (cmd == "powerOff") {
            if (!conn->adapter->StandbyDevices(CECDEVICE_TV))
                log(Module::Error, "unable to turn tv off");
        } else if (cmd == "message") {
            const String msg = value.value<String>("message");
            if (!conn->adapter->SetOSDString(CECDEVICE_TV, CEC_DISPLAY_CONTROL_DISPLAY_FOR_DEFAULT_TIME, msg.constData()))
                log(Module::Error, "unable to show message");
        } else if (cmd == "setActive") {
            if (!conn->adapter->SetActiveSource())
                log(Module::Error, "unable to set active source");
        }
    }
}

CecModule::CecModule()
    : Module("cec")
{
}

CecModule::~CecModule()
{
    auto it = mConnections.cbegin();
    const auto end = mConnections.cend();
    while (it != end) {
        if (Controller::SharedPtr ctrl = (*it)->controller.lock()) {
            Modules::instance()->unregisterController(ctrl);
        }
        ++it;
    }
}

CecModule::Connection::Connection(CecModule* mod)
{
    cecConfig = new libcec_configuration;
    callbacks = new ICECCallbacks;
    cecConfig->callbacks = callbacks;
    module = mod;
    adapter = 0;
}

CecModule::Connection::~Connection()
{
    if (adapter) {
        adapter->Close();
        CECDestroy(adapter);
    }
    delete cecConfig;
    delete callbacks;
}

void CecModule::initialize()
{
    std::shared_ptr<Connection> conn = std::make_shared<Connection>(this);
    libcec_configuration& config = *conn->cecConfig;
    ICECCallbacks& callbacks = *conn->callbacks;

    const Value cfg = configuration("cec");
    if (cfg.type() != Value::Type_Map && cfg.type() != Value::Type_Invalid) {
        log(Error, "invalid config");
        return;
    }

    config.Clear();
    strcpy(config.strDeviceName, "homework");
    config.clientVersion = CEC_CLIENT_VERSION_CURRENT;
    config.bActivateSource = 0;
    config.deviceTypes.Add(CEC_DEVICE_TYPE_PLAYBACK_DEVICE);

    if (cfg.contains("baseDevice")) {
        const int base = cfg.value<int>("baseDevice");
        if (base >= 0 && base < CECDEVICE_BROADCAST)
            config.baseDevice = static_cast<cec_logical_address>(base);
    }
    if (cfg.contains("hdmiPort")) {
        const int hdmi = cfg.value<int>("hdmiPort");
        if (hdmi >= CEC_MIN_HDMI_PORTNUMBER && hdmi <= CEC_MAX_HDMI_PORTNUMBER)
            config.iHDMIPort = hdmi;
    }
    const String device = cfg.value<String>("device");

    Controller::SharedPtr controller(new CecController("cec-" + device, conn));
    conn->controller = controller;

    config.callbackParam = &conn->controller;
    callbacks.CBCecLogMessage = [](void* ptr, const cec_log_message message) -> int {
        Controller::WeakPtr* ctrlPtr = static_cast<CecController::WeakPtr*>(ptr);
        if (Controller::SharedPtr controller = ctrlPtr->lock()) {
            std::shared_ptr<CecController> cec = std::static_pointer_cast<CecController>(controller);
            Module::LogLevel level = Module::Debug;
            switch (message.level) {
            case CEC_LOG_ERROR:
                level = Module::Error;
                break;
            case CEC_LOG_WARNING:
                level = Module::Warning;
                break;
            case CEC_LOG_NOTICE:
                level = Module::Info;
                break;
            case CEC_LOG_TRAFFIC:
            case CEC_LOG_DEBUG:
                level = Module::Debug;
                break;
            case CEC_LOG_ALL:
                // this will never happen but put this in to avoid compiler warning
                break;
            }
            cec->module()->log(level, message.message);
            return 1;
        }
        return 0;
    };
    callbacks.CBCecKeyPress = [](void* ptr, const cec_keypress key) -> int {
        Controller::WeakPtr* ctrlPtr = static_cast<CecController::WeakPtr*>(ptr);
        if (Controller::SharedPtr controller = ctrlPtr->lock()) {
            std::shared_ptr<CecController> cec = std::static_pointer_cast<CecController>(controller);
            if (std::shared_ptr<CecModule::Connection> conn = cec->connection()) {
                Value event;
                event["type"] = !key.duration ? "keyPress" : "keyRelease";
                event["key"] = conn->adapter->ToString(key.keycode);
                event["cecCode"] = key.keycode;
                cec->changeState(event);
                return 1;
            } else {
                cec->module()->log(Module::Error, "unable to get connection for controller");
            }
        }
        return 0;
    };
    callbacks.CBCecCommand = [](void* ptr, const cec_command cmd) -> int {
        return 1;
    };
    callbacks.CBCecAlert = [](void* ptr, const libcec_alert alert, const libcec_parameter param) -> int {
        return 1;
    };
    callbacks.CBCecSourceActivated = [](void* ptr, const cec_logical_address address, const uint8_t activated) {
    };

    conn->adapter = static_cast<ICECAdapter*>(CECInitialise(&config));
    if (!conn->adapter) {
        log(Error, "unable to initialize");
        return;
    }

    conn->adapter->InitVideoStandalone();

    // find adapters
    enum { MaxAdapters = 10 };
    cec_adapter adapters[MaxAdapters];
    const uint8_t num = conn->adapter->FindAdapters(adapters, MaxAdapters, 0);
    if (!num) {
        log(Error, "no adapters");
        CECDestroy(conn->adapter);
        conn->adapter = 0;
        return;
    }

    uint8_t selected = 0;
    for (uint8_t i = 0; i < num; ++i) {
        log(Debug, String::format<64>("available adapter %s", adapters[i].comm));
        if (!device.isEmpty() && device == adapters[i].comm) {
            selected = i;
            log(Info, String::format<64>("selected adapter %s", device.constData()));
        }
    }

    log(Info, String::format<64>("opening adapter %s", adapters[selected].comm));
    if (!conn->adapter->Open(adapters[selected].comm)) {
        log(Error, String::format<64>("unable to open adapter %s", adapters[selected].comm));
        CECDestroy(conn->adapter);
        conn->adapter = 0;
        return;
    }

    mConnections.append(conn);
    Modules::instance()->registerController(controller);
}
