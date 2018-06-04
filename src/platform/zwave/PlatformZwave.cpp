#include "PlatformZwave.h"
#include <ozw/Options.h>
#include <ozw/Manager.h>
#include <ozw/Driver.h>
#include <ozw/Node.h>
#include <ozw/Group.h>
#include <ozw/Defs.h>
#include <ozw/value_classes/ValueStore.h>
#include <ozw/value_classes/Value.h>
#include <ozw/value_classes/ValueBool.h>
#include <ozw/platform/Log.h>
#include <log/Log.h>
#include <cassert>

using namespace reckoning::log;

// taken from http://z-wave.sigmadesigns.com/wp-content/uploads/2016/08/SDS13740-1-Z-Wave-Plus-Device-and-Command-Class-Types-and-Defines-Specification.pdf
enum class GenericDeviceClass {
    AV_Control_Point = 0x03,
    Display = 0x04,
    Entry_Control = 0x40,
    Generic_Controller = 0x01,
    Meter = 0x31,
    Meter_Pulse = 0x30,
    Non_Interoperable = 0xFf,
    Repeater_Slave = 0x0F,
    Security_Panel = 0x17,
    Semi_Interoperable = 0x50,
    Sensor_Alarm = 0xA1,
    Sensor_Binary = 0x20,
    Sensor_Multilevel = 0x21,
    Static_Controller = 0x02,
    Switch_Binary = 0x10,
    Switch_Multilevel = 0x11,
    Switch_Remote = 0x12,
    Switch_Toggle = 0x13,
    Thermostat = 0x08,
    Ventilation = 0x16,
    Window_Covering = 0x09,
    Zip_Node = 0x15,
    Wall_Controller = 0x18,
    Network_Extender = 0x05,
    Appliance = 0x06,
    Sensor_Notification = 0x07
};

enum class SpecificTypeAvControlPoint {
    Not_Used = 0x00,
    Doorbell = 0x12,
    Satellite_Receiver = 0x04,
    Satellite_Receiver_V2 = 0x11
};

enum class SpecificTypeDisplay {
    Not_Used = 0x00,
    Simple_Display = 0x01
};

enum class SpecificTypeEntryControl {
    Not_Used = 0x00,
    Door_Lock = 0x01,
    Advanced_Door_Lock = 0x02,
    Secure_Keypad_Door_Lock = 0x03,
    Secure_Keypad_Door_Lock_Deadbolt = 0x04,
    Secure_Door = 0x05,
    Secure_Gate = 0x06,
    Secure_Barrier_Addon = 0x07,
    Secure_Barrier_Open_Only = 0x08,
    Secure_Barrier_Close_Only = 0x09,
    Secure_Lockbox = 0x0A,
    Secure_Keypad = 0x0B
};

enum class SpecificTypeSpecificController {
    Not_Used = 0x00,
    Portable_Remote_Controller = 0x01,
    Portable_Scene_Controller = 0x02,
    Portable_Installer_Tool = 0x03,
    Remote_Control_Av = 0x04,
    Remote_Control_Simple = 0x06
};

enum class SpecificTypeMeter {
    Not_Used = 0x00,
    Simple_Meter = 0x01,
    Adv_Energy_Control = 0x02,
    Whole_Home_Meter_Simple = 0x03
};

enum class SpecificTypeMeterPulse {
    Not_Used = 0x00
};

enum class SpecificTypeNonInteroperable {
    Not_Used = 0x00
};

enum class SpecificTypeRepeaterSlave {
    Not_Used = 0x00,
    Repeater_Slave = 0x01,
    Virtual_Node = 0x02
};

enum class SpecificTypeSecurityPanel {
    Not_Used = 0x00,
    Zoned_Security_Panel = 0x01
};

enum class SpecificTypeSemiInteroperable {
    Not_Used = 0x00,
    Energy_Production = 0x01
};

