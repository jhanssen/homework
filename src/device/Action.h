#ifndef ACTION_H
#define ACTION_H

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

    class ArgumentDescriptor
    {
    public:
        enum Type { Bool, IntOptions, IntRange, DoubleOptions, DoubleRange, StringOptions };

        explicit ArgumentDescriptor(Type type);
        explicit ArgumentDescriptor(int start, int stop); // int range
        explicit ArgumentDescriptor(double start, double stop); // double range
        ArgumentDescriptor(std::vector<std::string>&& options); // string options
        ArgumentDescriptor(std::vector<int>&& options); // int options
        ArgumentDescriptor(std::vector<double>&& options); // double options;
        ~ArgumentDescriptor();

        Type type;
        union {
            std::vector<int> ints;
            std::vector<double> doubles;
            std::vector<std::string> strings;
        };
    };

    void execute(const Arguments& args);

protected:
    Action(Function&& func, std::vector<ArgumentDescriptor>&& args = std::vector<ArgumentDescriptor>());

private:
    Function mFunc;
    std::vector<ArgumentDescriptor> mArgs;
};

inline Action::Action(Function&& func, std::vector<ArgumentDescriptor>&& args)
    : mFunc(std::forward<Function>(func)), mArgs(std::forward<std::vector<ArgumentDescriptor> >(args))
{
}

inline void Action::execute(const Arguments& args)
{
    if (mFunc)
        mFunc(args);
}

inline Action::ArgumentDescriptor::ArgumentDescriptor(Type t)
{
    type = t;
    switch (type) {
    case Bool:
        break;
    case IntOptions:
    case IntRange:
        new (&ints) std::vector<int>();
        break;
    case DoubleOptions:
    case DoubleRange:
        new (&doubles) std::vector<double>();
        break;
    case StringOptions:
        new (&strings) std::vector<std::string>();
        break;
    }
}

inline Action::ArgumentDescriptor::ArgumentDescriptor(int start, int stop)
    : type(IntRange)
{
    new (&ints) std::vector<int>();
    ints.push_back(start);
    ints.push_back(stop);
}

inline Action::ArgumentDescriptor::ArgumentDescriptor(double start, double stop)
    : type(DoubleRange)
{
    new (&doubles) std::vector<double>();
    doubles.push_back(start);
    doubles.push_back(stop);
}

inline Action::ArgumentDescriptor::ArgumentDescriptor(std::vector<std::string>&& options)
    : type(StringOptions)
{
    new (&strings) std::vector<std::string>(std::forward<std::vector<std::string> >(options));
}

inline Action::ArgumentDescriptor::ArgumentDescriptor(std::vector<int>&& options)
    : type(IntOptions)
{
    new (&ints) std::vector<int>(std::forward<std::vector<int> >(options));
}

inline Action::ArgumentDescriptor::ArgumentDescriptor(std::vector<double>&& options)
    : type(DoubleOptions)
{
    new (&doubles) std::vector<double>(std::forward<std::vector<double> >(options));
}

inline Action::ArgumentDescriptor::~ArgumentDescriptor()
{
    switch (type)
    {
    case Bool:
        break;
    case IntOptions:
    case IntRange:
        ints.~vector();
        break;
    case DoubleOptions:
    case DoubleRange:
        doubles.~vector();
        break;
    case StringOptions:
        strings.~vector();
        break;
    }
}

#endif // ACTION_H
