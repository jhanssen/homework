#ifndef MODULE_H
#define MODULE_H

#include <memory>
#include <rct/String.h>
#include <rct/Value.h>
#include <rct/SignalSlot.h>

class Module
{
public:
    typedef std::shared_ptr<Module> SharedPtr;
    typedef std::weak_ptr<Module> WeakPtr;

    Module() {}
    virtual ~Module() {}

    virtual void initialize() = 0;

    enum LogLevel { Debug, Info, Warning, Error };
    Signal<std::function<void(LogLevel, const String&)> >& log() { return mLog; }

protected:
    Value configuration(const String& name) const;

protected:
    Signal<std::function<void(LogLevel, const String&)> > mLog;
};

#endif
