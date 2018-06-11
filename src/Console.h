#ifndef CONSOLE_H
#define CONSOLE_H

#include <Rule.h>
#include <memory>
#include <vector>
#include <string>

class Homework;
class Editline;

class Console
{
public:
    Console(Homework* homework);
    ~Console();

    void start();
    void stop();

private:
    Homework* mHomework;
    std::string mPrefix;
    std::shared_ptr<Editline> mEditline;
    std::shared_ptr<Rule> mCurrentRule;
    std::vector<std::shared_ptr<Condition> > mCurrentCondition;
};

#endif
