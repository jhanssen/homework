#ifndef SCHEDULE_H
#define SCHEDULE_H

#include <cstdint>
#include <vector>
#include <chrono>
#include <memory>
#include <string>
#include <event/Loop.h>

class ScheduleTimer;

class Schedule
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

    std::vector<std::shared_ptr<Entry> > entries() const;
    void removeEntry(const std::shared_ptr<Entry>& entry);
    void removeEntry(const std::string& name);

    void realize();

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

    static void realizeEntry(const std::shared_ptr<reckoning::event::Loop>& loop, const std::shared_ptr<Entry>& entry, const std::shared_ptr<EntryData>& data);

private:
    std::vector<std::pair<std::shared_ptr<Entry>, std::shared_ptr<EntryData> > > mEntries;

    friend class ScheduleTimer;
};

template<typename T>
inline typename std::enable_if<std::is_invocable_r<void, T>::value, void>::type
Schedule::add(Entry&& entry, T&& func)
{
    mEntries.push_back(std::make_pair(std::make_shared<Entry>(std::forward<Entry>(entry)), std::make_shared<EntryData>(std::shared_ptr<reckoning::event::Loop::Timer>(), std::forward<T>(func))));
}

inline std::vector<std::shared_ptr<Schedule::Entry> > Schedule::entries() const
{
    std::vector<std::shared_ptr<Entry> > ret;
    for (const auto& e : mEntries) {
        ret.push_back(e.first);
    }
    return ret;
}

inline void Schedule::removeEntry(const std::shared_ptr<Entry>& entry)
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

inline void Schedule::removeEntry(const std::string& name)
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

#endif // SCHEDULE_H
