#ifndef CONSOLE_H
#define CONSOLE_H

#include <memory>
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
};

#endif
