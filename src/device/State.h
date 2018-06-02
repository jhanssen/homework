#ifndef STATE_H
#define STATE_H

#include <event/Signal.h>
#include <util/Any.h>
#include <util/Creatable.h>
#include <memory>
#include <string>

using reckoning::event::Signal;
using reckoning::util::Creatable;

class Device;

class State : public std::enable_shared_from_this<State>, public Creatable<State>
{
public:
    enum StateType { Bool, Int, Double, String };

    StateType type() const;
    std::string name() const;
    std::shared_ptr<Device> device() const;

    template<typename T>
    T value() const;

    bool operator==(const std::any& value) const;

    Signal<std::shared_ptr<State>&&>& onStateChanged();

protected:
    explicit State(const std::string& name, bool value);
    explicit State(const std::string& name, int value);
    explicit State(const std::string& name, double value);
    explicit State(const std::string& name, const std::string& value);

    void changeState(std::any&& v);
    void setDevice(const std::shared_ptr<Device>&);

private:
    StateType mType;
    std::string mName;
    std::any mValue;
    Signal<std::shared_ptr<State>&&> mOnStateChanged;
    std::weak_ptr<Device> mDevice;

    friend class Device;
};

inline State::State(const std::string& name, bool value)
    : mType(Bool), mName(name), mValue(value)
{
}

inline State::State(const std::string& name, int value)
    : mType(Int), mName(name), mValue(value)
{
}

inline State::State(const std::string& name, double value)
    : mType(Double), mName(name), mValue(value)
{
}

inline State::State(const std::string& name, const std::string& value)
    : mType(String), mName(name), mValue(value)
{
}

inline State::StateType State::type() const
{
    return mType;
}

inline std::string State::name() const
{
    return mName;
}

template<typename T>
inline T State::value() const
{
    if (mValue.type() == typeid(T))
        return std::any_cast<T>(mValue);
    return T();
}

inline bool State::operator==(const std::any& value) const
{
    if (mValue.type() == value.type()) {
        switch (mType) {
        case Bool:
            return std::any_cast<bool>(mValue) == std::any_cast<bool>(value);
        case Int:
            return std::any_cast<int>(mValue) == std::any_cast<int>(value);
        case Double:
            return std::any_cast<double>(mValue) == std::any_cast<double>(value);
        case String:
            return std::any_cast<std::string>(mValue) == std::any_cast<std::string>(value);
        }
    }
    return false;
}

inline Signal<std::shared_ptr<State>&&>& State::onStateChanged()
{
    return mOnStateChanged;
}

inline void State::setDevice(const std::shared_ptr<Device>& device)
{
    mDevice = device;
}

inline std::shared_ptr<Device> State::device() const
{
    return mDevice.lock();
}

inline void State::changeState(std::any&& v)
{
#if defined(HAVE_ANY_CAST)
    assert(!mValue.has_value() || v.type() == mValue.type());
#elif defined(HAVE_EXPERIMENTAL_ANY_CAST)
    assert(!mValue.empty() || v.type() == mValue.type());
#endif
    mValue = std::forward<std::any>(v);
    mOnStateChanged.emit(shared_from_this());
}

#endif // STATE_H
