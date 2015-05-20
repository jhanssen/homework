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

    Module(const String& name) : mName(name) {}
    virtual ~Module() {}

    virtual void initialize() = 0;

    enum LogLevel { Debug, Info, Warning, Error };
    Signal<std::function<void(LogLevel, const String&, const String&)> >& log() { return mLog; }

protected:
    Value configuration(const String& name) const;
    void log(LogLevel level, const String& msg);

private:
    String mName;
    Signal<std::function<void(LogLevel, const String&, const String&)> > mLog;
};

inline void Module::log(LogLevel level, const String& msg)
{
    mLog(level, mName, msg);
}

#endif
