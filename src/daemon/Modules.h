#ifndef MODULES_H
#define MODULES_H

#include <Module.h>
#include <memory>

class Modules
{
public:
    typedef std::shared_ptr<Modules> SharedPtr;
    typedef std::weak_ptr<Modules> WeakPtr;

    template<typename T>
    void add();

    void initialize();

private:
    List<Module::SharedPtr> mModules;
};

template<typename T>
inline void Modules::add()
{
    mModules.append(std::make_shared<T>());
}

inline void Modules::initialize()
{
    auto module = mModules.cbegin();
    const auto end = mModules.cend();
    while (module != end) {
        (*module)->initialize();
        ++module;
    }
}

#endif
