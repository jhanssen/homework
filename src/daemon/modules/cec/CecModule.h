#ifndef CECMODULE_H
#define CECMODULE_H

#include <Module.h>

class CecModule : public Module
{
public:
    CecModule();
    ~CecModule();

    virtual void initialize();
};

#endif
