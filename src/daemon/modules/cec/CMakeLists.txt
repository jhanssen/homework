include_directories(../..)

cmake_policy(SET CMP0042 NEW)

add_library(cec_module SHARED CecModule.cpp)
target_link_libraries(cec_module cec rct modules)
