#include "Homework.h"
#include "Editline.h"
#include <log/Log.h>
#include <zwave/PlatformZwave.h>
#include <locale.h>
#include <string.h>

using namespace reckoning::log;

Homework::Homework(Options&& options)
    : mOptions(std::forward<Options>(options)), mConsole(this)
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

    if (mOptions.value<bool>("console-enabled")) {
        char* locale = setlocale(LC_ALL, "");
        if (!locale || !strcasestr(locale, "UTF-8") || !strcasestr(locale, "utf-8")) {
            Log(Log::Error) << "console requires an UTF-8 locale";
        } else {
            mConsole.start();
        }
    }

    for (const auto& platform : mPlatforms) {
        if (!platform->start()) {
            Log(Log::Error) << "failed to start platform" << platform->name();
        }
    }
}

void Homework::stop()
{
    mConsole.stop();

    for (const auto& platform : mPlatforms) {
        if (!platform->stop()) {
            Log(Log::Error) << "failed to stop platform" << platform->name();
        }
    }
    mPlatforms.clear();
}
