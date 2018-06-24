#ifndef SUNRISE_H
#define SUNRISE_H

#include <Event.h>
#include <util/Creatable.h>
#include <chrono>
#include <string>

class Sun : public std::enable_shared_from_this<Sun>, public reckoning::util::Creatable<Sun>
{
public:
    void setPosition(double lat, double lon);

    struct Entry
    {
        enum When {
            Today,
            Tomorrow,
            Date
        };
        enum Mode {
            Singleshot,
            Repeat
        };

        std::string name;
        When when;
        Mode mode;
        int year, month, day;
        std::chrono::minutes adjust;
    };

    enum Type {
        Sunrise,
        Sunset,
        SunsetStart,
        SunriseEnd,
        Dawn,
        Dusk,
        NauticalDawn,
        NauticalDusk,
        Night,
        NightEnd,
        GoldenHour,
        GoldenHourEnd
    };
    std::shared_ptr<Event> add(Type type, Entry&& entry);

    void remove(const std::shared_ptr<Entry>& entry);
    void remove(const std::string& name);

    bool isActive(const std::shared_ptr<Entry>& entry) const;
    void pause(const std::shared_ptr<Entry>& entry);
    void resume(const std::shared_ptr<Entry>& entry);

    std::vector<std::pair<Type, std::shared_ptr<Entry> > > entries() const;

protected:
    Sun();

private:
    struct EntryData
    {
        bool repeats;
        double lat, lon, angle;
        std::chrono::minutes adjust;
        std::shared_ptr<reckoning::event::Loop::Timer> timer;
        std::function<std::chrono::milliseconds(bool, bool*)> next;
        std::shared_ptr<Event> event;
    };

    static void makeTimer(const std::shared_ptr<reckoning::event::Loop>& loop,
                          const std::shared_ptr<EntryData>& data, bool advance);

    double mLat, mLon;
    std::vector<std::tuple<Type, std::shared_ptr<Entry>, std::shared_ptr<EntryData> > > mEntries;
};

inline Sun::Sun()
    : mLat(1000), mLon(1000)
{
}

inline void Sun::setPosition(double lat, double lon)
{
    mLat = lat;
    mLon = lon;
}

#endif // SUNRISE_H
