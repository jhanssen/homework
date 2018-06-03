#ifndef ACTION_H
#define ACTION_H

#include <ArgumentDescriptor.h>
#include <util/Any.h>
#include <util/Creatable.h>
#include <memory>
#include <functional>
#include <vector>
#include <string>

using reckoning::util::Creatable;

class Action : public std::enable_shared_from_this<Action>, public Creatable<Action>
{
public:
    typedef std::vector<std::any> Arguments;
    typedef std::vector<ArgumentDescriptor> Descriptors;
    typedef std::function<void(const Arguments&)> Function;

    void execute(const Arguments& args);

    std::string name() const;
    const Descriptors& descriptors() const;

protected:
    Action(const std::string& name, Function&& func, Descriptors&& = Descriptors());

private:
    std::string mName;
    Function mFunc;
    Descriptors mDesc;
};

inline Action::Action(const std::string& name, Function&& func, Descriptors&& desc)
    : mName(name), mFunc(std::forward<Function>(func)),
      mDesc(std::forward<std::vector<ArgumentDescriptor> >(desc))
{
}

inline void Action::execute(const Arguments& args)
{
    if (mFunc)
        mFunc(args);
}

inline std::string Action::name() const
{
    return mName;
}

inline const Action::Descriptors& Action::descriptors() const
{
    return mDesc;
}

#endif // ACTION_H
