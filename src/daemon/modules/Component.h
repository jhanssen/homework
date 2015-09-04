#ifndef COMPONENT_H
#define COMPONENT_H

#include <rct/Path.h>
#include <rct/List.h>
#include <rct/Value.h>

class Component
{
public:
    Component(const String& name, const Path& pwd);
    ~Component();

    Path currentPath() { return mPath.parentDir(); }

    bool isValid() const { return !mPath.isEmpty(); };
    Value eval() const;

    static Component* current() { return sCurrent.isEmpty() ? 0 : sCurrent.last(); }

private:
    static List<Component*> sCurrent;

    Path mPath;
};

#endif
