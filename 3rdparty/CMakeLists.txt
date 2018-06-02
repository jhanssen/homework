cmake_minimum_required(VERSION 3.9)

include(ExternalProject)

ExternalProject_Add(project_ozw
    SOURCE_DIR ${CMAKE_CURRENT_SOURCE_DIR}/openzwave
    CONFIGURE_COMMAND ""
    BUILD_COMMAND make
    INSTALL_DIR ${CMAKE_CURRENT_BINARY_DIR}/openzwave-build
    INSTALL_COMMAND make install)

add_library(ozw STATIC IMPORTED)
set_property(TARGET ozw PROPERTY INTERFACE_INCLUDE_DIRECTORIES ${CMAKE_CURRENT_BINARY_DIR}/openzwave-build/include)
set_property(TARGET ozw PROPERTY IMPORTED_LOCATION ${CMAKE_CURRENT_BINARY_DIR}/openzwave-build/lib/libopenzwave.a)
add_dependencies(ozw project_ozw)
