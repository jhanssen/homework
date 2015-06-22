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

    Module(const String& name, const Value& state = Value()) : mName(name), mState(state) {}
    virtual ~Module() {}

    virtual void initialize() = 0;
    virtual void configure(const Value& value) { }

    String name() const { return mName; }
    Value state() const { return mState; }

    enum LogLevel { Debug, Info, Warning, Error };
    Signal<std::function<void(LogLevel, const String&, const String&)> >& log() { return mLog; }

    Signal<std::function<void(const Value&, const Value&)> >& stateChanged() { return mStateChanged; }

protected:
    Value configuration(const String& name) const;
    void log(LogLevel level, const String& msg);
    void changeState(const Value& value);

private:
    String mName;
    Value mState;
    Signal<std::function<void(LogLevel, const String&, const String&)> > mLog;
    Signal<std::function<void(const Value&, const Value&)> > mStateChanged;
};

inline void Module::log(LogLevel level, const String& msg)
{
    mLog(level, mName, msg);
}

inline void Module::changeState(const Value& value)
{
    const Value old = mState;
    mState = value;
    mStateChanged(value, old);
}

#endif
