#include "Homework.h"
#include <log/Log.h>
#include <zwave/PlatformZwave.h>

using namespace reckoning::log;

Homework::Homework(Options&& options)
    : mOptions(std::forward<Options>(options))
{
}

Homework::~Homework()
{
}

void Homework::start()
{
    if (mOptions.value<bool>("zwave-enabled")) {
        //printf("zwave go\n");
        auto zwave = PlatformZwave::create(mOptions);
        if (zwave->isValid()) {
            Log(Log::Info) << "zwave initialized";
            mPlatforms.push_back(std::move(zwave));
        }
    }
}

void Homework::stop()
{
}
