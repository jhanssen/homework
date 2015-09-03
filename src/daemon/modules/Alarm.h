#ifndef ALARM_H
#define ALARM_H

#include <memory>
#include <rct/Date.h>
#include <rct/EventLoop.h>
#include <rct/SignalSlot.h>

class Alarm : public std::enable_shared_from_this<Alarm>
{
public:
    typedef std::shared_ptr<Alarm> SharedPtr;
    typedef std::weak_ptr<Alarm> WeakPtr;

    enum class Mode { Single, Repeat };

    ~Alarm();

    static SharedPtr create(const Date& time);
    static SharedPtr create(int seconds, Mode mode = Mode::Single);

    void start();
    void stop();

    Signal<std::function<void(const SharedPtr&)> >& fired() { return mFired; }
    Signal<std::function<void(const SharedPtr&)> >& expired() { return mExpired; }

private:
    Alarm();
    Alarm(const Alarm&) = delete;
    Alarm& operator=(const Alarm&) = delete;

    void add();
    void remove();
    void fire();
    void expire();

private:
    Date date;
    int sec;
    Mode mode;
    uint64_t last;
    EventLoop::WeakPtr loop;
    Signal<std::function<void(const SharedPtr&)> > mFired, mExpired;

    friend class AlarmThread;
};

#endif
