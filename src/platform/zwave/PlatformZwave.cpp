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
#include <ozw/command_classes/CommandClass.h>
#include <ozw/command_classes/CommandClasses.h>
#include <ozw/platform/Log.h>
#include <log/Log.h>
#include <cassert>

using namespace reckoning::log;

// taken from http://z-wave.sigmadesigns.com/wp-content/uploads/2016/08/SDS13740-1-Z-Wave-Plus-Device-and-Command-Class-Types-and-Defines-Specification.pdf
enum class GenericDevice {
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

enum class SpecificAvControlPoint {
    Not_Used = 0x00,
    Doorbell = 0x12,
    Satellite_Receiver = 0x04,
    Satellite_Receiver_V2 = 0x11
};

enum class SpecificDisplay {
    Not_Used = 0x00,
    Simple_Display = 0x01
};

enum class SpecificEntryControl {
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

enum class SpecificSpecificController {
    Not_Used = 0x00,
    Portable_Remote_Controller = 0x01,
    Portable_Scene_Controller = 0x02,
    Portable_Installer_Tool = 0x03,
    Remote_Control_Av = 0x04,
    Remote_Control_Simple = 0x06
};

enum class SpecificMeter {
    Not_Used = 0x00,
    Simple_Meter = 0x01,
    Adv_Energy_Control = 0x02,
    Whole_Home_Meter_Simple = 0x03
};

enum class SpecificMeterPulse {
    Not_Used = 0x00
};

enum class SpecificNonInteroperable {
    Not_Used = 0x00
};

enum class SpecificRepeaterSlave {
    Not_Used = 0x00,
    Repeater_Slave = 0x01,
    Virtual_Node = 0x02
};

enum class SpecificSecurityPanel {
    Not_Used = 0x00,
    Zoned_Security_Panel = 0x01
};

enum class SpecificSemiInteroperable {
    Not_Used = 0x00,
    Energy_Production = 0x01
};

enum class SpecificSensorAlarm {
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

enum class SpecificSensorBinary {
    Not_Used = 0x00,
    Routing_Sensor_Binary = 0x01
};

enum class SpecificSensorMultilevel {
    Not_Used = 0x00,
    Routing_Sensor_Multilevel = 0x01,
    Chimney_Fan = 0x02
};

enum class SpecificStaticController {
    Not_Used = 0x00,
    Pc_Controller = 0x01,
    Scene_Controller = 0x02,
    Static_Installer_Tool = 0x03,
    Set_Top_Box = 0x04,
    Sub_System_Controller = 0x05,
    TV = 0x06,
    Gateway = 0x07
};

enum class SpecificSwitchBinary {
    Not_Used = 0x00,
    Power_Switch_Binary = 0x01,
    Scene_Switch_Binary = 0x03,
    Power_Strip = 0x04,
    Siren = 0x05,
    Valve_Open_Close = 0x06,
    Color_Tunable_Binary = 0x02,
    Irrigation_Controller = 0x07
};

enum class SpecificSwitchMultilevel {
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

enum class SpecificSwitchRemote {
    Not_Used = 0x00,
    Switch_Remote_Binary = 0x01,
    Switch_Remote_Multilevel = 0x02,
    Switch_Remote_Toggle_Binary = 0x03,
    Switch_Remote_Toggle_Multilevel = 0x04
};

enum class SpecificSwitchToggle {
    Not_Used = 0x00,
    Switch_Toggle_Binary = 0x01,
    Switch_Toggle_Multilevel = 0x02
};

enum class SpecificThermostat {
    Not_Used = 0x00,
    Setback_Schedule_Thermostat = 0x03,
    Setback_Thermostat = 0x05,
    Setpoint_Thermostat = 0x04,
    Thermostat_General = 0x02,
    Thermostat_General_V2 = 0x06,
    Thermostat_Heating = 0x01
};

enum class SpecificVentilation {
    Not_Used = 0x00,
    Residential_HRV = 0x01
};

enum class SpecificWindowCovering {
    Not_Used = 0x00,
    Simple_Window_Covering = 0x01
};

enum class SpecificZipNode {
    Not_Used = 0x00,
    Zip_Adv_Node = 0x02,
    Zip_Tun_Node = 0x01
};

enum class SpecificWallController {
    Not_Used = 0x00,
    Basic_Wall_Controller = 0x01
};

enum class SpecificNetworkExtender {
    Not_Used = 0x00,
    Secure_Extender = 0x01
};

enum class SpecificAppliance {
    Not_Used = 0x00,
    General_Appliance = 0x01,
    Kitchen_Appliance = 0x02,
    Laundry_Appliance = 0x03
};

enum class SpecificSensorNotification {
    Not_Used = 0x00,
    Notification_Sensor = 0x01
};

enum class CommandClass {
    No_Operation = 0x00,
    Basic = 0x20,
    Controller_Replication = 0x21,
    Application_Status = 0x22,
    Zip_Services = 0x23,
    Zip_Server = 0x24,
    Switch_Binary = 0x25,
    Switch_Multilevel = 0x26,
    Switch_Multilevel_V2 = 0x26,
    Switch_All = 0x27,
    Switch_Toggle_Binary = 0x28,
    Switch_Toggle_Multilevel = 0x29,
    Chimney_Fan = 0x2A,
    Scene_Activation = 0x2B,
    Scene_Actuator_Conf = 0x2C,
    Scene_Controller_Conf = 0x2D,
    Zip_Client = 0x2E,
    Zip_Adv_Services = 0x2F,
    Sensor_Binary = 0x30,
    Sensor_Multilevel = 0x31,
    Sensor_Multilevel_V2 = 0x31,
    Meter = 0x32,
    Zip_Adv_Server = 0x33,
    Zip_Adv_Client = 0x34,
    Meter_Pulse = 0x35,
    Meter_Tbl_Config = 0x3C,
    Meter_Tbl_Monitor = 0x3D,
    Meter_Tbl_Push = 0x3E,
    Thermostat_Heating = 0x38,
    Thermostat_Mode = 0x40,
    Thermostat_Operating_State = 0x42,
    Thermostat_Setpoint = 0x43,
    Thermostat_Fan_Mode = 0x44,
    Thermostat_Fan_State = 0x45,
    Climate_Control_Schedule = 0x46,
    Thermostat_Setback = 0x47,
    Door_Lock_Logging = 0x4C,
    Schedule_Entry_Lock = 0x4E,
    Basic_Window_Covering = 0x50,
    Mtp_Window_Covering = 0x51,
    Association_Grp_Info = 0x59,
    Device_Reset_Locally = 0x5A,
    Central_Scene = 0x5B,
    Ip_Association = 0x5C,
    Antitheft = 0x5D,
    Zwaveplus_Info = 0x5E,
    Multi_Channel_V2 = 0x60,
    Multi_Instance = 0x60,
    Door_Lock = 0x62,
    User_Code = 0x63,
    Barrier_Operator = 0x66,
    Configuration = 0x70,
    Configuration_V2 = 0x70,
    Alarm = 0x71,
    Manufacturer_Specific = 0x72,
    Powerlevel = 0x73,
    Protection = 0x75,
    Protection_V2 = 0x75,
    Lock = 0x76,
    Node_Naming = 0x77,
    Firmware_Update_Md = 0x7A,
    Grouping_Name = 0x7B,
    Remote_Association_Activate = 0x7C,
    Remote_Association = 0x7D,
    Battery = 0x80,
    Clock = 0x81,
    Hail = 0x82,
    Wake_Up = 0x84,
    Wake_Up_V2 = 0x84,
    Association = 0x85,
    Association_V2 = 0x85,
    Version = 0x86,
    Indicator = 0x87,
    Proprietary = 0x88,
    Language = 0x89,
    Time = 0x8A,
    Time_Parameters = 0x8B,
    Geographic_Location = 0x8C,
    Composite = 0x8D,
    Multi_Channel_Association_V2 = 0x8E,
    Multi_Instance_Association = 0x8E,
    Multi_Cmd = 0x8F,
    Energy_Production = 0x90,
    Manufacturer_Proprietary = 0x91,
    Screen_Md = 0x92,
    Screen_Md_V2 = 0x92,
    Screen_Attributes = 0x93,
    Screen_Attributes_V2 = 0x93,
    Simple_Av_Control = 0x94,
    Av_Content_Directory_Md = 0x95,
    Av_Renderer_Status = 0x96,
    Av_Content_Search_Md = 0x97,
    Security = 0x98,
    Av_Tagging_Md = 0x99,
    Ip_Configuration = 0x9A,
    Association_Command_Configuration = 0x9B,
    Sensor_Alarm = 0x9C,
    Silence_Alarm = 0x9D,
    Sensor_Configuration = 0x9E,
    Mark = 0xEF,
    Non_Interoperable = 0xF0
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

