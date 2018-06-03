#ifndef PLATFORM_ZWAVE
#define PLATFORM_ZWAVE

#include <Platform.h>
#include <ozw/Notification.h>

class PlatformZwave : public Platform
{
public:
    PlatformZwave(const Options& options);
    ~PlatformZwave();

private:
    static void onNotification(const OpenZWave::Notification* notification, void* ctx);

private:
    std::string mPort;
};

#endif // PLATFORM_ZWAVE
