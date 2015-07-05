#include <Alarm.h>
#include <string.h>
#include <rct/Thread.h>
#include <rct/List.h>
#include <rct/Rct.h>
#include <mutex>
#include <condition_variable>

struct AlarmThread : public Thread
{
public:
    static std::shared_ptr<AlarmThread> instance();

    void add(Alarm* alarm);
    void remove(Alarm* alarm);

protected:
    void run();

private:
    AlarmThread();

    static int64_t alarmTime(const Alarm* alarm);

    static std::shared_ptr<AlarmThread> inst;

    std::mutex mutex;
    std::condition_variable cond;

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
{
}

int64_t AlarmThread::alarmTime(const Alarm* alarm)
{
    if (!alarm->time.year) { // just seconds
        if (alarm->last > 0) {
            return (Rct::monoMs() - alarm->last) + (alarm->time.second * 1000);
        } else {
            return alarm->time.second * 1000;
        }
    }

    enum { Delta = 1000 };

    uint64_t epoch, when;
    do {
        epoch = Rct::currentTimeMs();

        struct tm timeinfo;
        memset(&timeinfo, '\0', sizeof(timeinfo));
        timeinfo.tm_year = alarm->time.year;
        timeinfo.tm_mon = alarm->time.month;
        timeinfo.tm_mday = alarm->time.day;
        timeinfo.tm_hour = alarm->time.hour;
        timeinfo.tm_min = alarm->time.minute;
        timeinfo.tm_sec = alarm->time.second;
        when = static_cast<uint64_t>(mktime(&timeinfo)) * 1000LLU;
    } while (Rct::currentTimeMs() - epoch >= Delta);

    return when - epoch;
}

void AlarmThread::add(Alarm* alarm)
{
    std::lock_guard<std::mutex> locker(mutex);
    datas.append({ alarm });
#warning sort list
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
    enum { WaitFor = 1000, Delta = 1000 };
    for (;;) {
        // 1. calculate next timeout, fire timers while next timeout < 0
        // 2. sleep for X seconds
        // 3. if time change is detected we need to assume we're past our time
        // 4. if we're past our time goto 1
        // 5. if we're not past our time, goto 2
        for (;;) {
            if (datas.empty()) {
                timeout = -1;
                break;
            }
            timeout = alarmTime(datas.first().alarm);
            if (timeout <= 0) { // time to fire
                datas.first().alarm->fire();
                if (datas.first().alarm->mode == Alarm::Mode::Single) {
                    datas.removeFirst();
                } else {
#warning resort list
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
                if (Rct::currentTimeMs() - timeNow > Delta) {
                    // time change?
                    break;
                }
            } while (Rct::monoMs() - monoNow >= timeout);
        }
    }
}

Alarm::Alarm()
{
    memset(&time, '\0', sizeof(time));
}

Alarm::~Alarm()
{
    remove();
}

Alarm::SharedPtr Alarm::create(const Time& time)
{
    Alarm::SharedPtr alarm(new Alarm);
    alarm->time = time;
    alarm->mode = Mode::Single;
    alarm->last = 0;
    alarm->add();
    return alarm;
}

Alarm::SharedPtr Alarm::create(size_t seconds, Mode mode)
{
    Alarm::SharedPtr alarm(new Alarm);
    alarm->time.second = seconds;
    alarm->mode = mode;
    alarm->last = 0;
    alarm->add();
    return alarm;
}

void Alarm::fire()
{
    last = Rct::monoMs();
    mFired(shared_from_this());
}

void Alarm::add()
{
    AlarmThread::instance()->add(this);
}

void Alarm::remove()
{
    AlarmThread::instance()->remove(this);
}