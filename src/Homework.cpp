#include "Homework.h"
#include "Console.h"
#include <event/Loop.h>
#include <log/Log.h>
#include <args/Parser.h>
#include <zwave/PlatformZwave.h>
#include <locale.h>
#include <string.h>

using namespace reckoning::log;
using namespace reckoning::args;
using namespace reckoning::event;
using namespace std::chrono_literals;

static inline std::vector<std::string> split(const std::string& str, bool skip = true)
{
    std::vector<std::string> data;
    const char* cur = str.c_str();
    const char* prev = cur;
    bool done = false;
    for (; !done; ++cur) {
        switch (*cur) {
        case '\0':
            done = true;
            // fall through
        case '\t':
        case ' ':
            if (cur > prev) {
                // push to list
                data.push_back(std::string(prev, cur - prev));
            } else if (!skip && !done) {
                data.push_back(std::string());
            }
            prev = cur + 1;
            break;
        default:
            break;
        }
    }
    return data;
}

Homework::Homework(Options&& options)
    : mOptions(std::forward<Options>(options))
{
}

Homework::~Homework()
{
}

void Homework::start()
{
    std::vector<std::string> platforms;
    if (mOptions.value<bool>("zwave-enabled")) {
        //printf("zwave go\n");
        auto zwave = PlatformZwave::create(mOptions);
        if (zwave->isValid()) {
            Log(Log::Info) << "zwave initialized";
            mPlatforms.push_back(std::move(zwave));
            platforms.push_back(mPlatforms.back()->name());
        }
    }

    if (mOptions.value<bool>("console-enabled")) {
        char* locale = setlocale(LC_ALL, "");
        if (!locale || !strcasestr(locale, "UTF-8") || !strcasestr(locale, "utf-8")) {
            Log(Log::Error) << "console requires an UTF-8 locale";
        } else {
            mConsole = std::make_shared<Console>(platforms);
            std::weak_ptr<Loop> loop = Loop::loop();
            mConsole->onQuit().connect([loop]() {
                    if (auto l = loop.lock()) {
                        l->exit();
                    }
                });
            mConsole->onCompletionRequest().connect([platforms](const std::shared_ptr<Console::Completion>& request) {
                    //Log(Log::Info) << "request." << request->buffer() << request->cursorPosition();
                    const auto sub = request->buffer().substr(0, request->cursorPosition());
                    const auto list = split(sub, false);
                    if (list.empty()) {
                        request->complete();
                        return;
                    }
                    const auto& prefix = request->prefix();
                    std::vector<std::string> alternatives;
                    if (prefix.empty()) {
                        // complete on prefixes
                        for (const auto& p : platforms) {
                            if (p.size() > sub.size() && !strncmp(sub.c_str(), p.c_str(), sub.size()))
                                alternatives.push_back(p.substr(request->cursorPosition()));
                        }
                    } else {
                        // complete on platform?
                    }
                    request->complete(std::move(alternatives));
                });
            Loop::loop()->addTimer(10000ms, Loop::Interval, []() {
                    Log(Log::Info) << "yes.";
                });
            mConsole->onCommand().connect([this](const std::string& prefix, std::string&& cmd) {
                    //printf("command %s\n", cmd.c_str());
                    // split on space, send action to platform

                    if (cmd == "wakeup") {
                        Loop::loop()->addTimer(500ms, [this]() {
                                //printf("wakey\n");
                                mConsole->wakeup();
                            });
                        return;
                    }

                    std::shared_ptr<Platform> platform;
                    if (!prefix.empty()) {
                        for (const auto& p : mPlatforms) {
                            if (p->name() == prefix) {
                                platform = p;
                                break;
                            }
                        }
                        if (!platform) {
                            Log(Log::Error) << "no platform for" << prefix;
                            return;
                        }
                    }

                    auto list = split(cmd);

                    if (prefix.empty() || list.empty()) {
                        // bail out for now
                        Log(Log::Error) << "invalid command" << prefix << cmd;
                        return;
                    }

                    if (!platform) {
                        Log(Log::Error) << "no platform for" << prefix;
                        return;
                    }

                    if (cmd == "devices") {
                        Log(Log::Error) << "-- devices";
                        if (platform) {
                            const auto& devices = platform->devices();
                            for (const auto& device : devices) {
                                Log(Log::Error) << device.first << ":" << device.second->name();
                            }
                        }
                        Log(Log::Error) << "-- end devices";
                        return;
                    } else if (list.front() == "device" && list.size() > 2) {
                        const auto& id = list[1];
                        const auto& cmd = list[2];
                        const auto& devices = platform->devices();
                        for (const auto& device : devices) {
                            if (device.first == id) {
                                const auto& dev = device.second;
                                if (cmd == "actions") {
                                    Log(Log::Error) << "-- actions";
                                    for (const auto& action : dev->actions()) {
                                        Log(Log::Error) << action->name();
                                    }
                                    Log(Log::Error) << "-- end actions";
                                } else if (cmd == "action" && list.size() > 3) {
                                    const auto& a = list[3];
                                    for (const auto& action : dev->actions()) {
                                        if (action->name() == a) {
                                            Log(Log::Error) << "executing action" << a;
                                            action->execute();
                                            return;
                                        }
                                    }
                                    Log(Log::Error) << "no such action" << a;
                                }
                                return;
                            }
                        }
                        Log(Log::Error) << "no such device" << id;
                    }

                    const std::string& action = list.front();
                    for (const auto& a : platform->actions()) {
                        if (a->name() == action) {
                            // go
                            Action::Arguments args;
                            const auto& actionArguments = a->descriptors();
                            if (list.size() > 1) {
                                if (list.size() - 1 != actionArguments.size()) {
                                    Log(Log::Error) << "argument mismatch, action" << action
                                                    << "requires" << actionArguments.size() << "arguments";
                                    return;
                                }
                                auto argumentError = [](int i, const char* type) {
                                    Log(Log::Error) << "argument at position" << i << "needs to be of type" << type;
                                };
                                args.reserve(list.size() - 1);
                                for (size_t i = 1; i < list.size(); ++i) {
                                    args.push_back(Parser::guessValue(list[i]));
                                    // verify argument type
                                    switch (actionArguments[i - 1].type) {
                                    case ArgumentDescriptor::Bool:
                                        if (args.back().type() != typeid(bool)) {
                                            argumentError(i - 1, "bool");
                                            return;
                                        }
                                        break;
                                    case ArgumentDescriptor::IntOptions:
                                    case ArgumentDescriptor::IntRange:
                                        // ### need to verify that the number is in our options or range
                                        if (args.back().type() != typeid(int64_t)) {
                                            argumentError(i - 1, "int");
                                            return;
                                        }
                                        break;
                                    case ArgumentDescriptor::DoubleOptions:
                                    case ArgumentDescriptor::DoubleRange:
                                        if (args.back().type() == typeid(int64_t)) {
                                            // force double
                                            args.back() = std::any(static_cast<double>(std::any_cast<int64_t>(args.back())));
                                        } else if (args.back().type() != typeid(double)) {
                                            argumentError(i - 1, "double");
                                            return;
                                        }
                                        break;
                                    case ArgumentDescriptor::StringOptions:
                                        if (args.back().type() != typeid(std::string)) {
                                            // coerce
                                            args.back() = std::any(list[i]);
                                        }
                                        break;
                                    }
                                }
                            } else if (!actionArguments.empty()) {
                                Log(Log::Error) << "argument mismatch, action" << action
                                                << "requires" << actionArguments.size() << "arguments";
                                return;
                            }
                            a->execute(args);
                            return;
                        }
                    }
                    Log(Log::Error) << "action not found" << action;
                });
        }
    }

    for (const auto& platform : mPlatforms) {
        if (!platform->start()) {
            Log(Log::Error) << "failed to start platform" << platform->name();
        }
    }
}

void Homework::stop()
{
    for (const auto& platform : mPlatforms) {
        if (!platform->stop()) {
            Log(Log::Error) << "failed to stop platform" << platform->name();
        }
    }
    mPlatforms.clear();
}
