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

milliseconds Sunrise::calculateWhen(double secondsFromMidnight, milliseconds delta, bool* ok)
{
    const year_month_day today(floor<days>(system_clock::now() + hours{sTz}));
    const year_month_day date = year{mYear}/month{mMonth}/day{mDay};
    const auto fromMidnight = seconds{static_cast<int64_t>(secondsFromMidnight)};

    std::chrono::milliseconds when;
    if (today == date) {
        // 1. find the delta between start of today and now
        // 2. add the time from midnight until sunrise/sunset and our delta
        const auto now = system_clock::now() + hours{sTz};
        const auto startOfDay = floor<days>(now);
        const auto secondsFromStartOfDay = duration_cast<seconds>(now - startOfDay);
        if (fromMidnight + delta >= secondsFromStartOfDay) {
            when = fromMidnight + delta - secondsFromStartOfDay;
        } else {
            *ok = false;
            return milliseconds{0};
        }
    } else if (date > today) {
        // 1. find the delta between now and the start of tomorrow
        // 2. add the delta from the start of tomorrow until the start of our target day
        // 3. add the time from midnight until sunrise/sunset and our delta
        const auto now = system_clock::now() + hours{sTz};
        const auto startOfTomorrow = ceil<days>(now);
        const auto secondsUntilTomorrow = duration_cast<seconds>(startOfTomorrow - now);
        const auto daysUntilDate = sys_days{date} - startOfTomorrow;
        when = fromMidnight + delta + secondsUntilTomorrow + daysUntilDate;
    } else {
        // date is in the past
        *ok = false;
        return milliseconds{0};
    }
    *ok = true;
    return when;
}

std::shared_ptr<Event> Sunrise::sunrise(const std::string& name, minutes delta)
{
    if (sLat > 180 || sLat < -180 || sLon > 180 || sLon < -180) {
        Log(Log::Error) << "Latitude/longitude out of range" << sLat << sLon;
        return std::shared_ptr<Event>();
    }

    bool ok;
    SunSet ss;
    ss.setPosition(sLat, sLon, sTz);
    ss.setCurrentDate(mYear, mMonth, mDay);

    const auto when = calculateWhen(ss.calcSunrise(), delta, &ok);
    if (!ok)
        return std::shared_ptr<Event>();

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

    bool ok;
    SunSet ss;
    ss.setPosition(sLat, sLon, sTz);
    ss.setCurrentDate(mYear, mMonth, mDay);

    const auto when = calculateWhen(ss.calcSunset(), delta, &ok);
    if (!ok)
        return std::shared_ptr<Event>();

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
