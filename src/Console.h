#ifndef CONSOLE_H
#define CONSOLE_H

#include <thread>
#include <string>
#include <vector>
#include <event/Signal.h>
#include <event/Loop.h>
#include <atomic>
#include <mutex>

using reckoning::event::Signal;
using reckoning::event::Loop;

class Console
{
public:
    Console(std::vector<std::string>&& prefixes);
    ~Console();

    Signal<>& onQuit();
    Signal<const std::string&, std::string&&>& onCommand();

    void wakeup();

private:
    std::thread mThread;
    std::vector<std::string> mPrefixes;
    Signal<> mOnQuit;
    Signal<const std::string&, std::string&&> mOnCommand;
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
