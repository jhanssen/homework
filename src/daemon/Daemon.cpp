#include "Daemon.h"
#include <rct/Log.h>
#include <rct/Rct.h>
#include <cec/CecModule.h>

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

    initializeModules();
    initializeScene();
}

Daemon::SharedPtr Daemon::instance()
{
    return daemonInstance;
}

void Daemon::reset()
{
    daemonInstance.reset();
}

void Daemon::initializeModules()
{
    mModules.add<CecModule>();

    mModules.initialize();
}

void Daemon::initializeScene()
{
    Scene::SharedPtr scene = std::make_shared<Scene>();

    auto controller = mControllers.cbegin();
    const auto end = mControllers.cend();
    while (controller != end) {
        scene->add(*controller);
        ++controller;
    }

    mScenes.insert(scene);
}

void Daemon::registerController(const Controller::SharedPtr& controller)
{
    mControllers.insert(controller);

    // add to all scenes
    auto scene = mScenes.cbegin();
    const auto end = mScenes.cend();
    while (scene != end) {
        (*scene)->add(controller);
        ++scene;
    }
}

void Daemon::unregisterController(const Controller::SharedPtr& controller)
{
    mControllers.remove(controller);

    // remove from all scenes
    auto scene = mScenes.cbegin();
    const auto end = mScenes.cend();
    while (scene != end) {
        (*scene)->remove(controller);
        ++scene;
    }
}

void Daemon::registerSensor(const Sensor::SharedPtr& sensor)
{
    mSensors.insert(sensor);
}

void Daemon::unregisterSensor(const Sensor::SharedPtr& sensor)
{
    mSensors.remove(sensor);
}
