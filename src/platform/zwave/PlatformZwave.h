#ifndef PLATFORM_ZWAVE
#define PLATFORM_ZWAVE

#include <Platform.h>
#include <util/Creatable.h>
#include <ozw/Notification.h>

using reckoning::util::Creatable;

class PlatformZwave : public Platform, public Creatable<PlatformZwave>
{
public:
    ~PlatformZwave();

protected:
    PlatformZwave(const Options& options);

private:
    static void onNotification(const OpenZWave::Notification* notification, void* ctx);

private:
    std::string mPort;
};

#endif // PLATFORM_ZWAVE
