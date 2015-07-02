#include "WSModule.h"
#include <Controller.h>
#include <Daemon.h>
#include <RuleJS.h>
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

template<typename T>
static inline void processGet(const T& container, const String& name, Value& ret)
{
    Value list;
    auto item = container.cbegin();
    const auto end = container.cend();
    while (item != end) {
        list.push_back((*item)->name());
        ++item;
    }

    Value comp;
    comp["candidates"] = list;
    Value data;
    data["completions"] = comp;

    data[name] = list;
    data["list"] = name;
    ret["type"] = "list";
    ret["data"] = data;
}

template<typename T>
static inline void processGet(const T& item, const String& type, const String& name, Value& ret)
{
    error() << "finding" << type << name;
    if (item) {
        error() << "found" << type << name;
        ret["data"] = item->describe();
    }
}

static inline Value handleMessage(const Value& msg)
{
    Value ret;
    const String method = msg.value<String>("method");
    const int id = msg.value<int>("id", -1);
    if (method == "get") {
        const String get = msg.value<String>("get");
        printf("get %s\n", get.constData());

        ret["id"] = id;

        if (get == "controllers") {
            processGet(Modules::instance()->controllers(), "controllers", ret);
        } else if (get == "sensors") {
            processGet(Modules::instance()->sensors(), "sensors", ret);
        } else if (get == "rules") {
            processGet(Modules::instance()->rules(), "rules", ret);
        } else if (get == "scenes") {
            processGet(Modules::instance()->scenes(), "scenes", ret);
        } else if (get == "modules") {
            processGet(Modules::instance()->modules(), "modules", ret);
        } else if (get == "controller") {
            const String name = msg.value<String>("controller");
            processGet(Modules::instance()->controller(name), "controller", name, ret);
        } else if (get == "sensor") {
            const String name = msg.value<String>("sensor");
            processGet(Modules::instance()->sensor(name), "sensor", name, ret);
        }
    } else if (method == "set") {
        const String set = msg.value<String>("set");
        if (set == "controller") {
            const String name = msg.value<String>("name");

            if (auto ctrl = Modules::instance()->controller(name))
                ctrl->set(msg);
        }
    } else if (method == "create") {
        const String create = msg.value<String>("create");
        error() << "creating" << create;
        if (create == "scene") {
            Scene::SharedPtr scene = std::make_shared<Scene>(msg.value<String>("name"));
            Modules::instance()->registerScene(scene);
        } else if (create == "rule") {
            Rule::SharedPtr rule = std::make_shared<RuleJS>(msg.value<String>("name"));
            Modules::instance()->registerRule(rule);
        }
    } else if (method == "add") {
        const String add = msg.value<String>("add");
        if (add == "ruleSensor") {
            const String sensorName = msg.value<String>("sensor");
            const String ruleName = msg.value<String>("rule");
            if (sensorName.isEmpty()) {
                error() << "no sensor for rule add";
                return Value();
            }
            if (ruleName.isEmpty()) {
                error() << "no rule for rule add";
                return Value();
            }
            Sensor::SharedPtr sensor = Modules::instance()->sensor(sensorName);
            if (!sensor) {
                error() << "no sensor" << sensorName << "for rule add";
                return Value();
            }
            Rule::SharedPtr rule = Modules::instance()->rule(ruleName);
            if (!rule) {
                error() << "no rule" << ruleName << "for rule add";
                return Value();
            }
            rule->registerSensor(sensor);
        }
    } else if (method == "cfg") {
        const String cfg = msg.value<String>("cfg");
        if (cfg == "modules") {
            const String name = msg.value<String>("name");
            const String value = msg.value<String>("value");
            // find module
            for (const auto& module : Modules::instance()->modules()) {
                if (name == module->name()) {
                    // go
                    module->configure(value);
                    return Value();
                }
            }
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
