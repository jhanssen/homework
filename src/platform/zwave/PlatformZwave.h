#ifndef PLATFORM_ZWAVE
#define PLATFORM_ZWAVE

#include <Platform.h>
#include <ozw/Manager.h>

class PlatformZwave : public Platform
{
public:
    PlatformZwave(const Options& options);
    ~PlatformZwave();

private:
};

#endif // PLATFORM_ZWAVE
