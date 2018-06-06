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
            }
            if (!skip && !done) {
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

static inline Action::Arguments parseArguments(const Action::Descriptors& descriptors,
                                               const std::vector<std::string>& list,
                                               size_t startOffset, bool* ok)
{
    Action::Arguments args;
    if (list.size() - startOffset != descriptors.size()) {
        Log(Log::Error) << "argument mismatch, action requires"
                        << descriptors.size() << "arguments";
        if (descriptors.size() > list.size() - startOffset) {
            const auto& desc = descriptors[list.size() - startOffset];
            Log(Log::Error) << "  next argument should be of type" << ArgumentDescriptor::typeToName(desc.type);
        }
        if (ok)
            *ok = false;
        return args;
    }
    if (descriptors.empty()) {
        if (ok)
            *ok = true;
        return args;
    }
    auto argumentError = [](int i, const char* type) {
        Log(Log::Error) << "argument at position" << i << "needs to be of type" << type;
    };
    args.reserve(list.size() - startOffset);
    for (size_t i = startOffset; i < list.size(); ++i) {
        args.push_back(Parser::guessValue(list[i]));
        // verify argument type
        switch (descriptors[i - startOffset].type) {
        case ArgumentDescriptor::Bool:
            if (args.back().type() != typeid(bool)) {
                argumentError(i - startOffset, "bool");
                if (ok)
                    *ok = false;
                return args;
            }
            break;
        case ArgumentDescriptor::IntOptions:
        case ArgumentDescriptor::IntRange:
            // ### need to verify that the number is in our options or range
            if (args.back().type() != typeid(int64_t)) {
                argumentError(i - startOffset, "int");
                if (ok)
                    *ok = false;
                return args;
            }
            break;
        case ArgumentDescriptor::DoubleOptions:
        case ArgumentDescriptor::DoubleRange:
            if (args.back().type() == typeid(int64_t)) {
                // force double
                args.back() = std::any(static_cast<double>(std::any_cast<int64_t>(args.back())));
            } else if (args.back().type() != typeid(double)) {
                argumentError(i - startOffset, "double");
                if (ok)
                    *ok = false;
                return args;
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
    if (ok)
        *ok = true;
    return args;
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

            // add exit as a global completion
            platforms.push_back("exit");

            std::weak_ptr<Loop> loop = Loop::loop();
            mConsole->onQuit().connect([loop]() {
                    if (auto l = loop.lock()) {
                        l->exit();
                    }
                });
            mConsole->onCompletionRequest().connect([platforms, this](const std::shared_ptr<Console::Completion>& request) {
                    //Log(Log::Info) << "request." << request->buffer() << request->cursorPosition();
                    const auto sub = request->buffer().substr(0, request->cursorPosition());
                    auto list = split(sub, false);

                    const auto& prefix = request->prefix();
                    size_t alternativeOffset = request->cursorPosition();
                    std::vector<std::string> alternatives;
                    if (prefix.empty()) {
                        // complete on prefixes
                        for (const auto& p : platforms) {
                            if (p.size() > sub.size() && !strncmp(sub.c_str(), p.c_str(), sub.size()))
                                alternatives.push_back(p);
                        }
                    } else {
                        // complete on platform?
                        std::shared_ptr<Platform> platform;
                        for (const auto& p : mPlatforms) {
                            if (p->name() == prefix) {
                                platform = p;
                                break;
                            }
                        }
                        if (!platform) {
                            request->complete();
                            return;
                        }
                        // what word is our cursor in?
                        size_t offset = 0, element = 0, argno = 0, local = 0, len;
                        for (element = 0; element < list.size(); ++element) {
                            const auto& e = list[element];
                            len = e.empty() ? 1 : e.size();

                            if (request->cursorPosition() <= offset + len) {
                                // yup
                                if (e.empty()) {
                                    local = 0;
                                    ++element;
                                } else {
                                    local = request->cursorPosition() - offset;
                                }
                                break;
                            }
                            offset += len;
                            if (!e.empty())
                                ++argno;
                        }

                        auto localsub = element < list.size() ? list[element] : std::string();
                        alternativeOffset = local;

                        // resplit, ignoring whitespace elements
                        list = split(sub);

                        if (argno == 0) {
                            std::vector<std::string> toplevel;
                            toplevel.push_back("device");
                            for (const auto& a : platform->actions()) {
                                toplevel.push_back(a->name());
                            }
                            for (const auto& p : toplevel) {
                                if (localsub.empty() || (p.size() > localsub.size() && !strncmp(localsub.c_str(), p.c_str(), localsub.size())))
                                    alternatives.push_back(p);
                            }
                        } else if (list[0] == "device") {
                            // device command is of the form
                            // 'device <id> <action_name> <arguments>'
                            const auto& devices = platform->devices();
                            for (const auto& device : devices) {
                                if (argno == 1) {
                                    // complete on device id
                                    if (localsub.empty() || (device.first.size() > localsub.size() && !strncmp(localsub.c_str(), device.first.c_str(), localsub.size())))
                                        alternatives.push_back(device.first);
                                } else if (list[1] == device.first) {
                                    if (argno == 2) {
                                        // complete on command
                                        std::vector<std::string> cmds = { "action" };
                                        for (const auto& p : cmds) {
                                            if (localsub.empty() || (p.size() > localsub.size() && !strncmp(localsub.c_str(), p.c_str(), localsub.size())))
                                                alternatives.push_back(p);
                                        }
                                    } else if (argno == 3 && list[2] == "action") {
                                        // complete on action name
                                        const auto& dev = device.second;
                                        for (const auto& action : dev->actions()) {
                                            const auto& p = action->name();
                                            if (localsub.empty() || (p.size() > localsub.size() && !strncmp(localsub.c_str(), p.c_str(), localsub.size())))
                                                alternatives.push_back(p);
                                        }
                                    }
                                    break;
                                }
                            }
                        }

                        //Log(Log::Error) << localsub << local;
                    }
                    request->complete(std::move(alternatives), alternativeOffset);
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

                    if (list.front() == "device") {
                        if (list.size() == 1) {
                            Log(Log::Info) << "-- devices";
                            if (platform) {
                                const auto& devices = platform->devices();
                                for (const auto& device : devices) {
                                    Log(Log::Error) << device.first << ":" << device.second->name();
                                }
                            }
                            Log(Log::Info) << "-- end devices";
                        } else if (list.size() > 2) {
                            const auto& id = list[1];
                            const auto& cmd = list[2];
                            const auto& devices = platform->devices();
                            for (const auto& device : devices) {
                                if (device.first == id) {
                                    const auto& dev = device.second;
                                    if (cmd == "action") {
                                        if (list.size() == 3) {
                                            Log(Log::Info) << "-- actions";
                                            for (const auto& action : dev->actions()) {
                                                Log(Log::Info) << action->name();
                                            }
                                            Log(Log::Info) << "-- end actions";
                                        } else if (list.size() > 3) {
                                            const auto& a = list[3];
                                            for (const auto& action : dev->actions()) {
                                                if (action->name() == a) {
                                                    bool ok;
                                                    Action::Arguments args = parseArguments(action->descriptors(), list, 4, &ok);
                                                    if (!ok)
                                                        return;
                                                    Log(Log::Info) << "executing action" << a;
                                                    action->execute(args);
                                                    return;
                                                }
                                            }
                                        }
                                    }
                                    Log(Log::Error) << "invalid action" << cmd;
                                    return;
                                }
                            }
                            Log(Log::Error) << "no such device" << id;
                        } else {
                            Log(Log::Error) << "malformed device command";
                        }
                        return;
                    }

                    const std::string& action = list.front();
                    for (const auto& a : platform->actions()) {
                        if (a->name() == action) {
                            // go
                            bool ok;
                            Action::Arguments args = parseArguments(a->descriptors(), list, 1, &ok);
                            if (!ok)
                                return;
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
