#ifndef RULE_H
#define RULE_H

#include <Event.h>
#include <Condition.h>
#include <Action.h>
#include <event/Signal.h>
#include <util/Creatable.h>

using reckoning::event::Signal;
using reckoning::util::Creatable;

class Rule : public std::enable_shared_from_this<Rule>, public Creatable<Rule>
{
public:
    typedef std::vector<std::pair<std::shared_ptr<Action>, Action::Arguments> > Actions;

    ~Rule();

    std::string name() const;

    void setEvent(const std::shared_ptr<Event>& event);
    void setCondition(const std::shared_ptr<Condition>& condition);
    void addAction(const std::shared_ptr<Action>& action, Action::Arguments&& args);
    void addAction(const std::shared_ptr<Action>& action, const Action::Arguments& args);

    const std::shared_ptr<Event>& event() const;
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
    Signal<>::Connection mEventConnection;
    std::shared_ptr<Event> mEvent;
    std::shared_ptr<Condition> mCondition;
    Actions mActions;
};

inline Rule::Rule(const std::string& name)
    : mName(name)
{
}

inline Rule::~Rule()
{
    mEventConnection.disconnect();
}

inline std::string Rule::name() const
{
    return mName;
}

inline void Rule::setEvent(const std::shared_ptr<Event>& event)
{
    mEventConnection.disconnect();
    mEvent = event;
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

const std::shared_ptr<Event>& Rule::event() const
{
    return mEvent;
}

const std::shared_ptr<Condition>& Rule::condition() const
{
    return mCondition;
}

const Rule::Actions& Rule::actions() const
{
    return mActions;
}

size_t Rule::actionSize() const
{
    return mActions.size();
}

bool Rule::removeAction(size_t action)
{
    if (action < mActions.size()) {
        mActions.erase(mActions.begin() + action);
        return true;
    }
    return false;
}

inline void Rule::disable()
{
    mEventConnection.disconnect();
}

inline void Rule::enable()
{
    std::weak_ptr<Rule> weakRule = shared_from_this();
    mEventConnection = mEvent->onTriggered().connect([weakRule]() {
            if (auto rule = weakRule.lock()) {
                if (!rule->mCondition || rule->mCondition->execute()) {
                    for (auto a : rule->mActions) {
                        a.first->execute(a.second);
                    }
                }
            }
        });
}

#endif // RULE_H
