#include "Options.h"
#include "Homedir.h"
#include <log/Log.h>

using namespace reckoning::log;

Options::Options(const std::string& prefix, Args&& args)
    : mArgs(std::forward<Args>(args))
{
    char buf[4096];

    // try to load json file
    const std::string fn = homedir() + "/.config/" + prefix + ".json";
    FILE* f = fopen(fn.c_str(), "r");
    if (!f)
        return;
    std::string contents;
    while (!feof(f)) {
        size_t r = fread(buf, 1, sizeof(buf), f);
        if (r)
            contents += std::string(buf, r);
    }
    fclose(f);

    try {
        mJson = json::parse(contents);
    } catch (const json::parse_error&) {
        Log(Log::Error) << "JSON parse error";
    }
}
