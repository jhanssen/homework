cmake_minimum_required(VERSION 2.8)

include(rct/rct.cmake)

add_subdirectory(wslay)
set(WSLAY_INCLUDE_DIR ${CMAKE_CURRENT_LIST_DIR}/wslay/lib/includes)
add_subdirectory(daemon)
add_dependencies(daemon rct)
