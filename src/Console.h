#ifndef CONSOLE_H
#define CONSOLE_H

#include <thread>
#include <mutex>
#include <condition_variable>
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
    Console(const std::vector<std::string>& prefixes);
    ~Console();

    Signal<>& onQuit();
    Signal<const std::string&, std::string&&>& onCommand();

    void wakeup();

    class Completion
    {
    public:
        std::string prefix() const;
        std::string buffer() const;
        size_t cursorPosition() const;

        void complete();
        void complete(std::string&& result, size_t offset = 0);
        void complete(std::vector<std::string>&& alternatives, size_t offset);

    private:
        static std::shared_ptr<Completion> create(const std::string& prefix, std::string&& buffer, size_t position);
        void wait();

    private:
        std::mutex mMutex;
        std::condition_variable mCond;

        std::string mPrefix, mBuffer;
        size_t mPosition, mOffset;

        std::vector<std::string> mAlternatives;
        bool mCompleted;

        friend class Console;
    };
    Signal<const std::shared_ptr<Completion>&>& onCompletionRequest();

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
    Signal<const std::shared_ptr<Completion>&> mOnCompletionRequest;
    History* mHistory;
    EditLine* mEditLine;
    std::string mHistoryFile, mPrompt, mPrefix;
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

inline Signal<const std::shared_ptr<Console::Completion>&>& Console::onCompletionRequest()
{
    return mOnCompletionRequest;
}

inline std::shared_ptr<Console::Completion> Console::Completion::create(const std::string& prefix, std::string&& buffer, size_t position)
{
    std::shared_ptr<Completion> completion(new Completion);
    completion->mPrefix = prefix;
    completion->mBuffer = std::forward<std::string>(buffer);
    completion->mPosition = position;
    completion->mOffset = 0;
    completion->mCompleted = false;
    return completion;
}

inline void Console::Completion::wait()
{
    std::unique_lock<std::mutex> locker(mMutex);
    while (!mCompleted) {
        mCond.wait(locker);
    }
}

inline std::string Console::Completion::prefix() const
{
    return mPrefix;
}

inline std::string Console::Completion::buffer() const
{
    return mBuffer;
}

inline size_t Console::Completion::cursorPosition() const
{
    return mPosition;
}

inline void Console::Completion::complete()
{
    std::unique_lock<std::mutex> locker(mMutex);
    mCompleted = true;
    mCond.notify_one();
}

inline void Console::Completion::complete(std::string&& result, size_t offset)
{
    std::unique_lock<std::mutex> locker(mMutex);
    mAlternatives.push_back(std::forward<std::string>(result));
    mOffset = offset;
    mCompleted = true;
    mCond.notify_one();
}

inline void Console::Completion::complete(std::vector<std::string>&& alternatives, size_t offset)
{
    std::unique_lock<std::mutex> locker(mMutex);
    mAlternatives = std::forward<std::vector<std::string> >(alternatives);
    mOffset = offset;
    mCompleted = true;
    mCond.notify_one();
}

#endif // CONSOLE_H
