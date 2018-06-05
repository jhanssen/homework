#include <Device.h>
#include <Platform.h>

uint8_t Device::features() const
{
    if (auto platform = mPlatform.lock())
        return platform->deviceFeatures(this);
    return 0;
}

bool Device::setName(const std::string& name)
{
    if (auto platform = mPlatform.lock())
        return platform->setDeviceName(this, name);
    return false;
}
