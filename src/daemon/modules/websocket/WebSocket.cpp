#include "WebSocket.h"
#include <wslay/wslay.h>
#ifdef OS_Darwin
#include <CommonCrypto/CommonDigest.h>
#include <Security/Security.h>
#define SHA1_Update       CC_SHA1_Update
#define SHA1_Init         CC_SHA1_Init
#define SHA1_Final        CC_SHA1_Final
#define SHA_CTX           CC_SHA1_CTX
#define SHA_DIGEST_LENGTH CC_SHA1_DIGEST_LENGTH
#else
#include <openssl/sha.h>
#include <openssl/bio.h>
#include <openssl/evp.h>
#endif

static inline String base64(const String& input)
{
#ifdef OS_Darwin
    String result;
    SecTransformRef transform = SecEncodeTransformCreate(kSecBase64Encoding, 0);
    CFDataRef sourceData = CFDataCreate(kCFAllocatorDefault,
                                        reinterpret_cast<const UInt8*>(input.constData()),
                                        input.size());
    SecTransformSetAttribute(transform, kSecTransformInputAttributeName, sourceData, 0);
    CFDataRef encodedData = static_cast<CFDataRef>(SecTransformExecute(transform, 0));
    const long len = CFDataGetLength(encodedData);
    if (len > 0) {
        result.resize(len);
        CFDataGetBytes(encodedData, CFRangeMake(0, len), reinterpret_cast<UInt8*>(result.data()));
    }
    CFRelease(encodedData);
    CFRelease(transform);
    CFRelease(sourceData);
#else
    BIO *base64_filter = BIO_new(BIO_f_base64());
    BIO_set_flags(base64_filter, BIO_FLAGS_BASE64_NO_NL);

    BIO *bio = BIO_new(BIO_s_mem());
    BIO_set_flags(bio, BIO_FLAGS_BASE64_NO_NL);

    bio = BIO_push(base64_filter, bio);

    BIO_write(bio, input.constData(), input.size());

    BIO_flush(bio);

    char *new_data;

    const long bytes_written = BIO_get_mem_data(bio, &new_data);

    String result(new_data, bytes_written);
    BIO_free_all(bio);
#endif

    return result;
}

static inline String sha1(const String& input)
{
    unsigned char digest[SHA_DIGEST_LENGTH];

    SHA_CTX ctx;
    SHA1_Init(&ctx);
    SHA1_Update(&ctx, input.constData(), input.size());
    SHA1_Final(digest, &ctx);

    return String(reinterpret_cast<char*>(&digest[0]), SHA_DIGEST_LENGTH);
}

WebSocket::WebSocket(const SocketClient::SharedPtr& client)
    : mClient(client)
{
    wslay_event_callbacks callbacks = {
        wslayRecvCallback,
        wslaySendCallback,
        0, // genmask_callback
        0, // on_frame_recv_start_callback
        0, // on_frame_recv_callback
        0, // on_frame_recv_end_callback
        wslayOnMsgRecvCallback
    };
    wslay_event_context_server_init(&mCtx, &callbacks, this);

    client->readyRead().connect([this](const SocketClient::SharedPtr& client, Buffer&& buf) {
            if (buf.isEmpty())
                return;
            mBuffers.push_back(std::move(buf));
            if (wslay_event_recv(mCtx) < 0) {
                // close socket
                client->close();
                mClient.reset();
                mError(this);
            }
        });
    client->disconnected().connect([this](const SocketClient::SharedPtr& client) {
            mClient.reset();
            mDisconnected(this);
        });
}

WebSocket::~WebSocket()
{
}

ssize_t WebSocket::wslaySendCallback(wslay_event_context* ctx,
                                     const uint8_t* data, size_t len, int /*flags*/,
                                     void* user_data)
{
    WebSocket* socket = static_cast<WebSocket*>(user_data);
    if (!socket->mClient) {
        wslay_event_set_error(ctx, WSLAY_ERR_CALLBACK_FAILURE);
        return -1;
    }
    if (!socket->mClient->write(data, len)) {
        wslay_event_set_error(ctx, WSLAY_ERR_CALLBACK_FAILURE);
        return -1;
    }
    return len;
}

ssize_t WebSocket::wslayRecvCallback(wslay_event_context* ctx,
                                     uint8_t* data, size_t len, int /*flags*/,
                                     void* user_data)
{
    // return up to len bytes
    WebSocket* socket = static_cast<WebSocket*>(user_data);
    if (!socket->mClient) {
        wslay_event_set_error(ctx, WSLAY_ERR_CALLBACK_FAILURE);
        return -1;
    }
    if (socket->mBuffers.isEmpty()) {
        wslay_event_set_error(ctx, WSLAY_ERR_WOULDBLOCK);
        return -1;
    }

    size_t rem = len;
    uint8_t* ptr = data;
    auto it = socket->mBuffers.begin();
    while (rem > 0 && it != socket->mBuffers.end()) {
        Buffer& buf = *it;
        if (rem >= buf.size()) {
            memcpy(ptr, buf.data(), buf.size());
            ptr += buf.size();
            rem -= buf.size();
        } else {
            // read and move
            memcpy(ptr, buf.data(), rem);

            memmove(buf.data(), buf.data() + rem, buf.size() - rem);
            buf.resize(buf.size() - rem);
            return len;
        }
        socket->mBuffers.erase(it++);
    }
    return ptr - data;
}

void WebSocket::wslayOnMsgRecvCallback(wslay_event_context*,
                                       const wslay_event_on_msg_recv_arg* arg,
                                       void* user_data)
{
    const Message msg(static_cast<Message::Opcode>(arg->opcode),
                      String(reinterpret_cast<const char*>(arg->msg), arg->msg_length),
                      arg->status_code);
    WebSocket* socket = static_cast<WebSocket*>(user_data);
    socket->mMessage(socket, msg);
}

void WebSocket::write(const Message& msg)
{
    const String& data = msg.message();
    wslay_event_msg wmsg = {
        static_cast<uint8_t>(msg.opcode()),
        reinterpret_cast<const uint8_t*>(data.constData()),
        static_cast<size_t>(data.size())
    };
    wslay_event_queue_msg(mCtx, &wmsg);
    wslay_event_send(mCtx);
}

void WebSocket::write(const String& textMessage)
{
    write(Message(Message::TextFrame, textMessage));
}

static inline String makeKey(const String& key)
{
    return base64(sha1(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"));
}

bool WebSocket::response(const HttpServer::Request& req, HttpServer::Response& resp)
{
    const HttpServer::Headers& headers = req.headers();
    if (headers.header("Connection") != "Upgrade"
        || headers.header("Upgrade") != "websocket"
        || !headers.has("Sec-WebSocket-Key"))
        return false;

    const String key = headers.header("Sec-WebSocket-Key");

    resp = HttpServer::Response(req.protocol(), 101);
    resp.headers() = HttpServer::Headers::StringMap {
        { "Upgrade", "websocket" },
        { "Connection", "Upgrade" },
        { "Sec-WebSocket-Accept", makeKey(key) }
    };
    return true;
}
