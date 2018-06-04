#include <event/Loop.h>
#include <args/Parser.h>
#include <log/Log.h>
#include "Homework.h"
#include <Options.h>
#include <Device.h>
#include <Platform.h>

using namespace reckoning;
using namespace reckoning::log;

int main(int argc, char** argv)
{
    Options opts("homework", args::Parser::parse(argc, argv));
    if (opts.has<std::string>("log-level")) {
        const std::string level = opts.value<std::string>("log-level");
        if (level == "debug") {
            Log::initialize(Log::Debug);
        } else if (level == "info") {
            Log::initialize(Log::Info);
        } else if (level == "warn") {
            Log::initialize(Log::Warn);
        } else if (level == "error") {
            Log::initialize(Log::Error);
        } else if (level == "fatal") {
            Log::initialize(Log::Fatal);
        } else {
            Log(Log::Error) << "failed to initialize log level" << level;
            return 255;
        }
    }

    std::shared_ptr<event::Loop> loop = event::Loop::create();
    loop->init();

    Homework homework(std::move(opts));
    homework.start();

    const int ret = loop->execute();

    homework.stop();
    return ret;
}
