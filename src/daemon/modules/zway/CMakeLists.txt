include_directories(../..)

if (POLICY CMP0042)
  cmake_policy(SET CMP0042 NEW)
endif()

find_library(ZWAY_LIBRARY zway HINTS /opt/z-way-server/libs)
find_path(ZWAY_INCLUDES ZWayLib.h HINTS /opt/z-way-server/libzway)

if (ZWAY_LIBRARY)
    message("found zway")
    include_directories(${ZWAY_INCLUDES})
    add_library(zway_module SHARED ZWayModule.cpp)
    target_link_libraries(zway_module rct modules ${ZWAY_LIBRARY})
    set(HAVE_ZWAY 1 PARENT_SCOPE)
else()
    message("didn't find zway")
endif()
