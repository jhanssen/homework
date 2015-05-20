#ifndef CONTROLLER_H
#define CONTROLLER_H

#include <json.hpp>
#include <memory>

using nlohmann::json;

class Controller
{
public:
    typedef std::shared_ptr<Controller> SharedPtr;
    typedef std::weak_ptr<Controller> WeakPtr;

    virtual ~Controller() {}

    json get() const = 0;
    void set(const json& json) = 0;
};

#endif
