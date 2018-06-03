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

PlatformZwave::PlatformZwave(const Options& options)
    : Platform(options)
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
    zoptions->Lock();

    OpenZWave::Manager::Create();
    auto zmanager = OpenZWave::Manager::Get();
    assert(zmanager != nullptr);
    zmanager->AddWatcher(onNotification, this);
    zmanager->AddDriver(mPort);

    setValid(true);
}

PlatformZwave::~PlatformZwave()
{
    if (!isValid())
        return;
    assert(!mPort.empty());
    auto zmanager = OpenZWave::Manager::Get();
    assert(zmanager != nullptr);
    zmanager->RemoveWatcher(onNotification, this);
    OpenZWave::Manager::Destroy();
    OpenZWave::Options::Destroy();
}

void PlatformZwave::onNotification(const OpenZWave::Notification* notification, void* ctx)
{
}
