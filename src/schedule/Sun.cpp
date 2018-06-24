#include <Sun.h>
#include <event/Loop.h>
#include <log/Log.h>
#include <date/tz.h>
#include <cmath>

using namespace date;
using namespace std::chrono;
using namespace reckoning::event;
using namespace reckoning::log;

static int sTz = floor<hours>(make_zoned(current_zone(), system_clock::now()).get_info().offset).count();

// code converted from JS, source: https://github.com/mourner/suncalc/blob/master/suncalc.js
// original license: BSD 2-clause
static constexpr const double rad = M_PI / 180.;
static constexpr const double obliquity = rad * 23.4397;

static constexpr const double J2000 = 2451545.;
static constexpr const double J0 = 0.0009;

static constexpr const double secondsPerDay = 60 * 60 * 24;
static constexpr const double secondsPerHour = 60 * 60;

static inline double declination(double l, double b) { return asin(sin(b) * cos(obliquity) + cos(b) * sin(obliquity) * sin(l)); }
static inline double solarMeanAnomaly(double d) { return rad * (357.5291 + 0.98560028 * d); }
static inline double eclipticLongitude(double M) {

    const double C = rad * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)); // equation of center
    constexpr const double P = rad * 102.9372; // perihelion of the Earth

    return M + C + P + M_PI;
}

static inline double toJulian(const year_month_day& ymd)
{
    const double days = (sys_days{ymd} - sys_days{year{2000}/month{1}/day{1}}).count() + 1;
    const double julian = days - 0.5 + J2000;
    return julian;
}

static inline double toDays(const year_month_day& ymd)
{
    return toJulian(ymd) - J2000;
}

