#ifndef ACTIONGROUP_H
#define ACTIONGROUP_H

#include <Action.h>
#include <memory>
#include <functional>

class ActionGroup
{
public:
    ActionGroup(const std::string& name);
    ~ActionGroup();

    bool add(std::shared_ptr<Action>&& action);
    bool add(const std::shared_ptr<Action>& action);

    static std::shared_ptr<Action> makeAction(ActionGroup&& group);
    static std::shared_ptr<Action> makeAction(const ActionGroup& group);

private:
    bool verify(Action* action) const;

private:
    std::string mName;
    std::vector<std::shared_ptr<Action> > mActions;
};

inline ActionGroup::ActionGroup(const std::string& name)
    : mName(name)
{
}

inline ActionGroup::~ActionGroup()
{
}

inline bool ActionGroup::verify(Action* action) const
{
    if (!action)
        return false;
    if (mActions.empty())
        return true;
    // verify that this action has the same argument list as the first one
    const auto& currentDescriptors = mActions.front()->descriptors();
    const auto& newDescriptors = action->descriptors();
    if (currentDescriptors.size() != newDescriptors.size())
        return false;
    for (size_t i = 0; i < currentDescriptors.size(); ++i) {
        if (currentDescriptors[i].type != newDescriptors[i].type)
            return false;
        switch (currentDescriptors[i].type) {
        case ArgumentDescriptor::Bool:
            break;
        case ArgumentDescriptor::IntOptions:
        case ArgumentDescriptor::IntRange: {
            const auto& currentInts = currentDescriptors[i].intOptions();
            const auto& newInts = currentDescriptors[i].intOptions();
            if (currentInts.size() != newInts.size())
                return false;
            for (size_t j = 0; j < currentInts.size(); ++j) {
                if (currentInts[i] != newInts[j])
                    return false;
            }
            break; }
        case ArgumentDescriptor::DoubleOptions:
        case ArgumentDescriptor::DoubleRange: {
            const auto& currentDoubles = currentDescriptors[i].doubleOptions();
            const auto& newDoubles = currentDescriptors[i].doubleOptions();
            if (currentDoubles.size() != newDoubles.size())
                return false;
            for (size_t j = 0; j < currentDoubles.size(); ++j) {
                if (currentDoubles[i] != newDoubles[j])
                    return false;
            }
            break; }
        case ArgumentDescriptor::StringOptions: {
            const auto& currentStrings = currentDescriptors[i].stringOptions();
            const auto& newStrings = currentDescriptors[i].stringOptions();
            if (currentStrings.size() != newStrings.size())
                return false;
            for (size_t j = 0; j < currentStrings.size(); ++j) {
                if (currentStrings[i] != newStrings[j])
                    return false;
            }
            break; }
        }
    }
    return true;
}

inline bool ActionGroup::add(std::shared_ptr<Action>&& action)
{
    if (!verify(action.get()))
        return false;
    mActions.push_back(std::forward<std::shared_ptr<Action> >(action));
    return true;
}

inline bool ActionGroup::add(const std::shared_ptr<Action>& action)
{
    if (!verify(action.get()))
        return false;
    mActions.push_back(action);
    return true;
}

inline std::shared_ptr<Action> ActionGroup::makeAction(ActionGroup&& group)
{
    if (group.mActions.empty())
        return std::shared_ptr<Action>();
    Action::Descriptors descriptors = group.mActions.front()->descriptors();
    auto func = std::bind(
        [](std::vector<std::shared_ptr<Action> >& actions,
           const Action::Arguments& args) {
            for (auto& action : actions) {
                action->execute(args);
            }
        }, std::move(group.mActions), std::placeholders::_1);
    return Action::create(group.mName, std::move(func), std::move(descriptors));
}

inline std::shared_ptr<Action> ActionGroup::makeAction(const ActionGroup& group)
{
    if (group.mActions.empty())
        return std::shared_ptr<Action>();
    Action::Descriptors descriptors = group.mActions.front()->descriptors();
    auto func = std::bind(
        [](std::vector<std::shared_ptr<Action> >& actions,
           const Action::Arguments& args) {
            for (auto& action : actions) {
                action->execute(args);
            }
        }, group.mActions, std::placeholders::_1);
    return Action::create(group.mName, std::move(func), std::move(descriptors));
}

#endif
