#include <event/Loop.h>
#include <args/Parser.h>
#include "Options.h"
#include "device/Device.h"

using namespace reckoning;

int main(int argc, char** argv)
{
    Options opts("homework", args::Parser::parse(argc, argv));
    if (opts.has<int>("foo-bar")) {
        printf("foo-bar %d\n", opts.value<int>("foo-bar", 999));
    }
    return 0;
}
