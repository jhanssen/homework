#ifndef SPLIT_H
#define SPLIT_H

#include <vector>
#include <string>

static inline std::vector<std::string> split(const std::string& str, bool skip = true)
{
    std::vector<std::string> data;
    const char* cur = str.c_str();
    const char* prev = cur;
    bool done = false;
    for (; !done; ++cur) {
        switch (*cur) {
        case '\0':
            done = true;
            // fall through
        case '\t':
        case ' ':
            if (cur > prev) {
                // push to list
                data.push_back(std::string(prev, cur - prev));
            }
            if (!skip && !done) {
                data.push_back(std::string());
            }
            prev = cur + 1;
            break;
        default:
            break;
        }
    }
    return data;
}

#endif // SPLIT_H
