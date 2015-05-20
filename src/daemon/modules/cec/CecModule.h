#ifndef CECMODULE_H
#define CECMODULE_H

#include <Module.h>
#include <rct/List.h>

namespace CEC {
class libcec_configuration;
class ICECAdapter;
class ICECCallbacks;
};

class CecController;

class CecModule : public Module
{
public:
    CecModule();
    ~CecModule();

    virtual void initialize();

private:
    CEC::libcec_configuration* mCecConfig;
    CEC::ICECAdapter* mAdapter;
    CEC::ICECCallbacks* mCallbacks;

    friend class CecController;
};

#endif
