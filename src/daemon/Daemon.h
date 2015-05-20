#ifndef DAEMON_H
#define DAEMON_H

#include "Modules.h"
#include <HttpServer.h>
#include <WebSocket.h>
#include <rct/Hash.h>
#include <memory>

class Daemon : public std::enable_shared_from_this<Daemon>
{
public:
    typedef std::shared_ptr<Daemon> SharedPtr;
    typedef std::weak_ptr<Daemon> WeakPtr;

    Daemon();
    ~Daemon();

    void init();

    static Daemon::SharedPtr instance();
    static void reset();

private:
    void initializeModules();

private:
    HttpServer mHttpServer;
    Hash<WebSocket*, WebSocket::SharedPtr> mWebSockets;
    Modules mModules;
};

#endif
