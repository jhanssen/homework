#ifndef MODULE_H
#define MODULE_H

#include <memory>

class Module
{
public:
    typedef std::shared_ptr<Module> SharedPtr;
    typedef std::weak_ptr<Module> WeakPtr;

    Module() {}
    virtual ~Module() {}

    virtual void initialize() = 0;
};

#endif
