#include "Console.h"
#include <Homedir.h>
#include <stddef.h>
#include <event/Loop.h>
#include <log/Log.h>
#include <util/Socket.h>
#include <sys/select.h>
#include <errno.h>
#include <stdlib.h>
#include <fcntl.h>
#include <cassert>

using namespace reckoning;
using namespace reckoning::event;
using namespace reckoning::log;

Console::Console(std::vector<std::string>&& prefixes)
    : mPrefixes(std::forward<std::vector<std::string> >(prefixes)),
      mHistory(nullptr), mEditLine(nullptr)
{
    mStopped = false;
    mPrompt = "> ";

    int e = pipe(mPipe);
    if (e == -1) {
        Log(Log::Error) << "failed to create pipe for console" << errno;
        mPipe[0] = -1;
        mPipe[1] = -1;
        return;
    }
    if (!util::socket::setFlag(mPipe[0], O_NONBLOCK)) {
        Log(Log::Error) << "unable to set console pipe to non-blocking";
        return;
    }
    if (!util::socket::setFlag(STDIN_FILENO, O_NONBLOCK)) {
        Log(Log::Error) << "unable to set stdin to non-blocking";
        return;
    }

    mHistory = history_init();
    mEditLine = el_init("homework", stdin, stdout, stderr);
    if (!mHistory || !mEditLine) {
        Log(Log::Error) << "failed to set up libedit";
        return;
    }
    HistEvent histEvent;
    history(mHistory, &histEvent, H_SETSIZE, 1024 * 32);
    history(mHistory, &histEvent, H_SETUNIQUE, 1);

    el_set(mEditLine, EL_SIGNAL, 1);
    el_set(mEditLine, EL_EDITOR, "emacs");
    el_set(mEditLine, EL_HIST, history, mHistory);
    el_set(mEditLine, EL_CLIENTDATA, this);
    el_wset(mEditLine, EL_GETCFN, &Console::getChar);
    el_set(mEditLine, EL_PROMPT_ESC, &Console::prompt, '\1');
    el_wset(mEditLine, EL_ADDFN, L"ed-complete", L"help", &Console::complete);
    el_set(mEditLine, EL_BIND, "^I", "ed-complete", 0);

    const auto home = homedir();
    if (!home.empty()) {
        mHistoryFile = home + "/.homework.history";
        history(mHistory, &histEvent, H_LOAD, mHistoryFile.c_str());
        const std::string elrc = home + "/.editrc";
        el_source(mEditLine, elrc.c_str());
    }

    mThread = std::thread([this]() {
            int count;
            std::string prefix, cmd;

            for (;;) {
                if (mStopped)
                    return;

                const char* ch = el_gets(mEditLine, &count);
                if (!ch || count <= 0) {
                    mOnQuit.emit();
                    break;
                }
                const char* cur = ch;
                bool done = false;
                while (!done) {
                    switch (*cur) {
                    case ' ':
                    case '\t':
                    case '\0':
                    case '\r':
                    case '\n':
                        cmd = std::string(ch, cur - ch);
                        if (cmd == "exit") {
                            if (prefix.empty()) {
                                // done with this
                                mOnQuit.emit();
                                return;
                            }
                            prefix.clear();
                            mPrompt = "> ";
                            //el_set(mEditLine, EL_REFRESH);
                            count = 0;
                        } else if (std::find(mPrefixes.begin(), mPrefixes.end(), cmd) != mPrefixes.end()) {
                            if (!mHistoryFile.empty()) {
                                HistEvent histEvent;
                                history(mHistory, &histEvent, H_ENTER, cmd.c_str());
                                history(mHistory, &histEvent, H_SAVE, mHistoryFile.c_str());
                            }

                            prefix = cmd;
                            mPrompt = cmd + "> ";
                            //el_set(mEditLine, EL_REFRESH);
                            count = 0;
                        }
                        done = true;
                        continue;
                    }
                    ++cur;
                }
                while (count > 0 && (ch[count - 1] == '\n' || ch[count - 1] == '\r'))
                    --count;
                if (count > 0) {
                    std::string ncmd(ch, count);
                    if (!mHistoryFile.empty()) {
                        HistEvent histEvent;
                        history(mHistory, &histEvent, H_ENTER, ncmd.c_str());
                        history(mHistory, &histEvent, H_SAVE, mHistoryFile.c_str());
                    }
                    mOnCommand.emit(prefix, std::move(ncmd));
                }
            }
        });
    Log::setLogHandler([this](Log::Output, std::string&& msg) {
            std::lock_guard<std::mutex> locker(mMutex);
            mOutputs.push_back(std::forward<std::string>(msg));
            wakeup();
        });
}

