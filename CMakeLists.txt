cmake_minimum_required(VERSION 2.8)

set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${PROJECT_BINARY_DIR}/bin)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${PROJECT_BINARY_DIR}/bin)

add_subdirectory(src)

if (EXISTS "rules.ninja")
  add_custom_target(release COMMAND cmake -GNinja -DCMAKE_BUILD_TYPE=Release . WORKING_DIRECTORY .)
  add_custom_target(debug COMMAND cmake -GNinja -DCMAKE_BUILD_TYPE=Debug . WORKING_DIRECTORY .)
else()
  add_custom_target(release COMMAND cmake -DCMAKE_BUILD_TYPE=Release . WORKING_DIRECTORY)
  add_custom_target(debug COMMAND cmake -DCMAKE_BUILD_TYPE=Debug . WORKING_DIRECTORY)
endif()
