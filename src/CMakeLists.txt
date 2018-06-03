cmake_minimum_required(VERSION 3.9)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

set(RECKONING_EXAMPLES OFF CACHE BOOL "Build examples" FORCE)
add_subdirectory(reckoning)

set(SOURCES
    main.cpp)

include_directories(
    ${CMAKE_CURRENT_LIST_DIR}/device
    ${CMAKE_CURRENT_LIST_DIR}/platform
    ${CMAKE_CURRENT_LIST_DIR}/common)

include(${CMAKE_CURRENT_LIST_DIR}/common/common.cmake)
include(${CMAKE_CURRENT_LIST_DIR}/platform/platforms.cmake)

add_executable(homework ${SOURCES} ${COMMON_SOURCES} ${PLATFORM_SOURCES})
target_link_libraries(homework reckoning ozw nlohmann_json)
