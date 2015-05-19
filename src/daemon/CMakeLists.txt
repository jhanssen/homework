cmake_minimum_required(VERSION 2.8)

include_directories(${CMAKE_CURRENT_LIST_DIR})

set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++11")
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS}")

set(SOURCES
    Daemon.cpp
    main.cpp)

add_executable(daemon ${SOURCES})
target_link_libraries(daemon rct common)

#add_custom_command(TARGET daemon POST_BUILD
#  COMMAND ln -sf ${CMAKE_CURRENT_LIST_DIR}/stats ${CMAKE_RUNTIME_OUTPUT_DIRECTORY}
#)
