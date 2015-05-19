#include "HttpServer.h"
#include <rct/Log.h>
#include <string.h>
#include <stdio.h>

HttpServer::HttpServer()
    : mProtocol(Http10), mNextId(0), mOptions({ DefaultMaxRequestFields, DefaultMaxRequestFieldSize, DefaultMaxBodySize })
{
    init();
}

HttpServer::HttpServer(const Options& options)
    : mProtocol(Http10), mNextId(0), mOptions(options)
{
    init();
}

HttpServer::~HttpServer()
{
}

void HttpServer::init()
{
    mTcpServer.newConnection().connect([this](SocketServer* server) {
            SocketClient::SharedPtr client;
            for (;;) {
                client = server->nextConnection();
                if (!client)
                    return;
                addClient(client);
            }
        });
}

bool HttpServer::listen(uint16_t port, Protocol proto, Mode mode)
{
    mProtocol = proto;
    return mTcpServer.listen(port, mode);
}

void HttpServer::Data::readFrom(const LinkedList<Buffer>::iterator& startBuffer, unsigned int startPos,
                                const LinkedList<Buffer>::iterator& endBuffer, unsigned int endPos,
                                String& data, unsigned int discard)
{
    LinkedList<Buffer>::const_iterator end = endBuffer;
    ++end;
    for (LinkedList<Buffer>::iterator it = startBuffer; it != end; ++it) {
        unsigned int sz, pos;
        if (it == startBuffer) {
            if (it == endBuffer) {
                sz = endPos - startPos - discard;
            } else {
                sz = it->size() - endPos;
            }
            pos = startPos;
        } else if (it == endBuffer) {
            sz = endPos - discard;
            pos = 0;
        } else {
            sz = it->size();
            pos = 0;
        }
        data.resize(data.size() + sz);
        char* buf = data.data() + data.size() - sz;
        //::error() << "memcpy" << static_cast<void*>(buf) << it->data() + pos << sz;
        memcpy(buf, it->data() + pos, sz);
    }
}

HttpServer::Data::State HttpServer::Data::read(String& data, unsigned int len, uint32_t max, unsigned int discard)
{
    data.clear();
    if (currentBuffer == buffers.end())
        return Pending;
    const auto startBuffer = currentBuffer;
    const unsigned int startPos = currentPos;
    unsigned int total = 0, rem = len + discard;
    assert(currentBuffer->size() >= currentPos);
    uint32_t bytesAvailable = currentBuffer->size() - currentPos;
    do {
        Buffer& buf = *currentBuffer;
        assert(startPos < buf.size());
        if (total + buf.size() >= len + discard) {
            // we're done
            currentPos += rem;
            const auto endBuffer = currentBuffer;
            const unsigned int endPos = currentPos;
            if (currentPos == buf.size()) {
                currentPos = 0;
                ++currentBuffer;
            }
            readFrom(startBuffer, startPos, endBuffer, endPos, data, discard);
            return Success;
        }
        total += buf.size();
        rem -= buf.size();
        ++currentBuffer;
        if (currentBuffer != buffers.end()) {
            bytesAvailable += currentBuffer->size();
        }
        currentPos = 0;
    } while (currentBuffer != buffers.end());
    currentBuffer = startBuffer;
    currentPos = startPos;
    return bytesAvailable < max ? Pending : Failure;
}

