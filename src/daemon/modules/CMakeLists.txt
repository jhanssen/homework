cmake_minimum_required(VERSION 2.8)

add_subdirectory(cec)
add_subdirectory(websocket)

include_directories(..)

cmake_policy(SET CMP0042 NEW)

add_library(modules SHARED Modules.cpp Module.cpp RuleJS.cpp)
target_link_libraries(modules rct)
