#ifndef ARGUMENTDESCRIPTOR_H
#define ARGUMENTDESCRIPTOR_H

#include <string>
#include <vector>
#include <util/Any.h>

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
    // I hate not having variant available on OS X clang
    std::any data;

    std::vector<int>& intOptions();
    std::vector<double>& doubleOptions();
    std::vector<std::string>& stringOptions();
    const std::vector<int>& intOptions() const;
    const std::vector<double>& doubleOptions() const;
    const std::vector<std::string>& stringOptions() const;
};

inline ArgumentDescriptor::ArgumentDescriptor(Type t)
{
    type = t;
    switch (type) {
    case Bool:
        break;
    case IntOptions:
    case IntRange:
        data = std::vector<int>();
        break;
    case DoubleOptions:
    case DoubleRange:
        data = std::vector<double>();
        break;
    case StringOptions:
        data = std::vector<std::string>();
        break;
    }
}

inline ArgumentDescriptor::ArgumentDescriptor(int start, int stop)
    : type(IntRange)
{
    std::vector<int> ints;
    ints.push_back(start);
    ints.push_back(stop);
    data = std::move(ints);
}

inline ArgumentDescriptor::ArgumentDescriptor(double start, double stop)
    : type(DoubleRange)
{
    std::vector<double> doubles;
    doubles.push_back(start);
    doubles.push_back(stop);
    data = std::move(doubles);
}

inline ArgumentDescriptor::ArgumentDescriptor(std::vector<std::string>&& options)
    : type(StringOptions), data(std::forward<std::vector<std::string> >(options))
{
}

inline ArgumentDescriptor::ArgumentDescriptor(std::vector<int>&& options)
    : type(IntOptions), data(std::forward<std::vector<int> >(options))
{
}

inline ArgumentDescriptor::ArgumentDescriptor(std::vector<double>&& options)
    : type(DoubleOptions), data(std::forward<std::vector<double> >(options))
{
}

inline ArgumentDescriptor::~ArgumentDescriptor()
{
}

inline std::vector<int>& ArgumentDescriptor::intOptions()
{
    assert(type == IntOptions || type == IntRange);
    return *std::any_cast<std::vector<int> >(&data);
}

inline std::vector<double>& ArgumentDescriptor::doubleOptions()
{
    assert(type == DoubleOptions || type == DoubleRange);
    return *std::any_cast<std::vector<double> >(&data);
}

inline std::vector<std::string>& ArgumentDescriptor::stringOptions()
{
    assert(type == StringOptions);
    return *std::any_cast<std::vector<std::string> >(&data);
}

inline const std::vector<int>& ArgumentDescriptor::intOptions() const
{
    assert(type == IntOptions || type == IntRange);
    return *std::any_cast<std::vector<int> >(&data);
}

inline const std::vector<double>& ArgumentDescriptor::doubleOptions() const
{
    assert(type == DoubleOptions || type == DoubleRange);
    return *std::any_cast<std::vector<double> >(&data);
}

inline const std::vector<std::string>& ArgumentDescriptor::stringOptions() const
{
    assert(type == StringOptions);
    return *std::any_cast<std::vector<std::string> >(&data);
}

#endif // ARGUMENTDESCRIPTOR_H
