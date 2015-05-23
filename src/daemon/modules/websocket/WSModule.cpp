#include "WSModule.h"
#include <Controller.h>
#include <Daemon.h>
#include <rct/Log.h>

static inline const char* guessMime(const Path& file)
{
    const char* ext = file.extension();
    if (!ext)
        return "text/plain";
    if (!strcmp(ext, "html"))
        return "text/html";
    if (!strcmp(ext, "txt"))
        return "text/plain";
    if (!strcmp(ext, "js"))
        return "text/javascript";
    if (!strcmp(ext, "css"))
        return "text/css";
    if (!strcmp(ext, "jpg"))
        return "image/jpg";
    if (!strcmp(ext, "png"))
        return "image/png";
    return "text/plain";
}

WSModule::WSModule()
    : Module("websocket")
{
}

WSModule::~WSModule()
{
}

static inline Value handleMessage(const Value& msg)
{
    Value ret;
    const String get = msg.value<String>("get");
    const String set = msg.value<String>("set");
    const int id = msg.value<int>("id", -1);
    if (!get.isEmpty()) {
        printf("get %s\n", get.constData());

        ret["id"] = id;

        if (get == "controllers") {
            Value list;

            const auto& ctrls = Modules::instance()->controllers();
            auto ctrl = ctrls.cbegin();
            const auto end = ctrls.cend();
            while (ctrl != end) {
                list.push_back((*ctrl)->name());
                ++ctrl;
            }

            Value cand;
            cand["candidates"] = list;
            Value comp;
            comp["completions"] = cand;
            ret["data"] = comp;
        } else if (get == "controller") {
            const String name = msg.value<String>("controller");
            error() << "finding controller" << name;
            if (auto ctrl = Modules::instance()->controller(name)) {
                error() << "found controller" << name;
                ret["data"] = ctrl->describe();
            }
        }
    } else if (!set.isEmpty()) {
        if (set == "controller") {
            const String name = msg.value<String>("name");

            if (auto ctrl = Modules::instance()->controller(name))
                ctrl->set(msg);
        }
    }
    return ret;
}

void WSModule::initialize()
{
    auto addSensor = [this](const Sensor::SharedPtr& sensor) {
        sensor->stateChanged().connect([this](const Sensor::SharedPtr& sensor, const Value& value) {
                // send message to all connected websockets
                Value v;
                v["type"] = "sensor";
                v["name"] = sensor->name();
                v["data"] = value;
                const String msg = v.toJSON();

                auto it = mWebSockets.cbegin();
                const auto end = mWebSockets.cend();
                while (it != end) {
                    const auto& socket = it->second;
                    socket->write(msg);
                    ++it;
                }
            });
    };

    Modules* modules = Modules::instance();
    modules->controllerAdded().connect([this, addSensor](const Controller::SharedPtr& ptr) {
            addSensor(ptr);
        });
    modules->sensorAdded().connect([this, addSensor](const Sensor::SharedPtr& ptr) {
            addSensor(ptr);
        });
    {
        const auto& ctrls = modules->controllers();
        auto it = ctrls.cbegin();
        const auto end = ctrls.cend();
        while (it != end) {
            addSensor(*it);
            ++it;
        }
    }
    {
        const auto& sensors = modules->sensors();
        auto it = sensors.cbegin();
        const auto end = sensors.cend();
        while (it != end) {
            addSensor(*it);
            ++it;
        }
    }

    mHttpServer.listen(8087);
    mHttpServer.request().connect([this](const HttpServer::Request::SharedPtr& req) {
            error() << "got request" << req->protocol() << req->method() << req->path();
            if (req->method() == HttpServer::Request::Get) {
                if (req->headers().has("Upgrade")) {
                    error() << "upgrade?";
                    HttpServer::Response response;
                    if (WebSocket::response(*req, response)) {
                        req->write(response);
                        WebSocket::SharedPtr websocket = std::make_shared<WebSocket>(req->takeSocket());
                        mWebSockets[websocket.get()] = websocket;

                        websocket->message().connect([this](WebSocket* websocket, const WebSocket::Message& msg) {
                                const Value data = Value::fromJSON(msg.message());
                                if (data.isInvalid()) {
                                    // invalid message
                                    return;
                                }
                                const Value ret = handleMessage(data);
                                websocket->write(ret.toJSON());
                            });
                        websocket->error().connect([this](WebSocket* websocket) {
                                mWebSockets.erase(websocket);
                            });
                        websocket->disconnected().connect([this](WebSocket* websocket) {
                                mWebSockets.erase(websocket);
                            });
                        return;
                    }
                }

                String file = req->path();
                if (file == "/")
                    file = "stats.html";
                static Path base = Path(Rct::executablePath().parentDir().ensureTrailingSlash() + "stats/").resolved().ensureTrailingSlash();
                const Path path = Path(base + file).resolved();
                if (!path.startsWith(base)) {
                    // no
                    error() << "Don't want to serve" << path;
                    const String data = "No.";
                    HttpServer::Response response(req->protocol(), 404);
                    response.headers() = HttpServer::Headers::StringMap {
                        { "Content-Length", String::number(data.size()) },
                        { "Content-Type", "text/plain" },
                        { "Connection", "close" }
                    };
                    response.setBody(data);
                    req->write(response, HttpServer::Response::Incomplete);
                    req->close();
                } else {
                    // serve file
                    if (path.isFile()) {
                        const String data = path.readAll();
                        HttpServer::Response response(req->protocol(), 200);
                        response.headers() = HttpServer::Headers::StringMap {
                            { "Content-Length", String::number(data.size()) },
                            { "Content-Type", guessMime(file) },
                            { "Connection", "keep-alive" }
                        };
                        response.setBody(data);
                        req->write(response);
                    } else {
                        const String data = "Unable to open " + file;
                        HttpServer::Response response(req->protocol(), 404);
                        response.headers() = HttpServer::Headers::StringMap {
                            { "Content-Length", String::number(data.size()) },
                            { "Content-Type", "text/plain" },
                            { "Connection", "keep-alive" }
                        };
                        response.setBody(data);
                        req->write(response);
                    }
                }
            }
        });
}
