#ifndef DAEMON_H
#define DAEMON_H

#include <HttpServer.h>
#include <WebSocket.h>
#include <rct/Hash.h>
#include <rct/Set.h>
#include <rct/SocketServer.h>
#include <memory>

class Daemon
{
public:
    Daemon();

private:
    void initializeModules();

private:
    SocketServer mServer;
    HttpServer mHttpServer;
    Hash<WebSocket*, WebSocket::SharedPtr> mWebSockets;
};

#endif
