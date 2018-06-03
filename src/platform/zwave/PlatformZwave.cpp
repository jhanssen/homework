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
    const auto config = options.value<std::string>("zwave-config");
    if (config.empty()) {
        Log(Log::Error) << "no openzwave config";
        return;
    }

    const int pollInterval = options.value<int>("zwave-pollInterval", 500);

    OpenZWave::Options::Create(config, std::string(), std::string());
    auto zoptions = OpenZWave::Options::Get();
    assert(zoptions != nullptr);
    zoptions->AddOptionInt("PollInterval", pollInterval);
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

void PlatformZwave::onNotification(const OpenZWave::Notification* notification, void* ctx)
{
    PlatformZwaveData* data = static_cast<PlatformZwaveData*>(ctx);
    printf("hello %d\n", notification->GetType());
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