static inline seconds fromJulian(double j)
{
    return seconds{static_cast<int64_t>((j + 0.5 - J2000) * secondsPerDay)};
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

static constexpr const double sunriseAngle = -0.833;
static constexpr const double sunriseEndAngle = -0.3;
static constexpr const double dawnAngle = -6;
static constexpr const double nauticalDawnAngle = -12;
static constexpr const double nightAngle = -18;
static constexpr const double goldenHourAngle = 6;

static inline void getTimeForAngle(double angle, const year_month_day& ymd,
                                   double lat, double lng,
                                   double* rise, double* set)
{
    auto convertFrom2k = [&ymd](const seconds& since2000) -> double {
        const auto diff = duration_cast<seconds>(sys_days{ymd} - sys_days{year{2000}/month{1}/day{1}});
        assert(since2000 >= diff);
        assert((since2000 - diff).count() <= secondsPerDay);
        return (since2000 - diff).count();
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
        *rise = convertFrom2k(fromJulian(Jrise));
    }
    if (set)
        *set = convertFrom2k(fromJulian(Jset));
}

static inline double getRise(double angle, const year_month_day& ymd, double lat, double lng)
{
    double rise;
    getTimeForAngle(angle, ymd, lat, lng, &rise, nullptr);
    return rise + (sTz * secondsPerHour);
}

static inline double getSet(double angle, const year_month_day& ymd, double lat, double lng)
{
    double set;
    getTimeForAngle(angle, ymd, lat, lng, nullptr, &set);
    return set + (sTz * secondsPerHour);
}

static inline milliseconds calculateWhen(double secondsFromMidnight,
                                         const year_month_day& date,
                                         milliseconds delta, bool* ok)
{
    const year_month_day today(floor<days>(system_clock::now() + hours{sTz}));
    const auto fromMidnight = seconds{static_cast<int64_t>(secondsFromMidnight)};

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

void Sun::makeTimer(const std::shared_ptr<Loop>& loop,
                    const std::shared_ptr<EntryData>& data, bool advance)
{
    bool ok;
    auto ms = data->next(advance, &ok);
    if (ok) {
        std::weak_ptr<EntryData> weakData = data;
        if (!data->repeats) {
            data->timer = loop->addTimer(ms, [weakData]() {
                    if (auto data = weakData.lock()) {
                        data->event->trigger();
                    }
                });
        } else {
            std::weak_ptr<Loop> weakLoop = loop;
            data->timer = loop->addTimer(ms, [weakData, weakLoop]() {
                    if (auto data = weakData.lock()) {
                        data->event->trigger();
                        if (auto loop = weakLoop.lock()) {
                            Sun::makeTimer(loop, data, true);
                        }
                    }
                });
        }
    }
}

std::shared_ptr<Event> Sun::add(Type type, Entry&& entry)
{
    if (mLat > 180 || mLat < -180 || mLon > 180 || mLon < -180) {
        Log(Log::Error) << "Latitude/longitude out of range" << mLat << mLon;
        return std::shared_ptr<Event>();
    }

    auto loop = Loop::loop();
    if (!loop) {
        Log(Log::Error) << "couldn't get loop for sun add";
        return std::shared_ptr<Event>();
    }

    year_month_day ymd;
    switch (entry.when) {
    case Entry::Today:
        ymd = floor<days>(system_clock::now() + hours{sTz});
        break;
    case Entry::Tomorrow:
        ymd = ceil<days>(system_clock::now() + hours{sTz});
        break;
    case Entry::Date:
        ymd = year{entry.year}/month{static_cast<unsigned>(entry.month)}/day{static_cast<unsigned>(entry.day)};
        break;
    }

    bool rise;
    double angle;
    switch (type) {
    case Sunrise:
        rise = true;
        angle = sunriseAngle;
        break;
    case Sunset:
        rise = false;
        angle = sunriseAngle;
        break;
    case SunsetStart:
        rise = false;
        angle = sunriseEndAngle;
        break;
    case SunriseEnd:
        rise = true;
        angle = sunriseEndAngle;
        break;
    case Dawn:
        rise = true;
        angle = dawnAngle;
        break;
    case Dusk:
        rise = false;
        angle = dawnAngle;
        break;
    case NauticalDawn:
        rise = true;
        angle = nauticalDawnAngle;
        break;
    case NauticalDusk:
        rise = false;
        angle = nauticalDawnAngle;
        break;
    case Night:
        rise = false;
        angle = nightAngle;
        break;
    case NightEnd:
        rise = true;
        angle = nightAngle;
        break;
    case GoldenHour:
        rise = false;
        angle = goldenHourAngle;
        break;
    case GoldenHourEnd:
        rise = true;
        angle = goldenHourAngle;
        break;
    }

    auto data = std::make_shared<EntryData>();
    data->lat = mLat;
    data->lon = mLon;
    data->angle = angle;
    data->adjust = entry.adjust;
    data->repeats = (entry.mode == Entry::Repeat);
    if (rise) {
        data->next = [ymd, data](bool advance, bool* ok) mutable {
            if (advance)
                ymd = sys_days{ymd} + days{1};
            const auto when = calculateWhen(getRise(data->angle, ymd, data->lat, data->lon),
                                            ymd, data->adjust, ok);
            if (!ok)
                return milliseconds{0};
            return when;
        };
    } else {
        data->next = [ymd, data](bool advance, bool* ok) mutable {
            if (advance)
                ymd = sys_days{ymd} + days{1};
            const auto when = calculateWhen(getSet(data->angle, ymd, data->lat, data->lon),
                                            ymd, data->adjust, ok);
            if (!ok)
                return milliseconds{0};
            return when;
        };
    }

    auto event = Event::create(entry.name);
    auto e = std::make_shared<Entry>(std::forward<Entry>(entry));

    data->event = event;

    makeTimer(loop, data, false);

    mEntries.push_back(std::make_tuple(type, e, data));

    return event;
}

void Sun::remove(const std::shared_ptr<Entry>& entry)
{
    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (std::get<1>(*e) == entry) {
            if (std::get<2>(*e)->timer)
                std::get<2>(*e)->timer->stop();
            mEntries.erase(e);
            return;
        }
        ++e;
    }
}

void Sun::remove(const std::string& name)
{
    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (std::get<1>(*e)->name == name) {
            if (std::get<2>(*e)->timer)
                std::get<2>(*e)->timer->stop();
            mEntries.erase(e);
            return;
        }
        ++e;
    }
}

bool Sun::isActive(const std::shared_ptr<Entry>& entry) const
{
    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (std::get<1>(*e) == entry) {
            const auto& t = std::get<2>(*e)->timer;
            return t && t->isActive();
        }
        ++e;
    }
    return false;
}

void Sun::pause(const std::shared_ptr<Entry>& entry)
{
    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (std::get<1>(*e) == entry) {
            const auto& t = std::get<2>(*e)->timer;
            if (t) {
                t->stop();
            }
            return;
        }
        ++e;
    }
}

void Sun::resume(const std::shared_ptr<Entry>& entry)
{
    auto e = mEntries.begin();
    const auto end = mEntries.cend();
    while (e != end) {
        if (std::get<1>(*e) == entry) {
            if (!std::get<2>(*e)->timer) {
                auto loop = Loop::loop();
                if (!loop) {
                    Log(Log::Error) << "couldn't get loop for sun resume";
                    return;
                }

                makeTimer(loop, std::get<2>(*e), false);
            }
            return;
        }
        ++e;
    }
}

std::vector<std::pair<Sun::Type, std::shared_ptr<Sun::Entry> > > Sun::entries() const
{
    std::vector<std::pair<Type, std::shared_ptr<Entry> > > es;
    for (const auto& e : mEntries) {
        es.push_back(std::make_pair(std::get<0>(e), std::get<1>(e)));
    }
    return es;
}
