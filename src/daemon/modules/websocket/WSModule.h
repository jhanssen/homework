#ifndef WSMODULE_H
#define WSMODULE_H

#include "HttpServer.h"
#include "WebSocket.h"
#include <Module.h>
#include <memory>

class WSModule : public Module
{
public:
    WSModule();
    ~WSModule();

    virtual void initialize();

private:
    HttpServer mHttpServer;
    Hash<WebSocket*, WebSocket::SharedPtr> mWebSockets;
};

#endif