Console::~Console()
{
    if (mThread.joinable()) {
        mStopped = true;
        wakeup();
        mThread.join();
    }

    if (mHistory) {
        history_end(mHistory);
    }
    if (mEditLine) {
        el_end(mEditLine);
    }
    int e;
    if (mPipe[0] != -1) {
        eintrwrap(e, close(mPipe[0]));
    }
    if (mPipe[1] != -1) {
        eintrwrap(e, close(mPipe[1]));
    }
}

void Console::wakeup()
{
    if (mPipe[1] == -1)
        return;
    int e;
    char c = 'w';
    eintrwrap(e, write(mPipe[1], &c, 1));
}

int Console::getChar(EditLine* edit, wchar_t* out)
{
    Console* console = nullptr;
    el_get(edit, EL_CLIENTDATA, &console);
    assert(console != nullptr);

    const int max = std::max(console->mPipe[0], STDIN_FILENO);

    enum ReadState { ReadOk, ReadIncomplete, ReadEof };
    auto readChar = [](wchar_t* out) -> ReadState {
        wint_t c = getwc(stdin);
        if (c == WEOF) {
            *out = L'\0';
            return feof(stdin) ? ReadEof : ReadIncomplete;
        }
        *out = static_cast<wchar_t>(c);
        return ReadOk;
    };

    switch (readChar(out)) {
    case ReadOk:
        return 1;
    case ReadEof:
        return 0;
    case ReadIncomplete:
        // select
        break;
    }

    int s;
    fd_set rdset;
    std::vector<std::string> outputs;

    for (;;) {
        FD_ZERO(&rdset);
        FD_SET(console->mPipe[0], &rdset);
        FD_SET(STDIN_FILENO, &rdset);
        eintrwrap(s, select(max + 1, &rdset, nullptr, nullptr, nullptr));
        if (s == -1) {
            // badness
            Log(Log::Error) << "failed to select for console" << errno;
            *out = L'\0';
            return 0;
        }
        if (FD_ISSET(console->mPipe[0], &rdset)) {
            // drain pipe
            int e;
            char c;
            do {
                eintrwrap(e, read(console->mPipe[0], &c, 1));
            } while (e == 1);

            {
                std::lock_guard<std::mutex> locker(console->mMutex);
                outputs = std::move(console->mOutputs);
            }
            if (!outputs.empty()) {
                // clear line, cursor to start of line
                printf("\33[2K\33[A\n");
                for (const auto& str : outputs) {
                    printf("%s", str.c_str());
                }
                outputs.clear();

                el_set(console->mEditLine, EL_REFRESH);
            }

            if (console->mStopped) {
                *out = L'\0';
                return -1;
            }
        }
        if (FD_ISSET(STDIN_FILENO, &rdset)) {
            switch (readChar(out)) {
            case ReadOk:
                return 1;
            case ReadEof:
                return 0;
            case ReadIncomplete:
                return -1;
            }
        }
    }
    *out = L'\0';
    return -1;
}

const char* Console::prompt(EditLine* edit)
{
    Console* console = nullptr;
    el_get(edit, EL_CLIENTDATA, &console);
    assert(console != nullptr);

    return console->mPrompt.c_str();
}

unsigned char Console::complete(EditLine* edit, int)
{
    return CC_ERROR;
}
