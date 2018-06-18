#include "Schedule.h"
#include <log/Log.h>
#include <date/date.h>
#include <date/tz.h>
#include <chrono>

using namespace std::chrono;
using namespace date;

using namespace reckoning;
using namespace reckoning::event;
using namespace reckoning::log;

class ScheduleTimer : public Loop::Timer
{
public:
    ScheduleTimer(std::chrono::milliseconds timeout, const std::shared_ptr<Schedule::Entry>& entry,
                  const std::shared_ptr<Schedule::EntryData>& data, const std::shared_ptr<Schedule>& schedule)
        : Timer(timeout), mEntry(entry), mData(data), mSchedule(schedule)
    {
    }

protected:
    virtual void execute() override
    {
        auto data = mData.lock();
        auto entry = mEntry.lock();
        if (!data || !entry) {
            if (data || entry) {
                Log(Log::Error) << "was able to lock one of data and entry but not both";
            }
            return;
        }
        auto schedule = mSchedule.lock();

        data->function();
        if (entry->repeat == Schedule::Entry::None) {
            if (schedule)
                schedule->removeEntry(entry);
            return;
        }

        auto loop = Loop::loop();
        if (schedule && loop) {
            schedule->realizeEntry(loop, entry, data);
        }
    }

private:
    std::weak_ptr<Schedule::Entry> mEntry;
    std::weak_ptr<Schedule::EntryData> mData;
    std::weak_ptr<Schedule> mSchedule;
};

