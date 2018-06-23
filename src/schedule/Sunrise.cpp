#include <Sunrise.h>
#include <event/Loop.h>
#include <log/Log.h>
#include <date/tz.h>
#include <cmath>

using namespace date;
using namespace std::chrono;
using namespace reckoning::event;
using namespace reckoning::log;

double Sunrise::sLat = 1000;
double Sunrise::sLon = 1000;
int Sunrise::sTz = floor<hours>(make_zoned(current_zone(), system_clock::now()).get_info().offset).count();

// code converted from JS, source: https://github.com/mourner/suncalc/blob/master/suncalc.js
// original license: BSD 2-clause
static constexpr const double rad = M_PI / 180.;
static constexpr const double obliquity = rad * 23.4397;

static constexpr const double J1970 = 2440588.;
static constexpr const double J2000 = 2451545.;
static constexpr const double J0 = 0.0009;

static constexpr const double secondsPerDay = 60 * 60 * 24;

static inline double declination(double l, double b) { return asin(sin(b) * cos(obliquity) + cos(b) * sin(obliquity) * sin(l)); }
static inline double solarMeanAnomaly(double d) { return rad * (357.5291 + 0.98560028 * d); }
static inline double eclipticLongitude(double M) {

    const double C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)); // equation of center
    constexpr const double P = rad * 102.9372; // perihelion of the Earth

    return M + C + P + M_PI;
}

static inline double toJulian(const year_month_day& ymd)
{
    const double days = (sys_days{ymd} - sys_days{year{1970}/month{1}/day{1}}).count();
    const double julian = days - 0.5 + J1970;
    return julian;
}

static inline double toDays(const year_month_day& ymd)
{
    return toJulian(ymd) - J2000;
}

static inline seconds fromJulian(double j)
{
    return seconds{static_cast<int64_t>((j + 0.5 - J1970) * secondsPerDay)};
}

static inline double julianCycle(double d, double lw) { return round(d - J0 - lw / (2 * M_PI)); }

static inline double approxTransit(double Ht, double lw, double n) { return J0 + (Ht + lw) / (2 * M_PI) + n; }
static inline double solarTransitJ(double ds, double M, double L)  { return J2000 + ds + 0.0053 * sin(M) - 0.0069 * sin(2 * L); }

static inline double hourAngle(double h, double phi, double d) { return acos((sin(h) - sin(phi) * sin(d)) / (cos(phi) * cos(d))); }

// returns set time for the given sun altitude
static inline double getSetJ(double h, double lw, double phi, double dec, double n, double M, double L) {

    const double w = hourAngle(h, phi, dec);
    const double a = approxTransit(w, lw, n);
    return solarTransitJ(a, M, L);
}

struct Time
{
    double angle;
    const char* morningName;
    const char* eveningName;
};

static constexpr const Time times[] = {
    { -0.833, "sunrise", "sunset" },
    { -0.3, "sunriseEnd", "sunsetStart" },
    { -6, "dawn", "dusk" },
    { -12, "nauticalDawn", "nauticalDusk" },
    { -18, "nightEnd", "night" },
    { 6, "goldenHourEnd", "goldenHour" }
};

static inline void getTimeForAngle(double angle, const year_month_day& ymd, double lat, double lng,
                                   double* rise, double* set)
{
    auto convertFrom1970 = [&ymd](const seconds& since1970) -> double {
        const auto diff = duration_cast<seconds>(sys_days{ymd} - sys_days{year{1970}/month{1}/day{1}});
        assert(since1970 >= diff);
        assert((since1970 - diff).count() <= secondsPerDay);
        return (since1970 - diff).count();
    };

    const double lw = rad * -lng;
    const double phi = rad * lat;

    const double d = toDays(ymd);
    const double n = julianCycle(d, lw);
    const double ds = approxTransit(0, lw, n);

    const double M = solarMeanAnomaly(ds);
    const double L = eclipticLongitude(M);
    const double dec = declination(L, 0);

    const double Jnoon = solarTransitJ(ds, M, L);

    const double Jset = getSetJ(angle * rad, lw, phi, dec, n, M, L);

    if (rise) {
        const double Jrise = Jnoon - (Jset - Jnoon);
        *rise = convertFrom1970(fromJulian(Jrise));
    }
    if (set)
        *set = convertFrom1970(fromJulian(Jset));
}

static inline double getSunrise(const year_month_day& ymd, double lat, double lng)
{
    double rise;
    getTimeForAngle(times[0].angle, ymd, lat, lng, &rise, nullptr);
    return rise;
}

static inline double getSunset(const year_month_day& ymd, double lat, double lng)
{
    double set;
    getTimeForAngle(times[0].angle, ymd, lat, lng, nullptr, &set);
    return set;
}

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

milliseconds Sunrise::calculateWhen(double minutesFromMidnight, milliseconds delta, bool* ok)
{
    const year_month_day today(floor<days>(system_clock::now() + hours{sTz}));
    const year_month_day date = year{mYear}/month{mMonth}/day{mDay};
    const auto fromMidnight = minutes{static_cast<int64_t>(minutesFromMidnight)};

    milliseconds when;
    if (today == date) {
        // 1. find the delta between start of today and now
        // 2. add the time from now until sunrise/sunset and our delta
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
    const year_month_day ymd = year{mYear}/month{mMonth}/day{mDay};
    const auto when = calculateWhen(getSunrise(ymd, sLat, sLon), delta, &ok);
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
    const year_month_day ymd = year{mYear}/month{mMonth}/day{mDay};
    const auto when = calculateWhen(getSunset(ymd, sLat, sLon), delta, &ok);
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
