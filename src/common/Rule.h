#ifndef RULE_H
#define RULE_H

#include <Event.h>
#include <State.h>
#include <Condition.h>
#include <Action.h>
#include <event/Signal.h>
#include <util/Creatable.h>
#include <cassert>

using reckoning::event::Signal;
using reckoning::util::Creatable;

class Rule : public std::enable_shared_from_this<Rule>, public Creatable<Rule>
{
public:
    typedef std::vector<std::pair<std::weak_ptr<Action>, Action::Arguments> > Actions;

    ~Rule();

    std::string name() const;
    bool isValid() const;

    void setTrigger(const std::shared_ptr<Event>& event);
    void setTrigger(const std::shared_ptr<State>& state);
    void setCondition(const std::shared_ptr<Condition>& condition);
    void addAction(const std::shared_ptr<Action>& action, Action::Arguments&& args);
    void addAction(const std::shared_ptr<Action>& action, const Action::Arguments& args);

    std::shared_ptr<Event> event() const;
    const std::shared_ptr<Condition>& condition() const;
    const Actions& actions() const;
    size_t actionSize() const;
    bool removeAction(size_t action);

    void disable();
    void enable();

protected:
    Rule(const std::string& name);

private:
    std::string mName;
    Signal<>::Connection mTriggerConnection;
    std::weak_ptr<Event> mEvent;
    std::weak_ptr<State> mState;
    std::shared_ptr<Condition> mCondition;
    Actions mActions;
};

inline Rule::Rule(const std::string& name)
    : mName(name)
{
}

inline Rule::~Rule()
{
    mTriggerConnection.disconnect();
}

inline std::string Rule::name() const
{
    return mName;
}

inline bool Rule::isValid() const
{
    return !mEvent.expired() && !mState.expired();
}

inline void Rule::setTrigger(const std::shared_ptr<Event>& event)
{
    mTriggerConnection.disconnect();
    mState.reset();
    mEvent = event;
    enable();
}

inline void Rule::setTrigger(const std::shared_ptr<State>& state)
{
    mTriggerConnection.disconnect();
    mEvent.reset();
    mState = state;
    enable();
}

inline void Rule::setCondition(const std::shared_ptr<Condition>& condition)
{
    mCondition = condition;
}

inline void Rule::addAction(const std::shared_ptr<Action>& action, Action::Arguments&& args)
{
    mActions.push_back(std::make_pair(action, std::forward<Action::Arguments>(args)));
}

inline void Rule::addAction(const std::shared_ptr<Action>& action, const Action::Arguments& args)
{
    mActions.push_back(std::make_pair(action, args));
}

inline std::shared_ptr<Event> Rule::event() const
{
    return mEvent.lock();
}

inline const std::shared_ptr<Condition>& Rule::condition() const
{
    return mCondition;
}

inline const Rule::Actions& Rule::actions() const
{
    return mActions;
}

inline size_t Rule::actionSize() const
{
    return mActions.size();
}

inline bool Rule::removeAction(size_t action)
{
    if (action < mActions.size()) {
        mActions.erase(mActions.begin() + action);
        return true;
    }
    return false;
}

inline void Rule::disable()
{
    mTriggerConnection.disconnect();
}

inline void Rule::enable()
{
    if (mTriggerConnection.connected())
        return;
    std::weak_ptr<Rule> weakRule = shared_from_this();
    if (auto event = mEvent.lock()) {
        assert(mState.expired());
        mTriggerConnection = event->onTriggered().connect([weakRule]() {
                if (auto rule = weakRule.lock()) {
                    if (!rule->mCondition || rule->mCondition->execute()) {
                        for (auto a : rule->mActions) {
                            if (auto action = a.first.lock())
                                action->execute(a.second);
                        }
                    }
                }
            });
    } else if (auto state = mState.lock()) {
        assert(mEvent.expired());
        mTriggerConnection = state->onChanged().connect([weakRule]() {
                if (auto rule = weakRule.lock()) {
                    if (!rule->mCondition || rule->mCondition->execute()) {
                        for (auto a : rule->mActions) {
                            if (auto action = a.first.lock())
                                action->execute(a.second);
                        }
                    }
                }
            });
    }
}

#endif // RULE_H
