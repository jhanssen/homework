#include "Daemon.h"
#include <rct/EventLoop.h>
#include <rct/Log.h>
#include <rct/Config.h>
#include <rct/Rct.h>
#include <stdio.h>

template<typename T>
inline bool validate(int64_t c, const char* name, String& err)
{
    if (c < 0) {
        err = String::format<128>("Invalid %s. Must be >= 0", name);
        return false;
    } else if (c > std::numeric_limits<T>::max()) {
        err = String::format<128>("Invalid %s. Must be <= %d", name, std::numeric_limits<T>::max());
        return false;
    }
    return true;
}

static inline void ensurePath(const Path& p)
{
    p.mkdir();
}

int main(int argc, char** argv)
{
    Rct::findExecutablePath(*argv);

    Config::registerOption<bool>("help", "Display this page", 'h');
    Config::registerOption<bool>("syslog", "Log to syslog", 'y');
    // Config::registerOption<int>("port", String::format<129>("Use this port, (default %d)", plast::DefaultServerPort),'p', plast::DefaultServerPort,
    //                             [](const int &count, String &err) { return validate<uint16_t>(count, "port", err); });

    if (!Config::parse(argc, argv, List<Path>() << (Path::home() + ".config/homework.conf") << "/etc/homework.conf")) {
        return 1;
    }

    const Flags<LogMode> logMode = Config::isEnabled("syslog") ? LogSyslog : LogStderr;
    const char *logFile = 0;
    LogLevel logLevel = LogLevel::Error;
    Flags<LogFileFlag> logFlags;
    Path logPath;
    if (!initLogging(argv[0], logMode, logLevel, logPath, logFlags)) {
        fprintf(stderr, "Can't initialize logging with %d %s %s\n",
                logLevel.toInt(), logFile ? logFile : "", logFlags.toString().constData());
        return 1;
    }

    ensurePath(Path::home() + ".config");

    if (Config::isEnabled("help")) {
        Config::showHelp(stdout);
        return 2;
    }

    EventLoop::SharedPtr loop(new EventLoop);
    loop->init(EventLoop::MainEventLoop|EventLoop::EnableSigIntHandler);

    Daemon::SharedPtr daemon = std::make_shared<Daemon>();
    daemon->init();

    loop->exec();

    daemon->reset();

    return 0;
}
