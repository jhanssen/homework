cmake_minimum_required(VERSION 2.8)

add_subdirectory(cec)
add_subdirectory(websocket)
add_subdirectory(fake)
add_subdirectory(zway)

if (HAVE_ZWAY)
    set(HAVE_ZWAY 1 PARENT_SCOPE)
endif()

include_directories(..)

if (POLICY CMP0042)
  cmake_policy(SET CMP0042 NEW)
endif()

add_library(modules SHARED Modules.cpp Module.cpp RuleJS.cpp Alarm.cpp AlarmSensor.cpp)
target_link_libraries(modules rct)
