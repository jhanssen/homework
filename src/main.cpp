#include <event/Loop.h>
#include <args/Parser.h>
#include "Homework.h"
#include <Options.h>
#include <Device.h>
#include <Platform.h>

using namespace reckoning;

int main(int argc, char** argv)
{
    Options opts("homework", args::Parser::parse(argc, argv));

    std::shared_ptr<event::Loop> loop = event::Loop::create();
    loop->init();

    Homework homework(std::move(opts));
    homework.start();

    const int ret = loop->execute();

    homework.stop();
    return ret;
}
