#ifndef OPTIONS_H
#define OPTIONS_H

#include <args/Parser.h>
#include <nlohmann/json.hpp>
#include <typeinfo>
#include <cstdlib>
#include <ctype.h>

using reckoning::args::Parser;
using reckoning::args::Args;
using nlohmann::json;

class Options
{
public:
    Options(const std::string& prefix, Args&& args);

    bool has(const std::string& key) const;
    template<typename T>
    bool has(const std::string& key) const;

    template<typename T, typename std::enable_if<!std::is_pod<T>::value>::type* = nullptr>
    T value(const std::string& key, const T& defaultValue = T()) const;

    template<typename T, typename std::enable_if<std::is_pod<T>::value>::type* = nullptr>
    T value(const std::string& key, T defaultValue = T()) const;

private:
    static std::string upper(const std::string& key);
    static bool canConvert(const std::type_info& from, const std::type_info& to);
    template<typename T>
    static bool canConvertFromJSON(const json& json);
    template<typename T>
    static T convert(const std::any& value, bool& ok);

private:
    Args mArgs;
    json mJson;
};

inline std::string Options::upper(const std::string& key)
{
    std::string ret = key;
    auto it = ret.begin();
    const auto end = ret.cend();
    while (it != end) {
        if (*it == '-') {
            *it = '_';
        } else {
            *it = toupper(*it);
        }
        ++it;
    }
    return ret;
}

inline bool Options::canConvert(const std::type_info& from, const std::type_info& to)
{
    if (from == to)
        return true;
    if ((from == typeid(int64_t) && to == typeid(int32_t)) ||
        (from == typeid(int64_t) && to == typeid(double)) ||
        (from == typeid(int64_t) && to == typeid(float)) ||
        (from == typeid(double) && to == typeid(float))) {
        return true;
    }
    return false;
}

template<typename T>
inline T Options::convert(const std::any& value, bool& ok)
{
    if (value.type() == typeid(T)) {
        ok = true;
        return std::any_cast<T>(value);
    }
    if (value.type() == typeid(int64_t) && typeid(T) == typeid(int32_t)) {
        ok = true;
        return static_cast<int32_t>(std::any_cast<int64_t>(value));
    }
    if ((value.type() == typeid(double) && typeid(T) == typeid(int32_t)) ||
        (value.type() == typeid(double) && typeid(T) == typeid(float)) ||
        (value.type() == typeid(double) && typeid(T) == typeid(int64_t))) {
        ok = true;
        return static_cast<T>(std::any_cast<double>(value));
    }
    ok = false;
    return T();
}

inline bool Options::has(const std::string& key) const
{
    if (mArgs.has(key))
        return true;
    if (getenv(upper(key).c_str()))
        return true;
    if (mJson.is_object())
        return mJson.find(key) != mJson.end();
    return false;
}

template<typename T>
inline bool Options::canConvertFromJSON(const json& json)
{
    switch (json.type()) {
    case json::value_t::string:
        return canConvert(typeid(std::string), typeid(T));
    case json::value_t::boolean:
        return canConvert(typeid(bool), typeid(T));
    case json::value_t::number_integer:
    case json::value_t::number_unsigned:
        return canConvert(typeid(int64_t), typeid(T));
    case json::value_t::number_float:
        return canConvert(typeid(double), typeid(T));
    default:
        break;
    }
    return false;
}

template<typename T>
inline bool Options::has(const std::string& key) const
{
    if (mArgs.has<T>(key))
        return mArgs.has<T>(key);
    if (char* e = getenv(upper(key).c_str())) {
        const auto v = Parser::guessValue(e);
        return canConvert(v.type(), typeid(T));
    }
    if (mJson.is_object()) {
        auto v = mJson.find(key);
        if (v != mJson.end()) {
            return canConvertFromJSON<T>(*v);
        }
    }
    return false;
}

template<typename T, typename std::enable_if<!std::is_pod<T>::value>::type*>
inline T Options::value(const std::string& key, const T& defaultValue) const
{
    if (mArgs.has<T>(key))
        return mArgs.value<T>(key);
    if (char* e = getenv(upper(key).c_str())) {
        std::any v = Parser::guessValue(e);
        bool ok;
        T ret = convert<T>(v, ok);
        if (ok)
            return ret;
    }
    if (mJson.is_object()) {
        auto v = mJson.find(key);
        if (v != mJson.end() && canConvertFromJSON<T>(*v))
            return v->get<T>();
    }
    return defaultValue;
}

template<typename T, typename std::enable_if<std::is_pod<T>::value>::type*>
inline T Options::value(const std::string& key, T defaultValue) const
{
    if (mArgs.has<T>(key))
        return mArgs.value<T>(key);
    if (char* e = getenv(upper(key).c_str())) {
        const auto v = Parser::guessValue(e);
        bool ok;
        T ret = convert<T>(v, ok);
        if (ok)
            return ret;
    }
    if (mJson.is_object()) {
        auto v = mJson.find(key);
        if (v != mJson.end() && canConvertFromJSON<T>(*v))
            return v->get<T>();
    }
    return defaultValue;
}

#endif // OPTIONS_H
