include_directories(../..)

if (POLICY CMP0042)
  cmake_policy(SET CMP0042 NEW)
endif()

add_library(fake_module SHARED FakeModule.cpp)
target_link_libraries(fake_module rct modules)
