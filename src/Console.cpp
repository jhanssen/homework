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
            for (;;) {
                if (mStopped)
                    return;

                const char* ch = el_gets(mEditLine, &count);
                if (!ch || count <= 0) {
                    break;
                }
                printf("got console str %s\n", std::string(ch, count).c_str());
            }
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
    *out = L'\0';
    return -1;
}

const char* Console::prompt(EditLine* edit)
{
    return "> ";
}

unsigned char Console::complete(EditLine* edit, int)
{
    return CC_ERROR;
}
