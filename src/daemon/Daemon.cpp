#include "Daemon.h"
#include <rct/Log.h>
#include <rct/Rct.h>
#include <cec/CecModule.h>
#include <websocket/WSModule.h>

static Daemon::SharedPtr daemonInstance;

Daemon::Daemon()
{
}

Daemon::~Daemon()
{
    daemonInstance.reset();
}

void Daemon::init()
{
    daemonInstance = shared_from_this();

    initializeModules();
}

Daemon::SharedPtr Daemon::instance()
{
    return daemonInstance;
}

void Daemon::reset()
{
    daemonInstance.reset();
}

void Daemon::initializeModules()
{
    mModules.add<CecModule>();
    mModules.add<WSModule>();

    mModules.initialize();
}
