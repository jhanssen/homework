#ifndef HOMEWORK_H
#define HOMEWORK_H

#include "Console.h"
#include <Options.h>
#include <Device.h>
#include <Platform.h>
#include <Rule.h>
#include <memory>
#include <vector>

class Homework
{
public:
    typedef std::vector<std::shared_ptr<Platform> > Platforms;

    Homework(Options&& options);
    ~Homework();

    void start();
    void stop();

    void addRule(std::shared_ptr<Rule>&& rule);

    const Platforms& platforms() const;
    std::shared_ptr<Platform> findPlatform(const std::string& name);

private:
    Options mOptions;
    Console mConsole;
    Platforms mPlatforms;

    std::vector<std::shared_ptr<Rule> > mRules;
};

inline void Homework::addRule(std::shared_ptr<Rule>&& rule)
{
    mRules.push_back(std::forward<std::shared_ptr<Rule> >(rule));
}

inline std::shared_ptr<Platform> Homework::findPlatform(const std::string& name)
{
    for (const auto& p : mPlatforms) {
        if (p->name() == name) {
            return p;
        }
    }
    return std::shared_ptr<Platform>();
}

inline const Homework::Platforms& Homework::platforms() const
{
    return mPlatforms;
}

#endif
