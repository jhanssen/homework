#ifndef SCHEDULE_H
#define SCHEDULE_H

#include <cstdint>
#include <vector>
#include <chrono>
#include <memory>
#include <string>
#include <log/Log.h>
#include <event/Loop.h>
#include <util/Creatable.h>
#include <Event.h>

class ScheduleTimer;

class Schedule : public std::enable_shared_from_this<Schedule>, public reckoning::util::Creatable<Schedule>
{
public:
    struct Entry
    {
    public:
        std::string name;
        uint16_t year;
        uint8_t month : 4;
        uint8_t weekday : 3;
        uint8_t weekno : 3;
        uint8_t hour : 5;
        uint8_t minute : 6;

        enum Repeat {
            None,
            Minute,
            Hour,
            Day,
            Week,
            Month,
            Year
        };
        Repeat repeat;
        uint16_t recurrence;
    };

    template<typename T>
    typename std::enable_if<std::is_invocable_r<void, T>::value, void>::type
    add(Entry&& entry, T&& func);

    std::shared_ptr<Event> add(Entry&& entry);

    std::vector<std::shared_ptr<Entry> > entries() const;
    void remove(const std::shared_ptr<Entry>& entry);
    void remove(const std::string& name);

    bool isActive(const std::shared_ptr<Entry>& entry) const;
    void pause(const std::shared_ptr<Entry>& entry);
    void resume(const std::shared_ptr<Entry>& entry);

protected:
    Schedule() { }

private:
    struct EntryData
    {
        EntryData(std::shared_ptr<reckoning::event::Loop::Timer>&& t, std::function<void()>&& f)
            : timer(std::forward<std::shared_ptr<reckoning::event::Loop::Timer> >(t)), function(std::forward<std::function<void()> >(f))
        {
        }

        std::shared_ptr<reckoning::event::Loop::Timer> timer;
        std::function<void()> function;
    };

    bool realizeEntry(const std::shared_ptr<reckoning::event::Loop>& loop, const std::shared_ptr<Entry>& entry, const std::shared_ptr<EntryData>& data);

private:
    std::vector<std::pair<std::shared_ptr<Entry>, std::shared_ptr<EntryData> > > mEntries;

    friend class ScheduleTimer;
};

template<typename T>
inline typename std::enable_if<std::is_invocable_r<void, T>::value, void>::type
Schedule::add(Entry&& entry, T&& func)
{
    auto loop = reckoning::event::Loop::loop();
    if (!loop) {
        reckoning::log::Log(reckoning::log::Log::Error) << "no current event loop";
        return;
    }

    mEntries.push_back(std::make_pair(std::make_shared<Entry>(std::forward<Entry>(entry)), std::make_shared<EntryData>(std::shared_ptr<reckoning::event::Loop::Timer>(), std::forward<T>(func))));
    if (!realizeEntry(loop, mEntries.back().first, mEntries.back().second)) {
        mEntries.pop_back();
    }
}

inline std::shared_ptr<Event> Schedule::add(Entry&& entry)
{
    auto loop = reckoning::event::Loop::loop();
    if (!loop) {
        reckoning::log::Log(reckoning::log::Log::Error) << "no current event loop";
        return std::shared_ptr<Event>();
    }

    auto event = Event::create(entry.name);
    auto func = [event]() {
        event->trigger();
    };
    auto data = std::make_shared<EntryData>(std::shared_ptr<reckoning::event::Loop::Timer>(), std::move(func));
    mEntries.push_back(std::make_pair(std::make_shared<Entry>(std::forward<Entry>(entry)), std::move(data)));
    if (!realizeEntry(loop, mEntries.back().first, mEntries.back().second)) {
        mEntries.pop_back();
    }
    return event;
}

inline std::vector<std::shared_ptr<Schedule::Entry> > Schedule::entries() const
{
    std::vector<std::shared_ptr<Entry> > ret;
    for (const auto& e : mEntries) {
        ret.push_back(e.first);
    }
    return ret;
}

inline void Schedule::remove(const std::shared_ptr<Entry>& entry)
{
    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (e->first == entry) {
            if (e->second->timer)
                e->second->timer->stop();
            mEntries.erase(e);
            return;
        }
        ++e;
    }
}

inline void Schedule::remove(const std::string& name)
{
    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (e->first->name == name) {
            if (e->second->timer)
                e->second->timer->stop();
            mEntries.erase(e);
            return;
        }
        ++e;
    }
}

inline void Schedule::pause(const std::shared_ptr<Entry>& entry)
{
    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (e->first == entry) {
            if (e->second->timer) {
                e->second->timer->stop();
                e->second->timer.reset();
                return;
            }
        }
        ++e;
    }
}

inline void Schedule::resume(const std::shared_ptr<Entry>& entry)
{
    auto loop = reckoning::event::Loop::loop();
    if (!loop) {
        reckoning::log::Log(reckoning::log::Log::Error) << "no current event loop";
        return;
    }

    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (e->first == entry) {
            if (!e->second->timer || !e->second->timer->isActive())
                realizeEntry(loop, e->first, e->second);
            return;
        }
        ++e;
    }
}

inline bool Schedule::isActive(const std::shared_ptr<Entry>& entry) const
{
    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (e->first == entry) {
            return e->second->timer && e->second->timer->isActive();
        }
        ++e;
    }
    return false;
}

#endif // SCHEDULE_H
