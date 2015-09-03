#include <Alarm.h>
#include <string.h>
#include <rct/Thread.h>
#include <rct/List.h>
#include <rct/Rct.h>
#include <rct/Log.h>
#include <mutex>
#include <condition_variable>

class AlarmThread : public Thread
{
public:
    static std::shared_ptr<AlarmThread> instance();

    void add(Alarm* alarm);
    void remove(Alarm* alarm);

protected:
    void run();

private:
    AlarmThread();

    void resort();

    static int64_t alarmTime(const Alarm* alarm);

    static std::shared_ptr<AlarmThread> inst;

    std::mutex mutex;
    std::condition_variable cond;
    bool needRecalc;

    struct Data
    {
        Alarm* alarm;
    };

    List<Data> datas;
};

std::shared_ptr<AlarmThread> AlarmThread::inst;

std::shared_ptr<AlarmThread> AlarmThread::instance()
{
    if (!inst) {
        inst.reset(new AlarmThread);
        inst->start();
    }
    return inst;
}

AlarmThread::AlarmThread()
    : needRecalc(false)
{
}

void AlarmThread::resort()
{
    auto cmp = [](const Data& a, const Data& b) {
        return (AlarmThread::alarmTime(a.alarm) < AlarmThread::alarmTime(b.alarm));
    };
    std::sort(datas.begin(), datas.end(), cmp);
}

int64_t AlarmThread::alarmTime(const Alarm* alarm)
{
    if (alarm->sec != 0) { // just seconds
        return (alarm->last - Rct::monoMs()) + (alarm->sec * 1000);
    }

    enum { Delta = 1 };

    time_t epoch, when;
    do {
        epoch = ::time(0);
        when = alarm->date.time();
    } while (::time(0) - epoch >= Delta);

    return (when - epoch) * 1000;
}

void AlarmThread::add(Alarm* alarm)
{
    std::lock_guard<std::mutex> locker(mutex);
    datas.append({ alarm });
    resort();
    needRecalc = true;
    cond.notify_one();
}

void AlarmThread::remove(Alarm* alarm)
{
    std::lock_guard<std::mutex> locker(mutex);
    // bleh
    auto it = datas.begin();
    while (it != datas.end()) {
        if (it->alarm == alarm) {
            datas.erase(it);
            return;
        }
        ++it;
    }
}

void AlarmThread::run()
{
    std::unique_lock<std::mutex> locker(mutex);
    int64_t timeout = -1;
    enum { WaitFor = 1000, Delta = 5000 };
    for (;;) {
        // 1. calculate next timeout, fire timers while next timeout < 0
        // 2. sleep for X seconds
        // 3. if time change is detected we need to assume we're past our time
        // 4. if we're past our time goto 1
        // 5. if we're not past our time, goto 2
        needRecalc = false;
        for (;;) {
            if (datas.empty()) {
                timeout = -1;
                break;
            }
            timeout = alarmTime(datas.first().alarm);
            if (timeout <= 0) { // time to fire
                datas.first().alarm->fire();
                if (datas.first().alarm->mode == Alarm::Mode::Single) {
                    datas.first().alarm->expire();
                    datas.removeFirst();
                } else {
                    resort();
                }
            } else {
                break;
            }
        }
        if (timeout < 0) { // sleep forever
            cond.wait(locker);
        } else { // sleep until
            const uint64_t monoNow = Rct::monoMs();
            do {
                const uint64_t timeNow = Rct::currentTimeMs();
                cond.wait_for(locker, std::chrono::milliseconds(WaitFor));
                if (needRecalc || Rct::currentTimeMs() - timeNow > Delta) {
                    // time change?
                    break;
                }
            } while (Rct::monoMs() - monoNow < timeout);
        }
    }
}

Alarm::Alarm()
    : sec(0)
{
}

Alarm::~Alarm()
{
    remove();
}

Alarm::SharedPtr Alarm::create(const Date& date)
{
    Alarm::SharedPtr alarm(new Alarm);
    alarm->date = date;
    alarm->mode = Mode::Single;
    alarm->last = 0;
    return alarm;
}

Alarm::SharedPtr Alarm::create(int seconds, Mode mode)
{
    Alarm::SharedPtr alarm(new Alarm);
    alarm->sec = seconds;
    alarm->mode = mode;
    alarm->last = Rct::monoMs();
    return alarm;
}

void Alarm::start()
{
    loop = EventLoop::eventLoop();
    add();
}

void Alarm::stop()
{
    remove();
}

void Alarm::fire()
{
    if (EventLoop::SharedPtr l = loop.lock()) {
        last = Rct::monoMs();
        Alarm::WeakPtr weak = shared_from_this();
        l->callLater([weak]() {
                if (Alarm::SharedPtr alarm = weak.lock()) {
                    alarm->mFired(alarm);
                }
            });
    }
}

void Alarm::expire()
{
    if (EventLoop::SharedPtr l = loop.lock()) {
        last = Rct::monoMs();
        Alarm::WeakPtr weak = shared_from_this();
        l->callLater([weak]() {
                if (Alarm::SharedPtr alarm = weak.lock()) {
                    alarm->mExpired(alarm);
                }
            });
    }
}

void Alarm::add()
{
    AlarmThread::instance()->add(this);
}

void Alarm::remove()
{
    AlarmThread::instance()->remove(this);
    mExpired(shared_from_this());
}
