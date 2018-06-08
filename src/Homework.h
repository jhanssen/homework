#ifndef HOMEWORK_H
#define HOMEWORK_H

#include "Console.h"
#include <Options.h>
#include <Device.h>
#include <Platform.h>
#include <memory>

class Homework
{
public:
    typedef std::vector<std::shared_ptr<Platform> > Platforms;

    Homework(Options&& options);
    ~Homework();

    void start();
    void stop();

    const Platforms& platforms() const;

private:
    Options mOptions;
    Console mConsole;
    Platforms mPlatforms;
};

inline const Homework::Platforms& Homework::platforms() const
{
    return mPlatforms;
}

#endif
