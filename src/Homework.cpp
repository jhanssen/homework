#include "Homework.h"
#include "Console.h"
#include <event/Loop.h>
#include <log/Log.h>
#include <args/Parser.h>
#include <zwave/PlatformZwave.h>

using namespace reckoning::log;
using namespace reckoning::args;
using namespace reckoning::event;

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
        mConsole = std::make_shared<Console>(std::move(platforms));
        std::weak_ptr<Loop> loop = Loop::loop();
        mConsole->onQuit().connect([loop]() {
                printf("hey\n");
                if (auto l = loop.lock()) {
                    l->exit();
                }
            });
        mConsole->onCommand().connect([this](const std::string& prefix, std::string&& cmd) {
                //printf("command %s\n", cmd.c_str());
                // split on space, send action to platform

                std::vector<std::string> split;

                const char* cur = cmd.c_str();
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
                            split.push_back(std::string(prev, cur - prev));
                        }
                        prev = cur + 1;
                        break;
                    default:
                        break;
                    }
                }

                if (prefix.empty() || split.empty()) {
                    // bail out for now
                    Log(Log::Error) << "invalid command" << prefix << cmd;
                    return;
                }

                std::shared_ptr<Platform> platform;
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

                const std::string& action = split.front();
                for (const auto& a : platform->actions()) {
                    if (a->name() == action) {
                        // go
                        Action::Arguments args;
                        const auto& actionArguments = a->descriptors();
                        if (split.size() > 1) {
                            printf("wapp %zu %zu\n", split.size() - 1, actionArguments.size());
                            if (split.size() - 1 != actionArguments.size()) {
                                Log(Log::Error) << "argument mismatch, action" << action
                                                << "requires" << actionArguments.size() << "arguments";
                                return;
                            }
                            auto argumentError = [](int i, const char* type) {
                                Log(Log::Error) << "argument at position" << i << "needs to be of type" << type;
                            };
                            args.reserve(split.size() - 1);
                            for (size_t i = 1; i < split.size(); ++i) {
                                args.push_back(Parser::guessValue(split[i]));
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
                                        args.back() = std::any(split[i]);
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

void Homework::stop()
{
    mPlatforms.clear();
}
