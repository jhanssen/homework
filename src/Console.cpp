#include "Console.h"
#include <Homedir.h>
#include <stddef.h>
#include <event/Loop.h>
#include <histedit.h>
#include <log/Log.h>
#include <util/Socket.h>
#include <errno.h>
#include <stdlib.h>
#include <fcntl.h>
#include <cassert>

using namespace reckoning;
using namespace reckoning::event;
using namespace reckoning::log;

Console::Console(std::vector<std::string>&& prefixes)
    : mPrefixes(std::forward<std::vector<std::string> >(prefixes))
{
}

Console::~Console()
{
}

void Console::wakeup()
{
}