HttpServer::Data::State HttpServer::Data::readLine(String& data, uint32_t max)
{
    // find \r\n, the \r might be at the end of a buffer and the \n at the beginning of the next
    data.clear();
    if (currentBuffer == buffers.end())
        return Pending;
    bool lastr = false;
    const auto startBuffer = currentBuffer;
    const unsigned int startPos = currentPos;
    assert(currentBuffer->size() >= currentPos);
    unsigned int bytesAvailable = currentBuffer->size() - currentPos;
    for (;;) {
        Buffer& buf = *currentBuffer;
        //::error() << "balle" << startPos << buf.size();
        assert(startPos < buf.size());
        if (lastr) {
            assert(currentPos == 0);
            if (buf.data()[0] == '\n') {
                ++currentPos;
                const auto endBuffer = currentBuffer;
                const unsigned int endPos = currentPos;
                if (currentPos == buf.size()) {
                    currentPos = 0;
                    ++currentBuffer;
                }
                readFrom(startBuffer, startPos, endBuffer, endPos, data);
                return Success;
            }
        }
        for (; currentPos < buf.size() - 1; ++currentPos) {
            if (buf.data()[currentPos] == '\r' && buf.data()[currentPos + 1] == '\n') {
                currentPos += 2;
                const auto endBuffer = currentBuffer;
                const unsigned int endPos = currentPos;
                if (currentPos == buf.size()) {
                    currentPos = 0;
                    ++currentBuffer;
                }
                //::error() << "reading from" << &*startBuffer << startPos << &*endBuffer << endPos;
                readFrom(startBuffer, startPos, endBuffer, endPos, data);
                return Success;
            }
        }
        if (buf.data()[buf.size() - 1] == '\r')
            lastr = true;
        ++currentBuffer;
        currentPos = 0;
        if (currentBuffer != buffers.end()) {
            bytesAvailable += currentBuffer->size();
        } else {
            // no luck, reset current to start and try again next time
            currentBuffer = startBuffer;
            currentPos = startPos;
            return bytesAvailable < max ? Pending : Failure;
        }
    }
    assert(false);
    return Pending;
}

void HttpServer::Data::discardRead()
{
    for (auto it = buffers.begin(); it != currentBuffer;) {
        buffers.erase(it++);
    }
    if (currentBuffer == buffers.end() || currentPos == 0)
        return;

    // we need to shrink & memmove the front buffer at this point
    assert(currentBuffer == buffers.begin());
    Buffer& buf = *currentBuffer;
    assert(currentPos < buf.size() - 1);
    memmove(buf.data(), buf.data() + currentPos, buf.size() - currentPos);
    buf.resize(buf.size() - currentPos);
    currentPos = 0;
}

template<typename T, typename U>
static inline T toNumber(const String& str, bool* ok, int base, bool strict,
                  const std::function<U(const char *, char **, int base)>& convert)
{
    char* end = 0;
    const T ret = convert(str.constData(), &end, base);
    if (ok) {
        *ok = (end != 0) && (end != str.constData());
        if (*ok && strict)
            *ok = !*end;
    }
    return ret;
}

template<typename T>
static inline T toInteger(const String& str, bool* ok = 0, int base = 10, bool strict = false)
{
    return toNumber<T, long>(str, ok, base, strict, strtol);
}

template<>
inline uint32_t toInteger<uint32_t>(const String& str, bool* ok, int base, bool strict)
{
    return toNumber<uint32_t, unsigned long>(str, ok, base, strict, strtoul);
}

template<>
inline int64_t toInteger<int64_t>(const String& str, bool* ok, int base, bool strict)
{
    return toNumber<int64_t, long long>(str, ok, base, strict, strtoll);
}

template<>
inline uint64_t toInteger<uint64_t>(const String& str, bool* ok, int base, bool strict)
{
    return toNumber<uint64_t, unsigned long long>(str, ok, base, strict, strtoull);
}

