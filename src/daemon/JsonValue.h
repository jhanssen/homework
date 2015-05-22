#ifndef JSONVALUE_H
#define JSONVALUE_H

#include <json.hpp>
#include <rct/Value.h>
#include <rct/Log.h>

using json = nlohmann::json;

namespace Json {
json fromValue(const Value& value);
Value toValue(const json& json);
}

namespace Json {
inline json fromValue(const Value& value)
{
    const Value::Type type = value.type();
    switch (type) {
    case Value::Type_Invalid:
    case Value::Type_Undefined:
        return json();
    case Value::Type_Boolean:
        return json(value.toBool());
    case Value::Type_Integer:
        return json(value.toInteger());
    case Value::Type_Double:
        return json(value.toDouble());
    case Value::Type_String:
        return json(value.toString());
    case Value::Type_Custom:
        break;
    case Value::Type_Map: {
        json j;
        auto it = value.begin();
        const auto end = value.end();
        while (it != end) {
            j[it->first] = fromValue(it->second);
            ++it;
        }
        return j; }
    case Value::Type_List: {
        json j;
        auto it = value.listBegin();
        const auto end = value.listEnd();
        while (it != end) {
            j.push_back(fromValue(*it));
            ++it;
        }
        return j; }
    }
    error() << "unexpected type in fromValue" << type;
    return json();
}

inline Value toValue(const json& json)
{
    const json::value_t type = json.type();
    switch (type) {
    case json::value_t::null:
    case json::value_t::discarded:
        return Value();
    case json::value_t::object:
    case json::value_t::array: {
        Value val;
        const bool isobject = (type == json::value_t::object);
        json::const_iterator it = json.begin();
        const json::const_iterator end = json.end();
        while (it != end) {
            if (isobject) {
                val[it.key()] = toValue(it.value());
            } else {
                val.push_back(toValue(it.value()));
            }
            ++it;
        }
        return val; }
    case json::value_t::string:
        return String(json.get<json::string_t>());
    case json::value_t::boolean:
        return json.get<json::boolean_t>();
    case json::value_t::number_integer:
        return json.get<json::number_integer_t>();
    case json::value_t::number_float:
        return json.get<json::number_float_t>();
    }
    return Value();
}
}

#endif
