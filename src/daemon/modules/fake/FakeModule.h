#ifndef FAKEMODULE_H
#define FAKEMODULE_H

#include <Module.h>
#include <Controller.h>
#include <rct/List.h>

class FakeModule : public Module
{
public:
    FakeModule();
    ~FakeModule();

    virtual void initialize();

private:
    List<Controller::WeakPtr> mControllers;
    List<Sensor::WeakPtr> mSensors;
};

#endif
