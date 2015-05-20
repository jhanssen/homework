#include "Daemon.h"
#include <rct/Log.h>
#include <rct/Rct.h>
#include <json.hpp>
#include <JsonUtils.h>

using nlohmann::json;

static Daemon::SharedPtr daemonInstance;

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

Daemon::Daemon()
{
    mHttpServer.listen(8089);
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

Daemon::~Daemon()
{
    daemonInstance.reset();
}

void Daemon::init()
{
    daemonInstance = shared_from_this();
    mStates.append(std::make_shared<State>());
    initializeModules();
}

Daemon::SharedPtr Daemon::instance()
{
    return daemonInstance;
}

void Daemon::initializeModules()
{
}

void Daemon::registerController(const Controller::SharedPtr& controller)
{
    mControllers.append(controller);

    // add to all states
    auto state = mStates.cbegin();
    const auto end = mStates.cend();
    while (state != end) {
        (*state)->add(controller);
        ++state;
    }
}

void Daemon::unregisterController(const Controller::SharedPtr& controller)
{
    mControllers.remove(controller);

    // remove from all states
    auto state = mStates.cbegin();
    const auto end = mStates.cend();
    while (state != end) {
        (*state)->remove(controller);
        ++state;
    }
}

void Daemon::registerSensor(const Sensor::SharedPtr& sensor)
{
    mSensors.append(sensor);
}

void Daemon::unregisterSensor(const Sensor::SharedPtr& sensor)
{
    mSensors.remove(sensor);
}
