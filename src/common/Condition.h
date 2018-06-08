#ifndef CONDITION_H
#define CONDITION_H

#include "State.h"
#include <util/Creatable.h>
#include <memory>

using reckoning::util::Creatable;

class Condition : public std::enable_shared_from_this<Condition>, public Creatable<Condition>
{
public:
    enum LogicalOperator {
        Operator_And,
        Operator_Or
    };

    void add(LogicalOperator op, const std::shared_ptr<State>& state, const std::any& value);
    void add(LogicalOperator op, const std::shared_ptr<Condition>& condition);
    void add(LogicalOperator op, std::shared_ptr<Condition>&& condition);

    bool execute() const;

protected:
    Condition();

private:
    struct Data
    {
        Data(LogicalOperator o, const std::shared_ptr<State>& s, const std::any& v)
            : op(o), state(s), value(v)
        {
        }
        Data(LogicalOperator o, const std::shared_ptr<Condition>& c)
            : op(o), subcond(c)
        {
        }
        Data(LogicalOperator o, std::shared_ptr<Condition>& c)
            : op(o), subcond(c)
        {
        }

        LogicalOperator op;
        std::shared_ptr<Condition> subcond;
        std::weak_ptr<State> state;
        std::any value;
    };
    std::vector<Data> mData;
};

inline Condition::Condition()
{
}

inline void Condition::add(LogicalOperator op, const std::shared_ptr<State>& state, const std::any& value)
{
    mData.push_back({ op, state, value });
}

inline void Condition::add(LogicalOperator op, const std::shared_ptr<Condition>& condition)
{
    mData.push_back({ op, condition });
}

inline void Condition::add(LogicalOperator op, std::shared_ptr<Condition>&& condition)
{
    mData.push_back({ op, std::forward<std::shared_ptr<Condition> >(condition) });
}

inline bool Condition::execute() const
{
    if (mData.empty())
        return true;
    auto c = mData.begin();
    const auto e = mData.cend();
    while (c != e) {
        if (c->subcond) {
            // sub condition
            if (c->subcond->execute()) {
                if (c + 1 != e) {
                    if ((c + 1)->op == Operator_Or)
                        return true;
                } else {
                    return true;
                }
            } else {
                // no
                if (c + 1 != e) {
                    if ((c + 1)->op == Operator_And)
                        return false;
                } else {
                    return false;
                }
            }
        } else {
            // check
            if (auto state = c->state.lock()) {
                if (*state == c->value) {
                    // yes
                    if (c + 1 != e) {
                        if ((c + 1)->op == Operator_Or)
                            return true;
                    } else {
                        return true;
                    }
                } else {
                    // no
                    if (c + 1 != e) {
                        if ((c + 1)->op == Operator_And)
                            return false;
                    } else {
                        return false;
                    }
                }
            } else {
                // bail out
                return false;
            }
        }
        ++c;
    }
    // should never happen
    assert(false && "end of condition reached");
    return false;
}

#endif // CONDITION_H
