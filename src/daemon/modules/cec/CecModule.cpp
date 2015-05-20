#include "CecModule.h"
#include <Controller.h>
#include <Daemon.h>
#include <rct/Log.h>
#include <libcec/cec.h>

using namespace CEC;

class CecController : public Controller
{
public:
    CecController(const std::shared_ptr<CecModule::Connection>& connection);

    CecModule* module() const;

    virtual Value get() const;
    virtual void set(const Value& value);

private:
    std::weak_ptr<CecModule::Connection> mConnection;
};

CecController::CecController(const std::shared_ptr<CecModule::Connection>& connection)
    : mConnection(connection)
{
}

CecModule* CecController::module() const
{
    if (std::shared_ptr<CecModule::Connection> conn = mConnection.lock())
        return conn->module;
    return 0;
}

Value CecController::get() const
{
    return Value();
}

void CecController::set(const Value& value)
{
}

CecModule::CecModule()
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
    delete callbacks;
    delete cecConfig;
}

void CecModule::initialize()
{
    std::shared_ptr<Connection> conn = std::make_shared<Connection>(this);
    libcec_configuration& config = *conn->cecConfig;
    ICECCallbacks& callbacks = *conn->callbacks;

    const Value cfg = configuration("cec");
    if (cfg.type() != Value::Type_Map && cfg.type() != Value::Type_Invalid) {
        mLog(Error, "Invalid cec config");
        return;
    }

    config.Clear();
    strcpy(config.strDeviceName, "homework");
    config.deviceTypes.Add(CEC_DEVICE_TYPE_TUNER);

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

    Controller::SharedPtr controller(new CecController(conn));
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
            cec->module()->mLog(level, message.message);
            return 1;
        }
        return 0;
    };
    callbacks.CBCecKeyPress = [](void* ptr, const cec_keypress key) -> int {
        Controller::WeakPtr* ctrlPtr = static_cast<CecController::WeakPtr*>(ptr);
        if (Controller::SharedPtr controller = ctrlPtr->lock()) {
        }
        return 1;
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
        mLog(Error, "Unable to initialize cec");
        return;
    }

    const String device = cfg.value<String>("device");

    // find adapters
    enum { MaxAdapters = 10 };
    cec_adapter adapters[MaxAdapters];
    const uint8_t num = conn->adapter->FindAdapters(adapters, MaxAdapters, 0);
    if (!num) {
        mLog(Error, "No cec adapters");
        CECDestroy(conn->adapter);
        conn->adapter = 0;
        return;
    }

    uint8_t selected = 0;
    for (uint8_t i = 0; i < num; ++i) {
        mLog(Debug, String::format<64>("available cec adapter %s", adapters[i].comm));
        if (!device.isEmpty() && device == adapters[i].comm) {
            selected = i;
            mLog(Info, String::format<64>("selected cec adapter %s", device.constData()));
        }
    }

    if (!conn->adapter->Open(adapters[selected].comm)) {
        mLog(Error, String::format<64>("unable to open adapter %s", adapters[selected].comm));
        CECDestroy(conn->adapter);
        conn->adapter = 0;
        return;
    }

    mConnections.append(conn);
    Modules::instance()->registerController(controller);
}