enum class SpecificTypeSensorAlarm {
    Not_Used = 0x00,
    Adv_Zensor_Net_Alarm_Sensor = 0x05,
    Adv_Zensor_Net_Smoke_Sensor = 0x0A,
    Basic_Routing_Alarm_Sensor = 0x01,
    Basic_Routing_Smoke_Sensor = 0x06,
    Basic_Zensor_Net_Alarm_Sensor = 0x03,
    Basic_Zensor_Net_Smoke_Sensor = 0x08,
    Routing_Alarm_Sensor = 0x02,
    Routing_Smoke_Sensor = 0x07,
    Zensor_Net_Alarm_Sensor = 0x04,
    Zensor_Net_Smoke_Sensor = 0x09,
    Alarm_Sensor = 0x0B
};

enum class SpecificTypeSensorBinary {
    Not_Used = 0x00,
    Routing_Sensor_Binary = 0x01
};

enum class SpecificTypeSensorMultilevel {
    Not_Used = 0x00,
    Routing_Sensor_Multilevel = 0x01,
    Chimney_Fan = 0x02
};

enum class SpecificTypeStaticController {
    Not_Used = 0x00,
    Pc_Controller = 0x01,
    Scene_Controller = 0x02,
    Static_Installer_Tool = 0x03,
    Set_Top_Box = 0x04,
    Sub_System_Controller = 0x05,
    TV = 0x06,
    Gateway = 0x07
};

enum class SpecificTypeSwitchBinary {
    Not_Used = 0x00,
    Power_Switch_Binary = 0x01,
    Scene_Switch_Binary = 0x03,
    Power_Strip = 0x04,
    Siren = 0x05,
    Valve_Open_Close = 0x06,
    Color_Tunable_Binary = 0x02,
    Irrigation_Controller = 0x07
};

enum class SpecificTypeSwitchMultilevel {
    Not_Used = 0x00,
    Class_A_Motor_Control = 0x05,
    Class_B_Motor_Control = 0x06,
    Class_C_Motor_Control = 0x07,
    Motor_Multiposition = 0x03,
    Power_Switch_Multilevel = 0x01,
    Scene_Switch_Multilevel = 0x04,
    Fan_Switch = 0x08,
    Color_Tunable_Multilevel = 0x02
};

enum class SpecificTypeSwitchRemote {
    Not_Used = 0x00,
    Switch_Remote_Binary = 0x01,
    Switch_Remote_Multilevel = 0x02,
    Switch_Remote_Toggle_Binary = 0x03,
    Switch_Remote_Toggle_Multilevel = 0x04
};

enum class SpecificTypeSwitchToggle {
    Not_Used = 0x00,
    Switch_Toggle_Binary = 0x01,
    Switch_Toggle_Multilevel = 0x02
};

enum class SpecificTypeThermostat {
    Not_Used = 0x00,
    Setback_Schedule_Thermostat = 0x03,
    Setback_Thermostat = 0x05,
    Setpoint_Thermostat = 0x04,
    Thermostat_General = 0x02,
    Thermostat_General_V2 = 0x06,
    Thermostat_Heating = 0x01
};

enum class SpecificTypeVentilation {
    Not_Used = 0x00,
    Residential_HRV = 0x01
};

enum class SpecificTypeWindowCovering {
    Not_Used = 0x00,
    Simple_Window_Covering = 0x01
};

enum class SpecificTypeZipNode {
    Not_Used = 0x00,
    Zip_Adv_Node = 0x02,
    Zip_Tun_Node = 0x01
};

enum class SpecificTypeWallController {
    Not_Used = 0x00,
    Basic_Wall_Controller = 0x01
};

enum class SpecificTypeNetworkExtender {
    Not_Used = 0x00,
    Secure_Extender = 0x01
};

enum class SpecificTypeAppliance {
    Not_Used = 0x00,
    General_Appliance = 0x01,
    Kitchen_Appliance = 0x02,
    Laundry_Appliance = 0x03
};

enum class SpecificTypeSensorNotification {
    Not_Used = 0x00,
    Notification_Sensor = 0x01
};

