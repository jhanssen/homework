include_directories(../..)

if (POLICY CMP0042)
  cmake_policy(SET CMP0042 NEW)
endif()

add_library(cec_module SHARED CecModule.cpp)
target_link_libraries(cec_module cec rct modules)