void HttpServer::addClient(const SocketClient::SharedPtr& client)
{
    const uint64_t id = ++mNextId;
    mData[id] = { this, id, 0, 0, false, client, Data::ReadingStatus, Data::ModeNone, -1, 0 };
    Data& data = mData[id];
    data.currentBuffer = data.buffers.begin();

    client->readyRead().connect([this, &data, id](const SocketClient::SharedPtr& c, Buffer&& buf) {
            if (!buf.isEmpty()) {
                data.buffers.push_back(std::move(buf));
                if (data.currentBuffer == data.buffers.end()) {
                    // set currentBuffer to be the buffer we just added
                    --data.currentBuffer;
                    data.currentPos = 0;
                }
                String line;
                while (data.state == Data::ReadingStatus || data.state == Data::ReadingHeaders) {
                    const HttpServer::Data::State state = data.readLine(line, mOptions.maxRequestFieldSize);
                    if (state != HttpServer::Data::Success) {
                        if (state == HttpServer::Data::Failure) {
                            // drop the client on the floor
                            data.client->close();
                            data.client.reset();
                            mData.erase(id);
                        }
                        return;
                    }
                    if (data.state == Data::ReadingStatus) {
                        data.request.reset(new Request(this, data.id, data.seq++));
                        data.request->mBody.mRequest = data.request;
                        if (!data.request->parseStatus(line)) {
                            data.client->close();
                            data.client.reset();
                            mData.erase(id);
                            return;
                        }
                        data.state = Data::ReadingHeaders;
                    } else {
                        assert(data.state == Data::ReadingHeaders);
                        if (line.size() == 2) {
                            // we're done
                            assert(line[0] == '\r' && line[1] == '\n');
                            data.state = Data::ReadingBody;

                            if (data.request->method() == Request::Post) {
                                const Headers& headers = data.request->headers();
                                String v = headers.header("Content-Length");
                                if (!v.isEmpty()) {
                                    bool ok;
                                    data.bodyLength = toInteger<int64_t>(v, &ok);
                                    if (ok && data.bodyLength >= 0) {
                                        data.bodyMode = Data::ModeLength;
                                        if (!data.bodyLength) {
                                            data.request->mBody.mDone = true;
                                            data.request->mBody.mReadyRead(&data.request->mBody);
                                            data.request.reset();
                                            data.state = Data::ReadingStatus;
                                        }
                                    } else {
                                        // badness
                                        data.client->close();
                                        data.client.reset();
                                        mData.erase(id);
                                        return;
                                    }
                                } else {
                                    v = headers.header("Transfer-Encoding");
                                    if (v == "chunked") {
                                        data.bodyMode = Data::ModeChunked;
                                    }
                                }
                                if (data.bodyMode == Data::ModeNone) {
                                    data.state = Data::ReadingStatus;
                                }
                            } else {
                                data.state = Data::ReadingStatus;
                            }

                            mRequest(data.request);
                            if (!mData.contains(id))
                                return;
                            if (data.state != Data::ReadingBody) {
                                data.request.reset();
                            }
                            data.discardRead();
                        } else {
                            if (!data.request->parseHeader(line, mOptions.maxRequestFields)) {
                                data.client->close();
                                data.client.reset();
                                mData.erase(id);
                                return;
                            }
                        }
                    }
                }
                if (data.state == Data::ReadingBody) {
                    if (data.bodyMode == Data::ModeLength) {
                        assert(data.bodyLength > 0);
                        String body;
                        const HttpServer::Data::State state = data.read(body, data.bodyLength, mOptions.maxBodySize);
                        if (state == HttpServer::Data::Success) {
                            data.request->mBody.mBody += body;
                            data.request->mBody.mDone = true;
                            data.request->mBody.mReadyRead(&data.request->mBody);
                            data.request.reset();
                            data.state = Data::ReadingStatus;
                            data.discardRead();
                        } else if (state == HttpServer::Data::Failure) {
                            // badness
                            data.client->close();
                            data.client.reset();
                            mData.erase(id);
                            return;
                        }
                    } else if (data.bodyMode == Data::ModeChunked) {
                        String body;
                        for (;;) {
                            if (data.bodyLength == -1) { // read the chunk size;
                                const HttpServer::Data::State state = data.readLine(body, 50);
                                if (state != HttpServer::Data::Success) {
                                    if (state == HttpServer::Data::Failure) {
                                        data.client->close();
                                        data.client.reset();
                                        mData.erase(id);
                                    }
                                    return;
                                }
                                // we ignore extensions for the time being
                                bool ok;
                                const uint32_t len = toInteger<uint32_t>(body, &ok, 16);
                                if (!ok) {
                                    // badness
                                    data.client->close();
                                    data.client.reset();
                                    mData.erase(id);
                                    return;
                                }
                                data.bodyLength = len;
                                //::error() << "chunk size" << data.bodyLength;
                            }
                            // can we read it all right now?
                            const HttpServer::Data::State state = data.read(body, data.bodyLength, mOptions.maxBodySize, 2);
                            if (state == HttpServer::Data::Success) { // + 2 for the trailing \r\n
                                // yes, we're done with this chunk
                                data.request->mBody.mBody += body;
                                if (data.bodyLength == 0) {
                                    // we're done with all chunks!
                                    data.request->mBody.mDone = true;
                                    data.request->mBody.mReadyRead(&data.request->mBody);
                                    data.request.reset();
                                    data.state = Data::ReadingStatus;
                                    data.discardRead();
                                    return;
                                }
                                if (data.request->mBody.mBody.size() >= mOptions.maxBodySize) {
                                    data.client->close();
                                    data.client.reset();
                                    mData.erase(id);
                                    return;
                                }
                                data.request->mBody.mReadyRead(&data.request->mBody);
                                data.bodyLength = -1;
                            } else if (state == HttpServer::Data::Failure) {
                                // exceeded max body size
                                data.client->close();
                                data.client.reset();
                                mData.erase(id);
                                return;
                            } else {
                                // not done with chunk, bail out
                                return;
                            }
                        }
                    }
                }
            }
        });
    client->disconnected().connect([this, id](const SocketClient::SharedPtr& client) {
            mData.erase(id);
        });
}

