#ifndef DAEMON_H
#define DAEMON_H

#include "State.h"
#include <HttpServer.h>
#include <WebSocket.h>
#include <rct/Hash.h>
#include <rct/List.h>
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

    State::SharedPtr state() const;
    void pushState(const State::SharedPtr& state);
    void popState();

    static Daemon::SharedPtr instance();

private:
    void initializeModules();
    void initializeState();

private:
    SocketServer mServer;
    HttpServer mHttpServer;
    Hash<WebSocket*, WebSocket::SharedPtr> mWebSockets;
    List<State::SharedPtr> mStates;
};

State::SharedPtr Daemon::state() const
{
    assert(!mStates.isEmpty());
    return mStates.last();
}

void Daemon::pushState(const State::SharedPtr& state)
{
    mStates.append(state);
}

void Daemon::popState()
{
    assert(!mStates.isEmpty());
    mStates.removeLast();
}

#endif
