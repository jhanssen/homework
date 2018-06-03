#ifndef ARGUMENTDESCRIPTOR_H
#define ARGUMENTDESCRIPTOR_H

#include <string>
#include <vector>

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

inline ArgumentDescriptor::ArgumentDescriptor(Type t)
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

inline ArgumentDescriptor::ArgumentDescriptor(int start, int stop)
    : type(IntRange)
{
    new (&ints) std::vector<int>();
    ints.push_back(start);
    ints.push_back(stop);
}

inline ArgumentDescriptor::ArgumentDescriptor(double start, double stop)
    : type(DoubleRange)
{
    new (&doubles) std::vector<double>();
    doubles.push_back(start);
    doubles.push_back(stop);
}

inline ArgumentDescriptor::ArgumentDescriptor(std::vector<std::string>&& options)
    : type(StringOptions)
{
    new (&strings) std::vector<std::string>(std::forward<std::vector<std::string> >(options));
}

inline ArgumentDescriptor::ArgumentDescriptor(std::vector<int>&& options)
    : type(IntOptions)
{
    new (&ints) std::vector<int>(std::forward<std::vector<int> >(options));
}

inline ArgumentDescriptor::ArgumentDescriptor(std::vector<double>&& options)
    : type(DoubleOptions)
{
    new (&doubles) std::vector<double>(std::forward<std::vector<double> >(options));
}

inline ArgumentDescriptor::~ArgumentDescriptor()
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

#endif // ARGUMENTDESCRIPTOR_H
