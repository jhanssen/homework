#include "Console.h"
#include <Homedir.h>
#include <stddef.h>
#include <replxx.h>
#include <event/Loop.h>
#include <log/Log.h>
#include <errno.h>
#include <signal.h>

using namespace reckoning;
using namespace reckoning::event;
using namespace reckoning::log;

static void completionCallback(const char* prefix, int bp, replxx_completions* lc, void* ud)
{
}

Console::Console(std::vector<std::string>&& prefixes)
    : mPrefixes(std::forward<std::vector<std::string> >(prefixes))
{
    mThread = std::thread([this]() {
            const std::string historyFile = homedir() + "/.homework.history";

            std::string prefix;

            Replxx* replxx = replxx_init();
            replxx_history_load(replxx, historyFile.c_str());
            replxx_set_completion_callback(replxx, completionCallback, this);
            for (;;) {
                const char* result;
                do {
                    result = replxx_input(replxx, (prefix + "> ").c_str());
                } while ((result == nullptr) && (errno == EAGAIN));
                if (!result && !errno) {
                    // done?
                    break;
                }
                if (result && *result != '\0') {
                    if (!strncmp(result, "exit", 4)) {
                        if (prefix.empty()) {
                            // done?
                            break;
                        } else {
                            prefix.clear();
                        }
                    } else {
                        // check if we have a prefix
                        const char* eos = result;
                        bool done = false;
                        while (!done) {
                            switch (*eos) {
                            case ' ':
                            case '\t':
                            case '\0':
                                done = true;
                                break;
                            default:
                                ++eos;
                                break;
                            }
                        }
                        auto p = std::find(mPrefixes.begin(), mPrefixes.end(), std::string(result, eos - result));
                        if (p != mPrefixes.end()) {
                            prefix = *p;
                        } else {
                            mOnCommand.emit(prefix, std::string(result));
                            replxx_history_add(replxx, result);
                        }
                    }
                }
            }
            replxx_history_save(replxx, historyFile.c_str());
            replxx_end(replxx);
            mOnQuit.emit();
        });
}

Console::~Console()
{
    mThread.join();
}
