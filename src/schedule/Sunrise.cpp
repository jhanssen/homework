#include <Sunrise.h>
#include <SunSet.h>
#include <event/Loop.h>
#include <log/Log.h>
#include <date/tz.h>

using namespace date;
using namespace std::chrono;
using namespace reckoning::event;
using namespace reckoning::log;

double Sunrise::sLat = 1000;
double Sunrise::sLon = 1000;
int Sunrise::sTz = floor<hours>(make_zoned(current_zone(), system_clock::now()).get_info().offset).count();

Sunrise::Sunrise(When w)
{
    year_month_day ymd;
    switch (w) {
    case Today:
        ymd = floor<days>(system_clock::now() + hours{sTz});
        break;
    case Tomorrow:
        ymd = ceil<days>(system_clock::now() + hours{sTz});
        break;
    }
    mYear = static_cast<int>(ymd.year());
    mMonth = static_cast<unsigned>(ymd.month());
    mDay = static_cast<unsigned>(ymd.day());
}

std::shared_ptr<Event> Sunrise::sunrise(const std::string& name, minutes delta)
{
    if (sLat > 180 || sLat < -180 || sLon > 180 || sLon < -180) {
        Log(Log::Error) << "Latitude/longitude out of range" << sLat << sLon;
        return std::shared_ptr<Event>();
    }

    const year_month_day today(floor<days>(system_clock::now() + hours{sTz}));
    const year_month_day date = year{mYear}/month{mMonth}/day{mDay};

    SunSet ss;
    ss.setPosition(sLat, sLon, sTz);
    ss.setCurrentDate(mYear, mMonth, mDay);

    const auto rise = seconds{static_cast<int64_t>(ss.calcSunrise())};

    std::chrono::milliseconds when;
    if (today == date) {
        const auto now = system_clock::now() + hours{sTz};
        const auto startOfDay = floor<days>(now); // start of day
        const auto secondsFromStartOfDay = duration_cast<seconds>(now - startOfDay);
        if (rise + delta >= secondsFromStartOfDay) {
            when = rise + delta - secondsFromStartOfDay;
        } else {
            return std::shared_ptr<Event>();
        }
    } else if (date > today) {
        // stuff
        const auto now = system_clock::now() + hours{sTz};
        const auto startOfTomorrow = ceil<days>(now); // start of tomorrow
        const auto secondsUntilTomorrow = duration_cast<seconds>(startOfTomorrow - now);
        const auto daysUntilDate = sys_days{date} - startOfTomorrow;
        when = rise + delta + secondsUntilTomorrow + daysUntilDate;
    } else {
        // date is in the past
        return std::shared_ptr<Event>();
    }

    // we have our time
    auto loop = Loop::loop();
    if (!loop) {
        Log(Log::Error) << "couldn't get loop for sunrise";
        return std::shared_ptr<Event>();
    }

    auto event = Event::create(name);
    loop->addTimer(when,
                   [event]() {
                       event->trigger();
                   });
    return event;
}

std::shared_ptr<Event> Sunrise::sunset(const std::string& name, minutes delta)
{
    if (sLat > 180 || sLat < -180 || sLon > 180 || sLon < -180) {
        Log(Log::Error) << "Latitude/longitude out of range" << sLat << sLon;
        return std::shared_ptr<Event>();
    }

    const year_month_day today(floor<days>(system_clock::now() + hours{sTz}));
    const year_month_day date = year{mYear}/month{mMonth}/day{mDay};

    SunSet ss;
    ss.setPosition(sLat, sLon, sTz);
    ss.setCurrentDate(mYear, mMonth, mDay);

    const auto set = seconds{static_cast<int64_t>(ss.calcSunset())};

    std::chrono::milliseconds when;
    if (today == date) {
        const auto now = system_clock::now() + hours{sTz};
        const auto startOfDay = floor<days>(now); // start of day
        const auto secondsFromStartOfDay = duration_cast<seconds>(now - startOfDay);
        if (set + delta >= secondsFromStartOfDay) {
            when = set + delta - secondsFromStartOfDay;
        } else {
            return std::shared_ptr<Event>();
        }
    } else if (date > today) {
        // stuff
        const auto now = system_clock::now() + hours{sTz};
        const auto startOfTomorrow = ceil<days>(now); // start of tomorrow
        const auto secondsUntilTomorrow = duration_cast<seconds>(startOfTomorrow - now);
        const auto daysUntilDate = sys_days{date} - startOfTomorrow;
        when = set + delta + secondsUntilTomorrow + daysUntilDate;
    } else {
        // date is in the past
        return std::shared_ptr<Event>();
    }

    // we have our time
    auto loop = Loop::loop();
    if (!loop) {
        Log(Log::Error) << "couldn't get loop for sunset";
        return std::shared_ptr<Event>();
    }

    auto event = Event::create(name);
    loop->addTimer(when,
                   [event]() {
                       event->trigger();
                   });
    return event;
}