HttpServer::Data* HttpServer::data(uint64_t id)
{
    auto it = mData.find(id);
    if (it == mData.end())
        return 0;
    return &it->second;
}

void HttpServer::removeData(uint64_t id)
{
    auto it = mData.find(id);
    if (it == mData.end())
        return;
    mData.erase(it);
}

void HttpServer::Headers::add(const String& key, const String& value)
{
    mHeaders[key].push_back(value);
}

void HttpServer::Headers::set(const String& key, const Header& values)
{
    mHeaders[key] = values;
}

bool HttpServer::Headers::has(const String& key) const
{
    return mHeaders.contains(key);
}

HttpServer::Headers::Header HttpServer::Headers::header(const String& key) const
{
    const auto it = mHeaders.find(key);
    if (it == mHeaders.end())
        return List<String>();
    return it->second;
}

HttpServer::Request::Request(HttpServer* server, uint64_t id, uint64_t seq)
    : mId(id), mSeq(seq), mProtocol(Http10), mMethod(Get), mServer(server), mParsed(0)
{
}

HttpServer::Request::~Request()
{
    // ::error() << "~Request";
}

bool HttpServer::Request::parseMethod(const String& method)
{
    bool ret = false;
    if (method == "GET") {
        mMethod = Get;
        ret = true;
    } else if (method == "POST") {
        mMethod = Post;
        ret = true;
    }
    return ret;
}

bool HttpServer::Request::parseHttp(const String& http)
{
    unsigned int major, minor;
#warning is this safe?
    if (sscanf(http.constData(), "HTTP/%u.%u", &major, &minor) != 2) {
        return false;
    }
    if (major != 1)
        return false;
    switch (minor) {
    case 0:
        mProtocol = Http10;
        return true;
    case 1:
        mProtocol = Http11;
        return true;
    default:
        break;
    }
    return false;
}

bool HttpServer::Request::parseStatus(const String& line)
{
    int prev = 0;
    enum { ParseMethod, ParsePath, ParseHttp } parsing = ParseMethod;
    const char* find[] = { " ", " ", "\r\n" };
    for (;;) {
        int sp = line.indexOf(find[parsing], prev);
        if (sp == -1) {
            return false;
        }
        const String part = line.mid(prev, sp - prev);
        switch (parsing) {
        case ParseMethod:
            if (!parseMethod(part))
                return false;
            parsing = ParsePath;
            break;
        case ParsePath: {
            const int q = part.indexOf('?');
            if (q == -1) {
                mPath = part;
            } else {
                mPath = part.left(q);
                mQuery = part.mid(q);
            }
            parsing = ParseHttp;
            break; }
        case ParseHttp:
            if (!parseHttp(part))
                return false;
            return true;
        }
        prev = sp + 1;
    }
    return false;
}

bool HttpServer::Request::parseHeader(const String& line, uint32_t max)
{
    if (++mParsed > max)
        return false;
    const int eq = line.indexOf(':');
    if (eq < 1)
        return false;
    const String key = line.left(eq);
    const String val = line.mid(eq + 1).trimmed();
    mHeaders.add(key, val);
    return true;
}

