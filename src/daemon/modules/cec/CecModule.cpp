#include "CecModule.h"
#include <Controller.h>
#include <Daemon.h>
#include <rct/Log.h>
#include <libcec/cec.h>

using namespace CEC;

static inline const char* convertKeyCode(cec_user_control_code code)
{
    switch (code) {
    case CEC_USER_CONTROL_CODE_SELECT:
        return "SELECT";
    case CEC_USER_CONTROL_CODE_UP:
        return "UP";
    case CEC_USER_CONTROL_CODE_DOWN:
        return "DOWN";
    case CEC_USER_CONTROL_CODE_LEFT:
        return "LEFT";
    case CEC_USER_CONTROL_CODE_RIGHT:
        return "RIGHT";
    case CEC_USER_CONTROL_CODE_RIGHT_UP:
        return "RIGHT_UP";
    case CEC_USER_CONTROL_CODE_RIGHT_DOWN:
        return "RIGHT_DOWN";
    case CEC_USER_CONTROL_CODE_LEFT_UP:
        return "LEFT_UP";
    case CEC_USER_CONTROL_CODE_LEFT_DOWN:
        return "LEFT_DOWN";
    case CEC_USER_CONTROL_CODE_ROOT_MENU:
        return "ROOT_MENU";
    case CEC_USER_CONTROL_CODE_SETUP_MENU:
        return "SETUP_MENU";
    case CEC_USER_CONTROL_CODE_CONTENTS_MENU:
        return "CONTENTS_MENU";
    case CEC_USER_CONTROL_CODE_FAVORITE_MENU:
        return "FAVORITE_MENU";
    case CEC_USER_CONTROL_CODE_EXIT:
        return "EXIT";
    case CEC_USER_CONTROL_CODE_TOP_MENU:
        return "TOP_MENU";
    case CEC_USER_CONTROL_CODE_DVD_MENU:
        return "DVD_MENU";
    case CEC_USER_CONTROL_CODE_NUMBER_ENTRY_MODE:
        return "NUMBER_ENTRY_MODE";
    case CEC_USER_CONTROL_CODE_NUMBER11:
        return "NUMBER11";
    case CEC_USER_CONTROL_CODE_NUMBER12:
        return "NUMBER12";
    case CEC_USER_CONTROL_CODE_NUMBER0:
        return "NUMBER0";
    case CEC_USER_CONTROL_CODE_NUMBER1:
        return "NUMBER1";
    case CEC_USER_CONTROL_CODE_NUMBER2:
        return "NUMBER2";
    case CEC_USER_CONTROL_CODE_NUMBER3:
        return "NUMBER3";
    case CEC_USER_CONTROL_CODE_NUMBER4:
        return "NUMBER4";
    case CEC_USER_CONTROL_CODE_NUMBER5:
        return "NUMBER5";
    case CEC_USER_CONTROL_CODE_NUMBER6:
        return "NUMBER6";
    case CEC_USER_CONTROL_CODE_NUMBER7:
        return "NUMBER7";
    case CEC_USER_CONTROL_CODE_NUMBER8:
        return "NUMBER8";
    case CEC_USER_CONTROL_CODE_NUMBER9:
        return "NUMBER9";
    case CEC_USER_CONTROL_CODE_DOT:
        return "DOT";
    case CEC_USER_CONTROL_CODE_ENTER:
        return "ENTER";
    case CEC_USER_CONTROL_CODE_CLEAR:
        return "CLEAR";
    case CEC_USER_CONTROL_CODE_NEXT_FAVORITE:
        return "NEXT_FAVORITE";
    case CEC_USER_CONTROL_CODE_CHANNEL_UP:
        return "CHANNEL_UP";
    case CEC_USER_CONTROL_CODE_CHANNEL_DOWN:
        return "CHANNEL_DOWN";
    case CEC_USER_CONTROL_CODE_PREVIOUS_CHANNEL:
        return "PREVIOUS_CHANNEL";
    case CEC_USER_CONTROL_CODE_SOUND_SELECT:
        return "SOUND_SELECT";
    case CEC_USER_CONTROL_CODE_INPUT_SELECT:
        return "INPUT_SELECT";
    case CEC_USER_CONTROL_CODE_DISPLAY_INFORMATION:
        return "DISPLAY_INFORMATION";
    case CEC_USER_CONTROL_CODE_HELP:
        return "HELP";
    case CEC_USER_CONTROL_CODE_PAGE_UP:
        return "PAGE_UP";
    case CEC_USER_CONTROL_CODE_PAGE_DOWN:
        return "PAGE_DOWN";
    case CEC_USER_CONTROL_CODE_POWER:
        return "POWER";
    case CEC_USER_CONTROL_CODE_VOLUME_UP:
        return "VOLUME_UP";
    case CEC_USER_CONTROL_CODE_VOLUME_DOWN:
        return "VOLUME_DOWN";
    case CEC_USER_CONTROL_CODE_MUTE:
        return "MUTE";
    case CEC_USER_CONTROL_CODE_PLAY:
        return "PLAY";
    case CEC_USER_CONTROL_CODE_STOP:
        return "STOP";
    case CEC_USER_CONTROL_CODE_PAUSE:
        return "PAUSE";
    case CEC_USER_CONTROL_CODE_RECORD:
        return "RECORD";
    case CEC_USER_CONTROL_CODE_REWIND:
        return "REWIND";
    case CEC_USER_CONTROL_CODE_FAST_FORWARD:
        return "FAST_FORWARD";
    case CEC_USER_CONTROL_CODE_EJECT:
        return "EJECT";
    case CEC_USER_CONTROL_CODE_FORWARD:
        return "FORWARD";
    case CEC_USER_CONTROL_CODE_BACKWARD:
        return "BACKWARD";
    case CEC_USER_CONTROL_CODE_STOP_RECORD:
        return "STOP_RECORD";
    case CEC_USER_CONTROL_CODE_PAUSE_RECORD:
        return "PAUSE_RECORD";
    case CEC_USER_CONTROL_CODE_ANGLE:
        return "ANGLE";
    case CEC_USER_CONTROL_CODE_SUB_PICTURE:
        return "SUB_PICTURE";
    case CEC_USER_CONTROL_CODE_VIDEO_ON_DEMAND:
        return "VIDEO_ON_DEMAND";
    case CEC_USER_CONTROL_CODE_ELECTRONIC_PROGRAM_GUIDE:
        return "ELECTRONIC_PROGRAM_GUIDE";
    case CEC_USER_CONTROL_CODE_TIMER_PROGRAMMING:
        return "TIMER_PROGRAMMING";
    case CEC_USER_CONTROL_CODE_INITIAL_CONFIGURATION:
        return "INITIAL_CONFIGURATION";
    case CEC_USER_CONTROL_CODE_SELECT_BROADCAST_TYPE:
        return "SELECT_BROADCAST_TYPE";
    case CEC_USER_CONTROL_CODE_SELECT_SOUND_PRESENTATION:
        return "SELECT_SOUNDPRESENTATION";
    case CEC_USER_CONTROL_CODE_PLAY_FUNCTION:
        return "PLAY_FUNCTION";
    case CEC_USER_CONTROL_CODE_PAUSE_PLAY_FUNCTION:
        return "PAUSE_PLAY_FUNCTION";
    case CEC_USER_CONTROL_CODE_RECORD_FUNCTION:
        return "RECORD_FUNCTION";
    case CEC_USER_CONTROL_CODE_PAUSE_RECORD_FUNCTION:
        return "PAUSE_RECORD_FUNCTION";
    case CEC_USER_CONTROL_CODE_STOP_FUNCTION:
        return "STOP_FUNCTION";
    case CEC_USER_CONTROL_CODE_MUTE_FUNCTION:
        return "MUTE_FUNCTION";
    case CEC_USER_CONTROL_CODE_RESTORE_VOLUME_FUNCTION:
        return "RESTORE_VOLUME_FUNCTION";
    case CEC_USER_CONTROL_CODE_TUNE_FUNCTION:
        return "TUNE_FUNCTION";
    case CEC_USER_CONTROL_CODE_SELECT_MEDIA_FUNCTION:
        return "SELECT_MEDIA_FUNCTION";
    case CEC_USER_CONTROL_CODE_SELECT_AV_INPUT_FUNCTION:
        return "SELECT_AV_INPUT_FUNCTION";
    case CEC_USER_CONTROL_CODE_SELECT_AUDIO_INPUT_FUNCTION:
        return "SELECT_AUDIO_INPUT_FUNCTION";
    case CEC_USER_CONTROL_CODE_POWER_TOGGLE_FUNCTION:
        return "POWER_TOGGLE_FUNCTION";
    case CEC_USER_CONTROL_CODE_POWER_OFF_FUNCTION:
        return "POWER_OFF_FUNCTION";
    case CEC_USER_CONTROL_CODE_POWER_ON_FUNCTION:
        return "POWER_ON_FUNCTION";
    case CEC_USER_CONTROL_CODE_F1_BLUE:
        return "F1_BLUE";
    case CEC_USER_CONTROL_CODE_F2_RED:
        return "F2_RED";
    case CEC_USER_CONTROL_CODE_F3_GREEN:
        return "F3_GREEN";
    case CEC_USER_CONTROL_CODE_F4_YELLOW:
        return "F4_YELLOW";
    case CEC_USER_CONTROL_CODE_F5:
        return "F5";
    case CEC_USER_CONTROL_CODE_DATA:
        return "DATA";
    case CEC_USER_CONTROL_CODE_AN_RETURN:
        return "AN_RETURN";
    case CEC_USER_CONTROL_CODE_AN_CHANNELS_LIST:
        return "AN_CHANNELS_LIST";
    case CEC_USER_CONTROL_CODE_UNKNOWN:
        return "UNKNOWN";
    }
    return "";
}

class CecController : public Controller
{
public:
    CecController(const std::shared_ptr<CecModule::Connection>& connection);

    CecModule* module() const;

    virtual Value get() const;
    virtual void set(const Value& value);

    void changeState(const Value& value);

private:
    std::weak_ptr<CecModule::Connection> mConnection;
};

CecController::CecController(const std::shared_ptr<CecModule::Connection>& connection)
    : mConnection(connection)
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
            std::shared_ptr<CecController> cec = std::static_pointer_cast<CecController>(controller);
            Value event;
            event["type"] = !key.duration ? "press" : "release";
            event["key"] = convertKeyCode(key.keycode);
            cec->changeState(event);

            return 1;
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