bool Schedule::realizeEntry(const std::shared_ptr<Loop>& loop, const std::shared_ptr<Entry>& entry, const std::shared_ptr<EntryData>& data)
{
    static const auto utcOffset = floor<minutes>(make_zoned(current_zone(), system_clock::now()).get_info().offset);

    if (data->timer && data->timer->isActive())
        return true;

    auto makeTimer = [&entry, &data, &loop, this](int min) {
        if (min > 0) {
            // how many ms until top of the minute
            const auto now = system_clock::now();
            const auto when = ceil<minutes>(now);
            const auto delta = duration_cast<milliseconds>(when - now);

            auto timer = std::make_shared<ScheduleTimer>(milliseconds{min * 60 * 1000} - (minutes{1} - delta), entry, data, shared_from_this());
            data->timer = timer;
            loop->addTimer(std::move(timer));
        } else {
            auto timer = std::make_shared<ScheduleTimer>(milliseconds{0}, entry, data, shared_from_this());
            data->timer = timer;
            loop->addTimer(std::move(timer));
        }
    };

    assert(entry);
    auto& e = *entry;

    year_month_weekday wd(year{e.year}, month{e.month}, weekday_indexed(weekday{e.weekday}, e.weekno));
    year_month_day d(wd);
    year_month_day nowd(floor<days>(system_clock::now()));
    year_month_day nextd(ceil<days>(system_clock::now()));

    if (e.repeat == Entry::None) {
        const auto duration = static_cast<sys_days>(d) - static_cast<sys_days>(nowd);
        if (duration.count() < 0) {
            // nothing to do
            return false;
        }
        auto t = time_of_day<minutes>(minutes{e.minute} + hours{e.hour} - utcOffset);
        auto td = t.to_duration();
        auto tp = floor<minutes>(system_clock::now()); // now
        auto dp = floor<days>(tp); // start of day
        auto nowt = make_time(tp - dp); // time since start of day
        auto nowtd = nowt.to_duration();
        if (td < nowtd) {
            // nothing to do
            return false;
        }
        // printf("time delta (non-recurring minutes) %ld\n", (std::chrono::minutes{duration} + (td - nowtd)).count());
        makeTimer((std::chrono::minutes{duration} + (td - nowtd)).count());
        return true;
    }

    const bool dayDelta = (e.repeat == Entry::Day
                           || e.repeat == Entry::Week
                           || e.repeat == Entry::Month
                           || e.repeat == Entry::Year);

    // add recurrence until we're after now
    if (dayDelta) {
        auto compareto = nextd;
        if (d >= compareto)
            compareto = floor<days>(sys_days{d}) + days{1};

        while (d < compareto) {
            switch (e.repeat) {
            case Entry::Day:
                d = sys_days{d} + days{e.recurrence};
                break;
            case Entry::Week:
                d = sys_days{d} + weeks{e.recurrence};
                break;
            case Entry::Month:
                d += months{e.recurrence};
                break;
            case Entry::Year:
                d += years{e.recurrence};
                break;
            default:
                break;
            }
        }
        // what is the delta from now
        wd = year_month_weekday(d);
        e.year = static_cast<int>(wd.year());
        e.month = static_cast<unsigned int>(wd.month());
        e.weekday = (wd.weekday() - Sunday).count();
        e.weekno = wd.weekday_indexed().index();

        // right now
        auto nowm = floor<minutes>(system_clock::now());
        // std::ostringstream strm;
        // strm << nowm << " -- " << static_cast<sys_days>(d);
        // printf("hey %s\n", strm.str().c_str());
        auto duration = minutes{static_cast<sys_days>(d) - nowm};
        // add the hour and minute
        // printf("time until day change %ld\n", duration.count());
        auto next = duration + (hours{e.hour} + minutes{e.minute} - utcOffset);
        // printf("time delta (days) %ld\n", next.count());
        makeTimer(next.count());
    } else {
        // minute::hour

        auto t = time_of_day<minutes>(minutes{e.minute} + hours{e.hour} - utcOffset);
        auto td = t.to_duration();
        auto tp = floor<minutes>(system_clock::now()); // now
        auto dp = floor<days>(tp); // start of day
        auto nowt = make_time(tp - dp); // time since start of day
        auto nowtd = nowt.to_duration();
        auto compareto = nowtd;
        if (td > compareto)
            compareto = td;
        // add recurrence until we're on or after now
        while (td <= compareto) {
            switch (e.repeat) {
            case Entry::Hour:
                td += hours{e.recurrence};
                break;
            case Entry::Minute:
                td += minutes{e.recurrence};
                break;
            default:
                break;
            }
        }
        auto adjust = [](int first, int second, size_t adjust, size_t* added) -> size_t {
            *added = 0;
            auto res = first + second;
            while (res < 0)
                res += adjust;
            while (res >= adjust) {
                res -= adjust;
                ++(*added);
            }
            return static_cast<size_t>(res);
        };

        const int utcMin = utcOffset.count() % 60;
        const int utcHour = utcOffset.count() / 60;

        auto whenTime = make_time(td);

        size_t addedHours, addedDays;
        e.minute = adjust(whenTime.minutes().count(), utcMin, 60, &addedHours);
        e.hour = adjust(whenTime.hours().count() + addedHours, utcHour, 24, &addedDays);
        if (addedDays) {
            wd = sys_days{wd} + days{addedDays};
            e.year = static_cast<int>(wd.year());
            e.month = static_cast<unsigned int>(wd.month());
            e.weekday = (wd.weekday() - Sunday).count();
            e.weekno = wd.weekday_indexed().index();
            d = year_month_day{wd};
        }

        auto nowm = floor<minutes>(system_clock::now());
        auto duration = minutes{static_cast<sys_days>(d) - nowm};
        // add the hour and minute
        auto next = duration + (hours{e.hour} + minutes{e.minute} - utcOffset);
        // printf("time delta (hours) %ld\n", next.count());
        makeTimer(next.count());
    }
    return true;
}

void Schedule::realize()
{
    auto loop = Loop::loop();
    if (!loop) {
        Log(Log::Error) << "no current event loop";
        return;
    }

    auto e = mEntries.begin();
    auto end = mEntries.end();
    while (e != end) {
        if (!realizeEntry(loop, e->first, e->second)) {
            e = mEntries.erase(e);
            end = mEntries.end();
        } else {
            ++e;
        }
    }
}
