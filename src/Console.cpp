#include "Console.h"
#include "Homework.h"
#include "Editline.h"
#include "Split.h"
#include <event/Loop.h>
#include <log/Log.h>

using namespace reckoning::event;
using namespace reckoning::log;

static inline Action::Arguments parseArguments(const Action::Descriptors& descriptors,
                                               const std::vector<std::string>& list,
                                               size_t startOffset, bool* ok)
{
    if (list.size() - startOffset != descriptors.size()) {
        Log(Log::Error) << "argument mismatch, action requires"
                        << descriptors.size() << "arguments";
        if (descriptors.size() > list.size() - startOffset) {
            const auto& desc = descriptors[list.size() - startOffset];
            Log(Log::Error) << "  next argument should be of type" << ArgumentDescriptor::typeToName(desc.type);
        }
        if (ok)
            *ok = false;
        return Action::Arguments();
    }
    if (descriptors.empty()) {
        if (ok)
            *ok = true;
        return Action::Arguments();
    }
    auto argumentError = [](int i, const char* type) {
        Log(Log::Error) << "argument at position" << i << "needs to be of type" << type;
    };
    Action::Arguments args;
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
                return Action::Arguments();
            }
            break;
        case ArgumentDescriptor::IntOptions:
        case ArgumentDescriptor::IntRange:
            // ### need to verify that the number is in our options or range
            if (args.back().type() != typeid(int64_t)) {
                argumentError(i - startOffset, "int");
                if (ok)
                    *ok = false;
                return Action::Arguments();
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
                return Action::Arguments();
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

Console::Console(Homework* homework)
    : mHomework(homework)
{
}

Console::~Console()
{
}

void Console::start()
{
    std::vector<std::string> platforms;
    for (const auto& platform : mHomework->platforms()) {
        platforms.push_back(platform->name());
    }

    mEditline = std::make_shared<Editline>(platforms);

    // add exit as a global completion
    platforms.push_back("exit");

    std::weak_ptr<Loop> loop = Loop::loop();
    mEditline->onQuit().connect([loop]() {
            if (auto l = loop.lock()) {
                l->exit();
            }
        });
    mEditline->onCompletionRequest().connect([platforms, this](const std::shared_ptr<Editline::Completion>& request) {
            //Log(Log::Info) << "request." << request->buffer() << request->cursorPosition();
            const auto sub = request->buffer().substr(0, request->cursorPosition());

            const auto& prefix = request->prefix();
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
                for (const auto& p : mHomework->platforms()) {
                    if (p->name() == prefix) {
                        platform = p;
                        break;
                    }
                }
                if (!platform) {
                    request->complete();
                    return;
                }

                auto tokenString = request->tokenAtCursor();
                const auto tokenElement = request->tokenElement();
                const auto& tokens = request->tokens();

                if (tokenElement == 0) {
                    std::vector<std::string> toplevel;
                    toplevel.push_back("device");
                    toplevel.push_back("exit");
                    for (const auto& a : platform->actions()) {
                        toplevel.push_back(a->name());
                    }
                    for (const auto& p : toplevel) {
                        if (tokenString.empty() || (p.size() > tokenString.size() && !strncmp(tokenString.c_str(), p.c_str(), tokenString.size())))
                            alternatives.push_back(p);
                    }
                } else if (tokens[0] == "device") {
                    // device command is of the form
                    // 'device <id> <action_name> <arguments>'
                    const auto& devices = platform->devices();
                    for (const auto& device : devices) {
                        if (tokenElement == 1) {
                            // complete on device id
                            if (tokenString.empty() || (device.first.size() > tokenString.size() && !strncmp(tokenString.c_str(), device.first.c_str(), tokenString.size())))
                                alternatives.push_back(device.first);
                        } else if (tokens[1] == device.first) {
                            if (tokenElement == 2) {
                                // complete on command
                                std::vector<std::string> cmds = { "action", "state" };
                                for (const auto& p : cmds) {
                                    if (tokenString.empty() || (p.size() > tokenString.size() && !strncmp(tokenString.c_str(), p.c_str(), tokenString.size())))
                                        alternatives.push_back(p);
                                }
                            } else if (tokenElement == 3) {
                                if (tokens[2] == "action") {
                                    // complete on action name
                                    const auto& dev = device.second;
                                    for (const auto& action : dev->actions()) {
                                        const auto& p = action->name();
                                        if (tokenString.empty() || (p.size() > tokenString.size() && !strncmp(tokenString.c_str(), p.c_str(), tokenString.size())))
                                            alternatives.push_back(p);
                                    }
                                } else if (tokens[2] == "state") {
                                    // complete on state name
                                    const auto& dev = device.second;
                                    for (const auto& state : dev->states()) {
                                        const auto& p = state->name();
                                        if (tokenString.empty() || (p.size() > tokenString.size() && !strncmp(tokenString.c_str(), p.c_str(), tokenString.size())))
                                            alternatives.push_back(p);
                                    }
                                }
                            }
                            break;
                        }
                    }
                }

                //Log(Log::Error) << localsub << local;
            }
            request->complete(std::move(alternatives));
        });
    mEditline->onCommand().connect([this](const std::string& prefix, std::string&& cmd) {
            //printf("command %s\n", cmd.c_str());
            // split on space, send action to platform

            std::shared_ptr<Platform> platform;
            if (!prefix.empty()) {
                for (const auto& p : mHomework->platforms()) {
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
                                    return;
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
                            } else if (cmd == "state") {
                                if (list.size() == 3) {
                                    Log(Log::Info) << "-- state";
                                    for (const auto& state : dev->states()) {
                                        Log(Log::Info) << state->name();
                                    }
                                    Log(Log::Info) << "-- end state";
                                    return;
                                } else if (list.size() > 3) {
                                    const auto& s = list[3];
                                    for (const auto& state : dev->states()) {
                                        if (state->name() == s) {
                                            switch (state->type()) {
                                            case State::Bool:
                                                Log(Log::Info) << "state" << s << state->value<bool>();
                                                break;
                                            case State::Int:
                                                Log(Log::Info) << "state" << s << state->value<int>();
                                                break;
                                            case State::Double:
                                                Log(Log::Info) << "state" << s << state->value<double>();
                                                break;
                                            case State::String:
                                                Log(Log::Info) << "state" << s << state->value<std::string>();
                                                break;
                                            }
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

void Console::stop()
{
}
