#ifndef SCHEDULE_H
#define SCHEDULE_H

#include <cstdint>
#include <vector>
#include <chrono>
#include <event/Loop.h>

class ScheduleTimer;

class Schedule
{
public:
    struct Entry
    {
    public:
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
    add(const Entry& entry, T&& func);

    void realize();

private:
    struct EntryData
    {
        std::shared_ptr<reckoning::event::Loop::Timer> timer;
        std::function<void()> function;
    };

    std::vector<std::pair<Entry, EntryData> > mEntries;

    friend class ScheduleTimer;
};

template<typename T>
inline typename std::enable_if<std::is_invocable_r<void, T>::value, void>::type
Schedule::add(const Entry& entry, T&& func)
{
    mEntries.push_back(std::make_pair(entry, EntryData { std::shared_ptr<reckoning::event::Loop::Timer>(), std::forward<T>(func) }));
}

#endif // SCHEDULE_H
