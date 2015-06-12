#ifndef ZWAYMODULE_H
#define ZWAYMODULE_H

#include <Module.h>
#include <Controller.h>
#include <rct/List.h>

class ZWayModule : public Module
{
public:
    ZWayModule();
    ~ZWayModule();

    virtual void initialize();

private:
    List<Controller::WeakPtr> mControllers;
    List<Sensor::WeakPtr> mSensors;
};

#endif
