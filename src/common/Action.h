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
    typedef std::function<void(const Arguments&)> Function;

    void execute(const Arguments& args);

    std::string name() const;
    const std::vector<ArgumentDescriptor>& arguments() const;

protected:
    Action(const std::string& name, Function&& func,
           std::vector<ArgumentDescriptor>&& args = std::vector<ArgumentDescriptor>());

private:
    std::string mName;
    Function mFunc;
    std::vector<ArgumentDescriptor> mArgs;
};

inline Action::Action(const std::string& name, Function&& func,
                      std::vector<ArgumentDescriptor>&& args)
    : mName(name), mFunc(std::forward<Function>(func)),
      mArgs(std::forward<std::vector<ArgumentDescriptor> >(args))
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

inline const std::vector<ArgumentDescriptor>& Action::arguments() const
{
    return mArgs;
}

#endif // ACTION_H
