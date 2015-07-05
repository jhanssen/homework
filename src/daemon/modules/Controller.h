#ifndef CONTROLLER_H
#define CONTROLLER_H

#include "Sensor.h"
#include <rct/Value.h>
#include <memory>

class Controller : public Sensor
{
public:
    typedef std::shared_ptr<Controller> SharedPtr;
    typedef std::weak_ptr<Controller> WeakPtr;

    Controller(const String& name = String());
    virtual ~Controller() {}

    virtual void set(const Value& value) = 0;
};

inline Controller::Controller(const String& name)
    : Sensor(name)
{
}

inline bool operator<(const Controller::WeakPtr& a, const Controller::WeakPtr& b)
{
    return a.owner_before(b);
}

#endif
