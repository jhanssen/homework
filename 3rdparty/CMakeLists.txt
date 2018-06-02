cmake_minimum_required(VERSION 3.9)

include(ExternalProject)

ExternalProject_Add(project_ozw
    SOURCE_DIR ${CMAKE_CURRENT_LIST_DIR}/openzwave
    DOWNLOAD_COMMAND ""
    CONFIGURE_COMMAND ""
    BUILD_IN_SOURCE 1
    BUILD_COMMAND make)

add_library(ozw STATIC IMPORTED GLOBAL)
set_property(TARGET ozw PROPERTY INTERFACE_INCLUDE_DIRECTORIES ${CMAKE_CURRENT_LIST_DIR}/openzwave/cpp/src)
set_property(TARGET ozw PROPERTY IMPORTED_LOCATION ${CMAKE_CURRENT_LIST_DIR}/openzwave/libopenzwave.a)
add_dependencies(ozw project_ozw)

set(JSON_BuildTests OFF CACHE BOOL "Build the unit tests when BUILD_TESTING is enabled." FORCE)
add_subdirectory(nlohmann-json)
