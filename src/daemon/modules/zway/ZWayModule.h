#ifndef ZWAYMODULE_H
#define ZWAYMODULE_H

#include <Module.h>
#include <Controller.h>
#include <rct/List.h>

struct _ZWay;
struct _ZWLog;
typedef struct _ZWay *ZWay;
typedef struct _ZWLog *ZWLog;

class ZWayModule : public Module
{
public:
    ZWayModule();
    ~ZWayModule();

    virtual void initialize();

private:
    List<Controller::WeakPtr> mControllers;
    List<Sensor::WeakPtr> mSensors;

    ZWay mZway;
    ZWLog mZwlog;
};

#endif
