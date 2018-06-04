cmake_minimum_required(VERSION 3.9)

include(ExternalProject)

ExternalProject_Add(project_ozw
    SOURCE_DIR ${CMAKE_CURRENT_LIST_DIR}/openzwave
    DOWNLOAD_COMMAND ""
    CONFIGURE_COMMAND ""
    BUILD_IN_SOURCE 1
    BUILD_COMMAND make)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}/openzwave-includes/ozw)
file(GLOB_RECURSE OZW_HEADERS ${CMAKE_CURRENT_LIST_DIR}/openzwave/cpp/src/*.h)
set(OZW_DIRECTORIES "")
foreach(OZW_HEADER ${OZW_HEADERS})
    string(REGEX REPLACE "^${CMAKE_CURRENT_LIST_DIR}/openzwave/cpp/src/" "" OZW_HEADER ${OZW_HEADER})
    get_filename_component(OZW_DIRECTORY ${OZW_HEADER} DIRECTORY)
    list(APPEND OZW_DIRECTORIES ${OZW_DIRECTORY})
endforeach()
list(REMOVE_DUPLICATES OZW_DIRECTORIES)
set(OZW_INCLUDES ${CMAKE_CURRENT_BINARY_DIR}/openzwave-includes ${CMAKE_CURRENT_BINARY_DIR}/openzwave-includes/ozw)
foreach(OZW_DIRECTORY ${OZW_DIRECTORIES})
    list(APPEND OZW_INCLUDES ${CMAKE_CURRENT_BINARY_DIR}/openzwave-includes/ozw/${OZW_DIRECTORY})
endforeach()
file(MAKE_DIRECTORY ${OZW_INCLUDES})
foreach(OZW_HEADER ${OZW_HEADERS})
    string(REGEX REPLACE "^${CMAKE_CURRENT_LIST_DIR}/openzwave/cpp/src/" "" OZW_HEADER_BASE ${OZW_HEADER})
    get_filename_component(OZW_DIRECTORY ${OZW_HEADER_BASE} DIRECTORY)
    file(COPY ${OZW_HEADER} DESTINATION ${CMAKE_CURRENT_BINARY_DIR}/openzwave-includes/ozw/${OZW_DIRECTORY})
endforeach()

add_library(ozw STATIC IMPORTED GLOBAL)
set_property(TARGET ozw PROPERTY INTERFACE_INCLUDE_DIRECTORIES ${OZW_INCLUDES})
set_property(TARGET ozw PROPERTY IMPORTED_LOCATION ${CMAKE_CURRENT_LIST_DIR}/openzwave/libopenzwave.a)
add_dependencies(ozw project_ozw)
if (APPLE)
    find_library(COREFOUNDATION_LIBRARY CoreFoundation)
    find_library(IOKIT_LIBRARY IOKit)
    set_property(TARGET ozw PROPERTY INTERFACE_LINK_LIBRARIES ${COREFOUNDATION_LIBRARY} ${IOKIT_LIBRARY})
endif()

set(JSON_BuildTests OFF CACHE BOOL "Build the unit tests when BUILD_TESTING is enabled." FORCE)
add_subdirectory(nlohmann-json)

set(CURSES_NEED_NCURSES ON)
find_package(Curses)
if (NOT CURSES_FOUND)
    message(FATAL_ERROR "libedit needs ncurses")
endif()

ExternalProject_Add(project_libedit
    SOURCE_DIR ${CMAKE_CURRENT_LIST_DIR}/libedit
    DOWNLOAD_COMMAND ""
    CONFIGURE_COMMAND ${CMAKE_CURRENT_LIST_DIR}/libedit/configure --prefix=${CMAKE_CURRENT_BINARY_DIR}/libedit-install
    BUILD_COMMAND make
    INSTALL_DIR ${CMAKE_CURRENT_BINARY_DIR}/libedit-install
    INSTALL_COMMAND make install)
add_library(libedit STATIC IMPORTED GLOBAL)
set_property(TARGET libedit PROPERTY IMPORTED_LOCATION ${CMAKE_CURRENT_BINARY_DIR}/libedit-install/lib/libedit.a)
set_property(TARGET libedit PROPERTY INTERFACE_INCLUDE_DIRECTORIES ${CMAKE_CURRENT_BINARY_DIR}/libedit-install/include)
set_property(TARGET libedit PROPERTY INTERFACE_LINK_LIBRARIES ${CURSES_LIBRARIES})