struct NodeInfo
{
    uint32_t homeId;
    uint8_t nodeId;
    bool polled;
    std::vector<OpenZWave::ValueID> values;
};

struct PlatformZwaveData
{
    PlatformZwave* zwave;

    std::vector<std::unique_ptr<NodeInfo> > nodes;
    NodeInfo* findNode(const OpenZWave::Notification* notification);

    // stuff accessed from the main thread
    std::atomic<uint32_t> homeId;
};

NodeInfo* PlatformZwaveData::findNode(const OpenZWave::Notification* notification)
{
    const auto homeId = notification->GetHomeId();
    const auto nodeId = notification->GetNodeId();
    for (const auto& ptr : nodes) {
        if (ptr->homeId == homeId && ptr->nodeId == nodeId)
            return ptr.get();
    }
    return nullptr;
}

PlatformZwave::PlatformZwave(const Options& options)
    : Platform("zwave", options), mData(nullptr)
{
    mPort = options.value<std::string>("zwave-port");
    if (mPort.empty()) {
        Log(Log::Error) << "no openzwave port";
        return;
    }
    mConfig = options.value<std::string>("zwave-config");
    if (mConfig.empty()) {
        Log(Log::Error) << "no openzwave config";
        return;
    }
    mPollInterval = options.value<int>("zwave-pollInterval", 500);

    setValid(true);
}

PlatformZwave::~PlatformZwave()
{
    if (!isValid())
        return;
    assert(!mPort.empty());
    assert(mData != nullptr);
    auto zmanager = OpenZWave::Manager::Get();
    assert(zmanager != nullptr);
    zmanager->RemoveWatcher(onNotification, this);
    delete mData;
    OpenZWave::Manager::Destroy();
    OpenZWave::Options::Destroy();
}

bool PlatformZwave::start()
{
    assert(isValid());

    OpenZWave::Options::Create(mConfig, std::string(), std::string());
    auto zoptions = OpenZWave::Options::Get();
    assert(zoptions != nullptr);
    zoptions->AddOptionInt("PollInterval", mPollInterval);
    zoptions->AddOptionInt("SaveLogLevel", OpenZWave::LogLevel_Detail);
    zoptions->AddOptionInt("QueueLogLevel", OpenZWave::LogLevel_Debug);
    zoptions->AddOptionInt("DumpTrigger", OpenZWave::LogLevel_Error);
    zoptions->AddOptionBool("IntervalBetweenPolls", true);
    zoptions->AddOptionBool("ValidateValueChanges", true);
    zoptions->AddOptionBool("ConsoleOutput", false);
    zoptions->Lock();

    OpenZWave::Manager::Create();
    auto zmanager = OpenZWave::Manager::Get();
    assert(zmanager != nullptr);

    mData = new PlatformZwaveData;
    mData->homeId = 0;
    mData->zwave = this;

    zmanager->AddWatcher(onNotification, mData);
    zmanager->AddDriver(mPort);

    // commands
    auto addNodeCommand = Action::create("addnode", [this, zmanager](const Action::Arguments& args) {
            assert(args.size() == 1 && args[0].type() == typeid(bool));
            auto homeId = mData->homeId.load();
            if (homeId != 0) {
                Log(Log::Error) << "adding node for homeid" << homeId;
                zmanager->CancelControllerCommand(homeId);
                zmanager->AddNode(homeId, std::any_cast<bool>(args[0]));
            }
        }, Action::Descriptors {
            ArgumentDescriptor { ArgumentDescriptor::Bool }
        });
    addAction(std::move(addNodeCommand));
    auto removeNodeCommand = Action::create("removenode", [this, zmanager](const Action::Arguments& args) {
            auto homeId = mData->homeId.load();
            if (homeId != 0) {
                Log(Log::Error) << "removing node for homeid" << homeId;
                zmanager->CancelControllerCommand(homeId);
                zmanager->RemoveNode(homeId);
            }
        });
    addAction(std::move(removeNodeCommand));
    auto cancelCommand = Action::create("cancel", [this, zmanager](const Action::Arguments& args) {
            auto homeId = mData->homeId.load();
            if (homeId != 0) {
                const bool ok = zmanager->CancelControllerCommand(homeId);
                Log(Log::Error) << "cancelled" << homeId << (ok ? "ok" : "failed");
            }
        });
    addAction(std::move(cancelCommand));
    return true;
}

