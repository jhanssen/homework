#ifndef SENSOR_H
#define SENSOR_H

#include <json.hpp>
#include <memory>

using nlohmann::json;

class Sensor
{
public:
    typedef std::shared_ptr<Sensor> SharedPtr;
    typedef std::weak_ptr<Sensor> WeakPtr;

    virtual ~Sensor() {}

    json get() const = 0;
};

#endif
