#ifndef SCHEDULE_H
#define SCHEDULE_H

#include <cstdint>
#include <vector>
#include <chrono>

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

    void add(const Entry& entry);

    void realize();

private:
    std::vector<Entry> mEntries;
};

inline void Schedule::add(const Entry& entry)
{
    mEntries.push_back(entry);
}

#endif // SCHEDULE_H
