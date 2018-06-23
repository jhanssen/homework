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

private:
    std::chrono::milliseconds calculateWhen(double secondsFromMidnight, std::chrono::milliseconds delta, bool* ok);

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
