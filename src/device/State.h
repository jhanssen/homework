#ifndef STATE_H
#define STATE_H

#include <util/Any.h>
#include <string>

class State
{
public:
    enum StateType { Bool, Int, Double, String };

    explicit State(const std::string& name, bool value);
    explicit State(const std::string& name, int value);
    explicit State(const std::string& name, double value);
    explicit State(const std::string& name, const std::string& value);

    StateType type() const;
    std::string name() const;

    template<typename T>
    T value() const;

    bool operator==(const std::any& value) const;

private:
    StateType mType;
    std::string mName;
    std::any mValue;
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

bool State::operator==(const std::any& value) const
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


#endif // STATE_H
