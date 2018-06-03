#ifndef HOMEDIR_H
#define HOMEDIR_H

#include <string>
#include <pwd.h>
#include <unistd.h>
#include <sys/types.h>

inline std::string homedir()
{
    char buf[4096];
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
}

#endif // HOMEDIR_H
