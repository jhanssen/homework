#include "CecModule.h"
#include <Controller.h>
#include <Daemon.h>
#include <libcec/cec.h>
#include <rct/Log.h>

using namespace CEC;

class CecController : public Controller
{
public:
    CecController(CecModule* module);

    CecModule* module() const;

    virtual Value get() const;
    virtual void set(const Value& value);

private:
    CecModule* mModule;
};

CecController::CecController(CecModule* module)
    : mModule(module)
{
}

CecModule* CecController::module() const
{
    return mModule;
}

Value CecController::get() const
{
    return Value();
}

void CecController::set(const Value& value)
{
}

CecModule::CecModule()
    : mCecConfig(new libcec_configuration), mCallbacks(new ICECCallbacks)
{
    mCecConfig->callbacks = mCallbacks;
}

CecModule::~CecModule()
{
    delete mCallbacks;
    delete mCecConfig;
}

void CecModule::initialize()
{
    const Value cfg = configuration("cec");
    if (cfg.type() != Value::Type_Map && cfg.type() != Value::Type_Invalid) {
        error() << "Invalid cec config";
        return;
    }

    mCecConfig->Clear();
    strcpy(mCecConfig->strDeviceName, "homework");
    mCecConfig->deviceTypes.Add(CEC_DEVICE_TYPE_TUNER);

    if (cfg.contains("baseDevice")) {
        const int base = cfg.value<int>("baseDevice");
        if (base >= 0 && base < CECDEVICE_BROADCAST)
            mCecConfig->baseDevice = static_cast<cec_logical_address>(base);
    }
    if (cfg.contains("hdmiPort")) {
        const int hdmi = cfg.value<int>("hdmiPort");
        if (hdmi >= CEC_MIN_HDMI_PORTNUMBER && hdmi <= CEC_MAX_HDMI_PORTNUMBER)
            mCecConfig->iHDMIPort = hdmi;
    }

    Controller::SharedPtr controller(new CecController(this));

    mCecConfig->callbackParam = controller.get();
    mCallbacks->CBCecLogMessage = [](void* ptr, const cec_log_message message) -> int {
        CecController* controller = static_cast<CecController*>(ptr);
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
        controller->module()->mLog(level, message.message);
        return 1;
    };

    Modules::instance()->registerController(controller);
}
