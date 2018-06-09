#ifndef PLATFORM_ZWAVE
#define PLATFORM_ZWAVE

#include <Platform.h>
#include <util/Creatable.h>
#include <ozw/Notification.h>

using reckoning::util::Creatable;

struct PlatformZwaveData;
struct NodeInfo;

class PlatformZwave : public Platform, public Creatable<PlatformZwave>
{
public:
    ~PlatformZwave();

    bool start();
    bool stop();

protected:
    PlatformZwave(const Options& options);

private:
    static void onNotification(const OpenZWave::Notification* notification, void* ctx);

    void makeDevice(NodeInfo* nodeInfo, const std::string& uniqueId);

private:
    int mPollInterval;
    std::string mPort, mConfig;
    PlatformZwaveData* mData;
};

#endif // PLATFORM_ZWAVE