void PlatformZwave::onNotification(const OpenZWave::Notification* notification, void* ctx)
{
    PlatformZwaveData* data = static_cast<PlatformZwaveData*>(ctx);
    Log(Log::Info) << "hello" << notification->GetType();
    switch (notification->GetType()) {
    case OpenZWave::Notification::Type_ValueAdded:
        if(NodeInfo* nodeInfo = data->findNode(notification)) {
            nodeInfo->values.push_back(notification->GetValueID());
        }
        break;
    case OpenZWave::Notification::Type_ValueRemoved:
        if(NodeInfo* nodeInfo = data->findNode(notification)) {
            auto it = nodeInfo->values.begin();
            const auto end = nodeInfo->values.end();
            while (it != end) {
                if (*it == notification->GetValueID()) {
                    nodeInfo->values.erase(it);
                    break;
                }
                ++it;
            }
        }
        break;
    case OpenZWave::Notification::Type_ValueChanged:
        if(NodeInfo* nodeInfo = data->findNode(notification)) {
            // fun stuff
        }
        break;
    case OpenZWave::Notification::Type_SceneEvent:
        break;
    case OpenZWave::Notification::Type_CreateButton:
    case OpenZWave::Notification::Type_DeleteButton:
    case OpenZWave::Notification::Type_ButtonOn:
    case OpenZWave::Notification::Type_ButtonOff:
        // buttons?
        break;
    case OpenZWave::Notification::Type_NodeAdded: {
        auto node = std::make_unique<NodeInfo>();
        node->homeId = notification->GetHomeId();
        node->nodeId = notification->GetNodeId();
        node->polled = false;
        data->nodes.push_back(std::move(node));
        break; }
    case OpenZWave::Notification::Type_NodeRemoved: {
        const auto homeId = notification->GetHomeId();
        const auto nodeId = notification->GetNodeId();

        auto it = data->nodes.begin();
        const auto end = data->nodes.cend();
        while (it != end) {
            if ((*it)->homeId == homeId && (*it)->nodeId == nodeId) {
                data->nodes.erase(it);
                break;
            }
            ++it;
        }
        break; }
    case OpenZWave::Notification::Type_NodeProtocolInfo:
    case OpenZWave::Notification::Type_NodeNaming:
    case OpenZWave::Notification::Type_NodeEvent:
    case OpenZWave::Notification::Type_NodeQueriesComplete:
    case OpenZWave::Notification::Type_NodeReset:
        break;
    case OpenZWave::Notification::Type_PollingDisabled:
        if(NodeInfo* nodeInfo = data->findNode(notification)) {
            nodeInfo->polled = false;
        }
        break;
    case OpenZWave::Notification::Type_PollingEnabled:
        if(NodeInfo* nodeInfo = data->findNode(notification)) {
            nodeInfo->polled = true;
        }
        break;
    case OpenZWave::Notification::Type_DriverReady:
        data->homeId = notification->GetHomeId();
        // ready
        break;
    case OpenZWave::Notification::Type_DriverFailed:
        // error error
        break;
    case OpenZWave::Notification::Type_DriverRemoved:
        // uh oh
        break;
    case OpenZWave::Notification::Type_DriverReset:
        // invalidate everything
        data->nodes.clear();
        break;
    case OpenZWave::Notification::Type_AwakeNodesQueried:
    case OpenZWave::Notification::Type_AllNodesQueried:
    case OpenZWave::Notification::Type_AllNodesQueriedSomeDead:
        // notify homework
        break;
    case OpenZWave::Notification::Type_Notification:
    case OpenZWave::Notification::Type_ControllerCommand:
        // stuff
        break;
    default:
        break;
    }
}
