#ifndef HTTPSERVER_H
#define HTTPSERVER_H

#include <rct/SocketClient.h>
#include <rct/SocketServer.h>
#include <rct/String.h>
#include <rct/List.h>
#include <rct/LinkedList.h>
#include <rct/Buffer.h>
#include <rct/Hash.h>
#include <rct/Map.h>

class HttpServer : private SocketServer
{
    struct Data;

public:
    typedef std::shared_ptr<HttpServer> SharedPtr;
    typedef std::weak_ptr<HttpServer> WeakPtr;

    enum {
        DefaultMaxRequestFields = 100,
        DefaultMaxRequestFieldSize = 8190,
        DefaultMaxBodySize = 15 * 1024 * 1024
    };

    struct Options
    {
        // defaults above
        uint32_t maxRequestFields;
        uint32_t maxRequestFieldSize;
        uint32_t maxBodySize;
    };

    HttpServer();
    HttpServer(const Options& opts);
    ~HttpServer();

    using SocketServer::Mode;
    enum Protocol { Http10, Http11 };

    bool listen(uint16_t port, Protocol proto = Http11, Mode mode = IPv4);

    template<typename T>
    struct LowerLess
    {
        bool operator()(const T& l, const T& r) const
        {
            return l.compare(r, String::CaseInsensitive) < 0;
        }
    };

    class Headers
    {
    public:
        class Header : public List<String>
        {
        public:
            Header() { }
            Header(const String& string) { append(string); }
            Header(const char* string) { append(String(string)); }

            using List<String>::List;

            bool operator==(const String& string) const;
            bool operator!=(const String& string) const;
            Header& operator=(const String& string);

            operator String() const { if (isEmpty()) return String(); return first(); }
        };

        typedef Map<String, Header, LowerLess<String> > StringMap;

        Headers() { }
        Headers(const Headers& headers) : mHeaders(headers.mHeaders) { }
        Headers(const StringMap& headers) : mHeaders(headers) { }

        void add(const String& key, const String& value);
        void set(const String& key, const Header& values);

        bool has(const String& key) const;
        Header header(const String& key) const;

        StringMap headers() const;

    private:
        StringMap mHeaders;
    };

    class Request;

    class Response
    {
    public:
        Response();
        Response(Protocol proto, int status, const Headers& headers = Headers(),
                 const String& body = String());

        enum WriteMode { Incomplete, Complete };

        Headers& headers();

        void setStatus(int status);
        void setHeaders(const Headers& headers);
        void setBody(const String& body);

    private:
        Protocol mProtocol;
        int mStatus;
        Headers mHeaders;
        String mBody;

        friend struct Data;
    };

    class Body
    {
    public:
        bool done() const;
        String read();

        std::shared_ptr<Request> request() const { return mRequest.lock(); }
        Signal<std::function<void(Body*)> >& readyRead() { return mReadyRead; }

    private:
        Body();

        std::weak_ptr<Request> mRequest;
        bool mDone;
        String mBody;
        Signal<std::function<void(Body*)> > mReadyRead;

        friend class Request;
        friend class HttpServer;
    };

    class Request
    {
    public:
        typedef std::shared_ptr<Request> SharedPtr;
        typedef std::weak_ptr<Request> WeakPtr;

        ~Request();

        enum Method { Get, Post };
        Method method() const { return mMethod; }
        String path() const { return mPath; }
        String query() const { return mQuery; }
        Protocol protocol() const { return mProtocol; }

        const Headers& headers() const { return mHeaders; }
        const Body& body() const { return mBody; }
        Body& body() { return mBody; }

        void write(const Response& response, Response::WriteMode mode = Response::Complete);
        void close();

        SocketClient::SharedPtr takeSocket();

    private:
        bool parseStatus(const String& line);
        bool parseMethod(const String& method);
        bool parseHttp(const String& http);
        bool parseHeader(const String& line, uint32_t max);

    private:
        Request(HttpServer* server, uint64_t id, uint64_t seq);

        uint64_t mId, mSeq;
        Protocol mProtocol;
        Method mMethod;
        String mPath, mQuery;
        Headers mHeaders;
        Body mBody;
        HttpServer* mServer;
        uint32_t mParsed;

        friend class HttpServer;
    };

    enum Error { SocketError };
    Signal<std::function<void(Error)> >& error() { return mError; }
    Signal<std::function<void(const Request::SharedPtr&)> >& request() { return mRequest; }

private:
    void init();

    void addClient(const SocketClient::SharedPtr& client);
    void makeRequest(const SocketClient::SharedPtr& client, const String& headers);

    Data* data(uint64_t id);
    void removeData(uint64_t id);

private:
    struct Data
    {
        HttpServer* server;
        uint64_t id;
        uint64_t seq, current;
        bool pendingClose;
        SocketClient::SharedPtr client;

        enum { ReadingStatus, ReadingHeaders, ReadingBody } state;
        enum { ModeNone, ModeLength, ModeChunked } bodyMode;
        int64_t bodyLength;

        unsigned int currentPos;
        LinkedList<Buffer>::iterator currentBuffer;
        LinkedList<Buffer> buffers;
        String bodyData;

        Request::SharedPtr request;
        Map<uint64_t, List<Response> > queue;

        enum State { Success, Pending, Failure };
        State readLine(String& data, uint32_t max);
        State read(String& data, unsigned int len, uint32_t max, unsigned int discard = 0);
        void discardRead();

        void readFrom(const LinkedList<Buffer>::iterator& startBuffer, unsigned int startPos,
                      const LinkedList<Buffer>::iterator& endBuffer, unsigned int endPos,
                      String& data, unsigned int discard = 0);

        void close();
        void write(const Response& response);
        void enqueue(uint64_t seq, const Response& response);
        void writeQueued();
    };
    Protocol mProtocol;
    uint64_t mNextId;
    Hash<uint64_t, Data> mData;
    Signal<std::function<void(const Request::SharedPtr&)> > mRequest;
    Signal<std::function<void(Error)> > mError;
    SocketServer mTcpServer;
    Options mOptions;

    friend class Request;
};

inline HttpServer::Headers::StringMap HttpServer::Headers::headers() const
{
    return mHeaders;
}

inline bool HttpServer::Headers::Header::operator==(const String& string) const
{
    if (size() != 1)
        return false;
    return first() == string;
}

inline bool HttpServer::Headers::Header::operator!=(const String& string) const
{
    if (size() != 1)
        return true;
    return first() != string;
}

inline HttpServer::Headers::Header& HttpServer::Headers::Header::operator=(const String& string)
{
    clear();
    append(string);
    return *this;
}

inline HttpServer::Response::Response()
{
}

inline HttpServer::Response::Response(Protocol proto, int status,
                                      const Headers& headers, const String& body)
    : mProtocol(proto), mStatus(status), mHeaders(headers), mBody(body)
{
}

inline HttpServer::Headers& HttpServer::Response::headers()
{
    return mHeaders;
}

inline void HttpServer::Response::setHeaders(const Headers& headers)
{
    mHeaders = headers;
}

inline void HttpServer::Response::setBody(const String& body)
{
    mBody = body;
}

inline HttpServer::Body::Body()
    : mDone(false)
{
}

inline bool HttpServer::Body::done() const
{
    return mDone;
}

inline String HttpServer::Body::read()
{
    String ret;
    std::swap(ret, mBody);
    return ret;
}

#endif
