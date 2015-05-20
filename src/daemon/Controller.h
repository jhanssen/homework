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

    virtual ~Controller() {}

    virtual void set(const Value& value) = 0;
};

#endif
