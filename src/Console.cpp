#include "Console.h"
#include <Homedir.h>
#include <stddef.h>
#include <replxx.h>
#include <event/Loop.h>
#include <log/Log.h>
#include <util/Socket.h>
#include <errno.h>
#include <stdlib.h>
#include <fcntl.h>
#include <cassert>

using namespace reckoning;
using namespace reckoning::event;
using namespace reckoning::log;

static void completionCallback(const char* prefix, int bp, replxx_completions* lc, void* ud)
{
}

Console::Console(std::vector<std::string>&& prefixes)
    : mPrefixes(std::forward<std::vector<std::string> >(prefixes)), mExited(false)
{
    mPipe[0] = -1;
    mPipe[1] = -1;
    // do horrible things to be able to wakeup replxx from another thread
    eintrwrap(mOriginalStdIn, dup(STDIN_FILENO));
    util::socket::setFlag(mOriginalStdIn, O_NONBLOCK);
    setupFd();

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
                    //printf("whey %p %d %d\n", result, errno, mExited.load());
                } while ((result == nullptr) && (errno == EAGAIN));
                if (mExited.load()) {
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
    mFdHandle.remove();
    int e;
    if (mPipe[0] != -1) {
        eintrwrap(e, close(mPipe[0]));
    }
    if (mPipe[1] != -1) {
        eintrwrap(e, close(mPipe[1]));
    }
}

void Console::setupFd()
{
    recreateFd();
    mFdHandle = Loop::loop()->addFd(mOriginalStdIn, Loop::FdRead, [this](int fd, uint8_t) {
            // write everything from newstdin to the pipe that replxx is using
            char buf[4096];
            for (;;) {
                ssize_t r = read(fd, buf, sizeof(buf));
                if (r <= 0) {
                    if (r == 0) {
                        // STDIN closed, set our state and wake up the replxx thread
                        mExited = true;
                        recreateFd();
                    }
                    break;
                }
                ssize_t w;
                ssize_t c = 0;
                for (;;) {
                    w = write(mPipe[1], buf + c, r - c);
                    if (w <= 0)
                        break;
                    c += w;
                    if (c == r)
                        break;
                }
            }
        });
}

void Console::recreateFd()
{
    int e;
    // don't close mPipe[0] here, that will
    // happen implicitly in the dup2 call below
    assert(mPipe[0] == 0 || mPipe[0] == -1);
    if (mPipe[1] != -1) {
        eintrwrap(e, close(mPipe[1]));
        mPipe[1] = -1;
    }
    mPipe[0] = posix_openpt(O_RDWR);
    if (mPipe[0] != -1) {
        grantpt(mPipe[0]);
        unlockpt(mPipe[0]);
        mPipe[1] = open(ptsname(mPipe[0]), O_RDWR);
    }
    if (mPipe[0] == -1 || mPipe[1] == -1) {
        int e;
        Log(Log::Error) << "Unable to recreate pty";
        if (mPipe[0] != -1) {
            eintrwrap(e, close(mPipe[0]));
            mPipe[0] = -1;
        }
        if (mPipe[1] != -1) {
            eintrwrap(e, close(mPipe[1]));
            mPipe[1] = -1;
        }
        mFdHandle.remove();
        eintrwrap(e, dup2(mOriginalStdIn, STDIN_FILENO));
        eintrwrap(e, close(mOriginalStdIn));
        mOriginalStdIn = -1;
        return;
    }

    eintrwrap(e, dup2(mPipe[0], STDIN_FILENO));
    eintrwrap(e, close(mPipe[0]));
    mPipe[0] = STDIN_FILENO;
}

void Console::wakeup()
{
    recreateFd();
}
