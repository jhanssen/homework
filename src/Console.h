#ifndef CONSOLE_H
#define CONSOLE_H

#include <memory>

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
    std::shared_ptr<Editline> mEditline;
};

#endif
