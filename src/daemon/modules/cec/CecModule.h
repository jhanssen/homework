#ifndef CECMODULE_H
#define CECMODULE_H

#include <Module.h>

namespace CEC {
class libcec_configuration;
};

class CecModule : public Module
{
public:
    CecModule();
    ~CecModule();

    virtual void initialize();

private:
    CEC::libcec_configuration* mCecConfig;
};

#endif
