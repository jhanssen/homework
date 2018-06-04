#ifndef CONSOLE_H
#define CONSOLE_H

#include <thread>
#include <mutex>
#include <event/Signal.h>
#include <string>
#include <vector>
#include <atomic>
#include <histedit.h>

using reckoning::event::Signal;
//using reckoning::event::Loop;

class Console
{
public:
    Console(std::vector<std::string>&& prefixes);
    ~Console();

    Signal<>& onQuit();
    Signal<const std::string&, std::string&&>& onCommand();

    void wakeup();

private:
    static int getChar(EditLine* edit, wchar_t* ch);
    static const char* prompt(EditLine* edit);
    static unsigned char complete(EditLine* edit, int);

private:
    std::atomic<bool> mStopped;
    std::thread mThread;
    std::mutex mMutex;
    std::vector<std::string> mPrefixes, mOutputs;
    Signal<> mOnQuit;
    Signal<const std::string&, std::string&&> mOnCommand;
    History* mHistory;
    EditLine* mEditLine;
    std::string mHistoryFile, mPrompt;
    int mPipe[2];
};

inline Signal<>& Console::onQuit()
{
    return mOnQuit;
}

inline Signal<const std::string&, std::string&&>& Console::onCommand()
{
    return mOnCommand;
}

#endif // CONSOLE_H
