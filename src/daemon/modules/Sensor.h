#ifndef SENSOR_H
#define SENSOR_H

#include <rct/SignalSlot.h>
#include <rct/String.h>
#include <rct/Value.h>
#include <JsonValue.h>
#include <memory>

class Sensor : public std::enable_shared_from_this<Sensor>
{
public:
    typedef std::shared_ptr<Sensor> SharedPtr;
    typedef std::weak_ptr<Sensor> WeakPtr;

    Sensor(const String& name = String());
    virtual ~Sensor() {}

    virtual Value describe() const = 0;
    virtual Value get() const = 0;
    virtual void configure(const Value&) { }
    virtual bool isPersistent() const { return true; }

    void setName(const String& name);
    String name() const;

    Signal<std::function<void(const Sensor::SharedPtr&, const Value&)> >& stateChanged() { return mStateChanged; }

protected:
    Signal<std::function<void(const Sensor::SharedPtr&, const Value&)> > mStateChanged;

private:
    String mName;
};

inline Sensor::Sensor(const String& name)
    : mName(name)
{
}

inline void Sensor::setName(const String& name)
{
    mName = name;
}

inline String Sensor::name() const
{
    return mName;
}

inline bool operator<(const Sensor::WeakPtr& a, const Sensor::WeakPtr& b)
{
    return a.owner_before(b);
}

#endif
