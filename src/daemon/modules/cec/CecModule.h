#ifndef CECMODULE_H
#define CECMODULE_H

#include <Module.h>
#include <rct/List.h>
#include <memory>

namespace CEC {
class libcec_configuration;
class ICECAdapter;
class ICECCallbacks;
};

class Controller;
class CecController;

class CecModule : public Module
{
public:
    CecModule();
    ~CecModule();

    virtual void initialize();

private:
    struct Connection
    {
        Connection(CecModule* module);
        ~Connection();

        CEC::libcec_configuration* cecConfig;
        CEC::ICECAdapter* adapter;
        CEC::ICECCallbacks* callbacks;

        CecModule* module;
        std::weak_ptr<Controller> controller;
    };
    List<std::shared_ptr<Connection> > mConnections;

    friend class CecController;
};

#endif