static inline const char* statusText(int code)
{
    switch (code) {
    case 100: return "Continue";
    case 101: return "Switching Protocols";
    case 200: return "OK";
    case 201: return "Created";
    case 202: return "Accepted";
    case 203: return "Non-Authoritative Information";
    case 204: return "No Content";
    case 205: return "Reset Content";
    case 206: return "Partial Content";
    case 300: return "Multiple Choices";
    case 301: return "Moved Permanently";
    case 302: return "Found";
    case 303: return "See Other";
    case 304: return "Not Modified";
    case 305: return "Use Proxy";
    case 307: return "Temporary Redirect";
    case 400: return "Bad Request";
    case 401: return "Unauthorized";
    case 402: return "Payment Required";
    case 403: return "Forbidden";
    case 404: return "Not Found";
    case 405: return "Method Not Allowed";
    case 406: return "Not Acceptable";
    case 407: return "Proxy Authentication Required";
    case 408: return "Request Timeout";
    case 409: return "Conflict";
    case 410: return "Gone";
    case 411: return "Length Required";
    case 412: return "Precondition Failed";
    case 413: return "Request Entity Too Large";
    case 414: return "Request-URI Too Long";
    case 415: return "Unsupported Media Type";
    case 416: return "Requested Range Not Satisfiable";
    case 417: return "Expectation Failed";
    case 500: return "Internal Server Error";
    case 501: return "Not Implemented";
    case 502: return "Bad Gateway";
    case 503: return "Service Unavailable";
    case 504: return "Gateway Timeout";
    case 505: return "HTTP Version Not Supported";
    default: break;
    }
    return "";
}

void HttpServer::Request::close()
{
    Data* data = mServer->data(mId);
    if (!data)
        return;
    if (mSeq == data->current) {
        // close right now
        data->close();
    } else {
        data->pendingClose = true;
    }
}

void HttpServer::Request::write(const Response& response, Response::WriteMode mode)
{
    Data* data = mServer->data(mId);
    if (!data)
        return;
    if (mSeq == data->current) {
        // write right now
        data->write(response);
        if (mode == Response::Complete) {
            ++data->current;
            data->writeQueued();
        }
    } else {
        data->enqueue(mSeq, response);
    }
}

SocketClient::SharedPtr HttpServer::Request::takeSocket()
{
    Data* data = mServer->data(mId);
    if (!data)
        return SocketClient::SharedPtr();
    // can't take the socket if we have pending pipelined responses
    assert(data->queue.isEmpty());

    SocketClient::SharedPtr client = data->client;
    client->readyRead().disconnect();
    client->disconnected().disconnect();
    mServer->removeData(mId);
    return client;
}

void HttpServer::Data::close()
{
    client->close();
    client.reset();
    server->removeData(id);
}

void HttpServer::Data::write(const Response& response)
{
    static int ver[2][2] = { { 1, 0 }, { 1, 1 } };

    String resp = String::format<64>("HTTP/%d.%d %d %s\r\n",
                                     ver[response.mProtocol][0],
                                     ver[response.mProtocol][1],
                                     response.mStatus,
                                     statusText(response.mStatus));
    for (const auto& it : response.mHeaders.headers()) {
        resp += it.first + ": ";
        const auto& values = it.second;
        const size_t vsize = values.size();
        for (size_t i = 0; i < vsize; ++i) {
            resp += values[i];
            if (i + 1 < vsize)
                resp += ',';
            resp += "\r\n";
        }
    }
    resp += "\r\n" + response.mBody;

    //::error() << resp;
    client->write(resp);
}

void HttpServer::Data::writeQueued()
{
    for (;;) {
        auto it = queue.find(current);
        if (it == queue.end()) {
            if (pendingClose) {
                close();
            }
            return;
        }
        for (const Response& response : it->second) {
            write(response);
        }
        ++current;
        queue.erase(it);
    }
}

void HttpServer::Data::enqueue(uint64_t seq, const Response& response)
{
    queue[seq].push_back(response);
}
