#ifndef ALARM_H
#define ALARM_H

#include <memory>
#include <rct/EventLoop.h>
#include <rct/SignalSlot.h>

class Alarm : public std::enable_shared_from_this<Alarm>
{
public:
    typedef std::shared_ptr<Alarm> SharedPtr;
    typedef std::weak_ptr<Alarm> WeakPtr;

    struct Time
    {
        size_t year, month, day;
        size_t hour, minute, second;
    };

    enum class Mode { Single, Repeat };

    ~Alarm();

    static SharedPtr create();

    void start(const Time& time);
    void start(size_t seconds, Mode mode = Mode::Single);
    void stop();

    Signal<std::function<void(const SharedPtr&)> >& fired() { return mFired; }

private:
    Alarm();
    Alarm(const Alarm&) = delete;
    Alarm& operator=(const Alarm&) = delete;

    void add();
    void remove();
    void fire();

private:
    Time time;
    Mode mode;
    uint64_t last;
    EventLoop::WeakPtr loop;
    Signal<std::function<void(const SharedPtr&)> > mFired;

    friend class AlarmThread;
};

#endif
