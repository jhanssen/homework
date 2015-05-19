#ifndef WEBSOCKET_H
#define WEBSOCKET_H

#include "HttpServer.h"
#include <rct/LinkedList.h>
#include <rct/SocketClient.h>
#include <rct/SignalSlot.h>
#include <rct/String.h>
#include <cstdint>
#include <memory>

struct wslay_event_context;
struct wslay_event_on_msg_recv_arg;

class WebSocket
{
public:
    typedef std::shared_ptr<WebSocket> SharedPtr;
    typedef std::weak_ptr<WebSocket> WeakPtr;

    WebSocket(const SocketClient::SharedPtr& client);
    ~WebSocket();

    class Message
    {
    public:
        enum Opcode {
            ContinuationFrame = 0,
            TextFrame         = 1,
            BinaryFrame       = 2,
            ConnectionClose   = 8,
            Ping              = 9,
            Pong              = 10
        };

        Message(Opcode opcode, const String& message = String());

        Opcode opcode() const { return mOpcode; }
        String message() const { return mMessage; }

        // set if opcode is ConnectionClose
        uint16_t statusCode() { return mStatusCode; }

    private:
        Message(Opcode opcode, const String& message, uint16_t statusCode);

        Opcode mOpcode;
        String mMessage;
        uint16_t mStatusCode;

        friend class WebSocket;
    };

    void write(const String& textMessage);
    void write(const Message& message);
    void close();

    Signal<std::function<void(WebSocket*, const Message&)> >& message() { return mMessage; }
    Signal<std::function<void(WebSocket*)> >& error() { return mError; }
    Signal<std::function<void(WebSocket*)> >& disconnected() { return mDisconnected; }

    static bool response(const HttpServer::Request& req, HttpServer::Response& resp);

private:
    static ssize_t wslaySendCallback(wslay_event_context* ctx,
                                     const uint8_t* data, size_t len, int flags,
                                     void* user_data);
    static ssize_t wslayRecvCallback(wslay_event_context* ctx,
                                     uint8_t* data, size_t len, int flags,
                                     void* user_data);
    static void wslayOnMsgRecvCallback(wslay_event_context*,
                                       const wslay_event_on_msg_recv_arg* arg,
                                       void* user_data);

private:
    SocketClient::SharedPtr mClient;
    wslay_event_context* mCtx;
    LinkedList<Buffer> mBuffers;

    Signal<std::function<void(WebSocket*, const Message&)> > mMessage;
    Signal<std::function<void(WebSocket*)> > mError, mDisconnected;
};

inline WebSocket::Message::Message(Opcode opcode, const String& message)
    : mOpcode(opcode), mMessage(message), mStatusCode(0)
{
}

inline WebSocket::Message::Message(Opcode opcode, const String& message, uint16_t statusCode)
    : mOpcode(opcode), mMessage(message), mStatusCode(statusCode)
{
}

inline void WebSocket::close()
{
    if (!mClient)
        return;
    mClient->close();
    mClient.reset();
}

#endif
