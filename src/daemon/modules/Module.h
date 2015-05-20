#ifndef MODULE_H
#define MODULE_H

#include <memory>
#include <rct/String.h>
#include <rct/Value.h>

class Module
{
public:
    typedef std::shared_ptr<Module> SharedPtr;
    typedef std::weak_ptr<Module> WeakPtr;

    Module() {}
    virtual ~Module() {}

    virtual void initialize() = 0;

protected:
    Value configuration(const String& name) const;
};

#endif
