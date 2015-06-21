#ifndef ZWAYMODULE_H
#define ZWAYMODULE_H

#include <Module.h>
#include <Controller.h>
#include <rct/List.h>

class ZWayThread;

class ZWayModule : public Module
{
public:
    ZWayModule();
    ~ZWayModule();

    virtual void initialize();

private:
    ZWayThread* mThread;
    List<Controller::WeakPtr> mControllers;
    List<Sensor::WeakPtr> mSensors;

    friend class ZWayThread;
};

#endif
