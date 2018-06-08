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
    ~Rule();

    std::string name() const;

    void setEvent(const std::shared_ptr<Event>& event);
    void setCondition(const std::shared_ptr<Condition>& condition);
    void addAction(const std::shared_ptr<Action>& action, Action::Arguments&& args);
    void addAction(const std::shared_ptr<Action>& action, const Action::Arguments& args);

    void disable();
    void enable();

protected:
    Rule(const std::string& name);

private:
    std::string mName;
    Signal<>::Connection mEventConnection;
    std::shared_ptr<Event> mEvent;
    std::shared_ptr<Condition> mCondition;
    std::vector<std::pair<std::shared_ptr<Action>, Action::Arguments> > mActions;
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

inline void Rule::disable()
{
    mEventConnection.disconnect();
}

inline void Rule::enable()
{
    mEventConnection = mEvent->onTriggered().connect([this]() {
            if (!mCondition || mCondition->execute()) {
                for (auto a : mActions) {
                    a.first->execute(a.second);
                }
            }
        });
}

#endif // RULE_H