    std::string devicePrefix;

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

inline void PlatformZwave::makeDevice(NodeInfo* nodeInfo, const std::string& uniqueId)
{
    auto zmanager = OpenZWave::Manager::Get();

    auto findCommandClass = [](NodeInfo* nodeInfo, CommandClass cls) -> const OpenZWave::ValueID* {
        for (const auto& v : nodeInfo->values) {
            if (static_cast<CommandClass>(v.GetCommandClassId()) == cls)
                return &v;
        }
        return nullptr;
    };

    const auto generic = static_cast<GenericDevice>(zmanager->GetNodeGeneric(nodeInfo->homeId, nodeInfo->nodeId));

    std::shared_ptr<Device> dev = Device::create(uniqueId, "Unknown",
                                                 zmanager->GetNodeName(nodeInfo->homeId, nodeInfo->nodeId));

    switch (generic) {
    case GenericDevice::Switch_Binary: {
        const auto specific = static_cast<SpecificSwitchBinary>(zmanager->GetNodeSpecific(nodeInfo->homeId, nodeInfo->nodeId));
        if (specific == SpecificSwitchBinary::Power_Switch_Binary) {
            Platform::changeDeviceGroup(dev, "Binary Switch");
        }

        // find the Switch_All command class
        auto valueId = findCommandClass(nodeInfo, CommandClass::Switch_Binary);
        if (!valueId) {
            Log(Log::Error) << "unable to find command class Switch_Binary for Switch_Binary";
            return;
        }

        // add our state, event and actions
        auto turnOnCommand = Action::create("turnon", [zmanager, valueId](const Action::Arguments& /*args*/) {
                zmanager->SetValue(*valueId, true);
            });
        auto turnOffCommand = Action::create("turnoff", [zmanager, valueId](const Action::Arguments& /*args*/) {
                zmanager->SetValue(*valueId, false);
            });
        auto setCommand = Action::create("set", [zmanager, valueId](const Action::Arguments& args) {
                assert(args.size() == 1 && args[0].type() == typeid(bool));
                zmanager->SetValue(*valueId, std::any_cast<bool>(args[0]));
            }, Action::Descriptors {
                ArgumentDescriptor { ArgumentDescriptor::Bool }
            });
        auto toggleCommand = Action::create("toggle", [zmanager, valueId](const Action::Arguments& /*args*/) {
                bool on;
                if (zmanager->GetValueAsBool(*valueId, &on)) {
                    zmanager->SetValue(*valueId, !on);
                }
            });
        addDeviceAction(dev, std::move(turnOnCommand));
        addDeviceAction(dev, std::move(turnOffCommand));
        addDeviceAction(dev, std::move(setCommand));
        addDeviceAction(dev, std::move(toggleCommand));

        bool on;
        if (zmanager->GetValueAsBool(*valueId, &on)) {
            auto onState = State::create("on", on);
            addDeviceState(dev, std::move(onState));
        } else {
            auto onState = State::create("on", false);
            addDeviceState(dev, std::move(onState));
        }

        break; }
    default:
        break;
    }

    addDevice(std::move(dev));
}

inline void PlatformZwave::updateDevice(NodeInfo* nodeInfo, const std::string& uniqueId, const OpenZWave::ValueID* valueId)
{
    auto zmanager = OpenZWave::Manager::Get();

    const auto generic = static_cast<GenericDevice>(zmanager->GetNodeGeneric(nodeInfo->homeId, nodeInfo->nodeId));
    switch (generic) {
    case GenericDevice::Switch_Binary: {
        if (static_cast<CommandClass>(valueId->GetCommandClassId()) == CommandClass::Switch_Binary) {
            // find the "on" value
            auto state = findDeviceState(uniqueId, "on");
            if (state) {
                bool on;
                if (zmanager->GetValueAsBool(*valueId, &on)) {
                    changeState(state, std::any(on));
                }
            }
        }

        break; }
    default:
        // no
        break;
    }
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

bool PlatformZwave::stop()
{
    if (!isValid())
        return false;
    assert(!mPort.empty());
    assert(mData != nullptr);
    auto zmanager = OpenZWave::Manager::Get();
    assert(zmanager != nullptr);
    zmanager->RemoveWatcher(onNotification, this);
    delete mData;
    OpenZWave::Manager::Destroy();
    OpenZWave::Options::Destroy();

    return true;
}

void PlatformZwave::onNotification(const OpenZWave::Notification* notification, void* ctx)
{
    PlatformZwaveData* data = static_cast<PlatformZwaveData*>(ctx);
    Log(Log::Info) << "hello" << notification->GetType();
    switch (notification->GetType()) {
    case OpenZWave::Notification::Type_ValueAdded:
        if (NodeInfo* nodeInfo = data->findNode(notification)) {
            nodeInfo->values.push_back(notification->GetValueID());
        }
        break;
    case OpenZWave::Notification::Type_ValueRemoved:
        if (NodeInfo* nodeInfo = data->findNode(notification)) {
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
        if (NodeInfo* nodeInfo = data->findNode(notification)) {
            const std::string uniqueId = data->devicePrefix + std::to_string(notification->GetNodeId());
            data->zwave->updateDevice(nodeInfo, uniqueId, &notification->GetValueID());
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
    case OpenZWave::Notification::Type_NodeNaming: {
        auto zmanager = OpenZWave::Manager::Get();

        if (NodeInfo* nodeInfo = data->findNode(notification)) {
            Log(Log::Info) << "node naming"
                           << "id" << nodeInfo->nodeId
                           << "type" << zmanager->GetNodeType(nodeInfo->homeId, nodeInfo->nodeId)
                           << "basic" << zmanager->GetNodeBasic(nodeInfo->homeId, nodeInfo->nodeId)
                           << "generic" << zmanager->GetNodeGeneric(nodeInfo->homeId, nodeInfo->nodeId)
                           << "specific" << zmanager->GetNodeSpecific(nodeInfo->homeId, nodeInfo->nodeId);

            const std::string uniqueId = data->devicePrefix + std::to_string(notification->GetNodeId());
            if (!data->zwave->hasDevice(uniqueId)) {
                data->zwave->makeDevice(nodeInfo, uniqueId);

                for (const auto& v : nodeInfo->values) {
                    Log(Log::Info) << "  value type" << v.GetType() << v.GetCommandClassId();
                }
            }
        }
        break; }
    case OpenZWave::Notification::Type_NodeProtocolInfo:
    case OpenZWave::Notification::Type_NodeEvent:
        break;
    case OpenZWave::Notification::Type_NodeQueriesComplete: {
        auto zmanager = OpenZWave::Manager::Get();

        if (NodeInfo* nodeInfo = data->findNode(notification)) {
            Log(Log::Info) << "node complete"
                           << "id" << nodeInfo->nodeId
                           << "type" << zmanager->GetNodeType(nodeInfo->homeId, nodeInfo->nodeId)
                           << "basic" << zmanager->GetNodeBasic(nodeInfo->homeId, nodeInfo->nodeId)
                           << "generic" << zmanager->GetNodeGeneric(nodeInfo->homeId, nodeInfo->nodeId)
                           << "specific" << zmanager->GetNodeSpecific(nodeInfo->homeId, nodeInfo->nodeId);

            const std::string uniqueId = data->devicePrefix + std::to_string(notification->GetNodeId());
            if (!data->zwave->hasDevice(uniqueId)) {
                data->zwave->makeDevice(nodeInfo, uniqueId);

                for (const auto& v : nodeInfo->values) {
                    Log(Log::Info) << "  value type" << v.GetType() << v.GetCommandClassId();
                }
            }
        }
        break; }
    case OpenZWave::Notification::Type_NodeReset:
        break;
    case OpenZWave::Notification::Type_PollingDisabled:
        if (NodeInfo* nodeInfo = data->findNode(notification)) {
            nodeInfo->polled = false;
        }
        break;
    case OpenZWave::Notification::Type_PollingEnabled:
        if (NodeInfo* nodeInfo = data->findNode(notification)) {
            nodeInfo->polled = true;
        }
        break;
    case OpenZWave::Notification::Type_DriverReady:
        data->homeId = notification->GetHomeId();
        data->devicePrefix = "zwave-" + std::to_string(notification->GetHomeId()) + "-";
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
