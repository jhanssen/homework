#include "Options.h"
#include <log/Log.h>
#include <pwd.h>
#include <sys/types.h>

using namespace reckoning::log;

Options::Options(const std::string& prefix, Args&& args)
    : mArgs(args)
{
    char buf[4096];
    auto homedir = [&buf]()-> std::string {

        int requiredSize = sysconf(_SC_GETPW_R_SIZE_MAX);
        if (requiredSize == -1)
            requiredSize = sizeof(buf);

        struct passwd pw;
        struct passwd* pwptr;
        char* bufptr;
        size_t bufsiz;
        if (requiredSize <= sizeof(buf)) {
            bufptr = buf;
            bufsiz = sizeof(buf);
        } else {
            bufptr = static_cast<char*>(malloc(requiredSize));
            bufsiz = requiredSize;
        }
        auto cleanup = [bufptr, &buf]() {
            if (bufptr != buf)
                free(bufptr);
        };
        if (!getpwuid_r(getuid(), &pw, buf, sizeof(buf), &pwptr)) {
            if (pw.pw_dir) {
                std::string ret = pw.pw_dir;
                cleanup();
                return ret;
            }
        }
        cleanup();
        return std::string();
    };

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
