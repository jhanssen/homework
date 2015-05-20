cmake_minimum_required(VERSION 2.8)

add_subdirectory(cec)

include_directories(..)

cmake_policy(SET CMP0042 NEW)

add_library(modules SHARED Module.cpp)
target_link_libraries(modules rct)
