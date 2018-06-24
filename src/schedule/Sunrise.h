#ifndef SUNRISE_H
#define SUNRISE_H

#include <Event.h>
#include <chrono>
#include <string>

class Sunrise
{
public:
    static void setPosition(double lat, double lon);

    enum When {
        Today,
        Tomorrow
    };
    Sunrise(When w = Today);
    Sunrise(int year, int month, int day);

    std::shared_ptr<Event> sunrise(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});
    std::shared_ptr<Event> sunset(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});

    std::shared_ptr<Event> sunriseEnd(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});
    std::shared_ptr<Event> sunsetStart(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});

    std::shared_ptr<Event> dawn(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});
    std::shared_ptr<Event> dusk(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});

    std::shared_ptr<Event> nauticalDawn(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});
    std::shared_ptr<Event> nauticalDusk(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});

    std::shared_ptr<Event> night(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});
    std::shared_ptr<Event> nightEnd(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});

    std::shared_ptr<Event> goldenHour(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});
    std::shared_ptr<Event> goldenHourEnd(const std::string& name, std::chrono::minutes delta = std::chrono::minutes{0});

    std::shared_ptr<Event> angleRise(const std::string& name, double angle, std::chrono::minutes delta = std::chrono::minutes{0});
    std::shared_ptr<Event> angleSet(const std::string& name, double angle, std::chrono::minutes delta = std::chrono::minutes{0});

private:
    std::chrono::milliseconds calculateWhen(double secondsFromMidnight, std::chrono::milliseconds delta, bool* ok);
    std::shared_ptr<Event> makeEvent(const std::string& name, std::chrono::milliseconds when);
    static bool verifyLatLon();

private:
    static double sLat, sLon;
    int mYear;
    unsigned int mMonth, mDay;
};

inline Sunrise::Sunrise(int year, int month, int day)
    : mYear(year), mMonth(month), mDay(day)
{
}

inline void Sunrise::setPosition(double lat, double lon)
{
    sLat = lat;
    sLon = lon;
}

#endif // SUNRISE_H
