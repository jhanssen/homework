#ifndef DAEMON_H
#define DAEMON_H

#include <HttpServer.h>
#include <WebSocket.h>
#include <rct/Hash.h>
#include <rct/Set.h>
#include <rct/SocketServer.h>
#include <memory>

class Daemon : public std::enable_shared_from_this<Daemon>
{
public:
    typedef std::shared_ptr<Daemon> SharedPtr;
    typedef std::weak_ptr<Daemon> WeakPtr;

    Daemon();
    ~Daemon();

    void init();

private:
    void initializeModules();

private:
    SocketServer mServer;
    HttpServer mHttpServer;
    Hash<WebSocket*, WebSocket::SharedPtr> mWebSockets;
};

#endif
