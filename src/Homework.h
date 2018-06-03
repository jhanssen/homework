#ifndef HOMEWORK_H
#define HOMEWORK_H

#include <Options.h>
#include <Device.h>
#include <Platform.h>
#include <memory>

class Homework
{
public:
    Homework(Options&& options);
    ~Homework();

    void start();
    void stop();

private:
    Options mOptions;
    std::vector<std::shared_ptr<Platform> > mPlatforms;
};

#endif
