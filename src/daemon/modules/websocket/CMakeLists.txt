include_directories(../..)

if (POLICY CMP0042)
  cmake_policy(SET CMP0042 NEW)
endif()

add_library(ws_module SHARED WSModule.cpp WebSocket.cpp HttpServer.cpp)
target_link_libraries(ws_module rct modules)

if (APPLE)
  find_library(SECURITY_LIBRARY Security)
  target_link_libraries(ws_module ${SECURITY_LIBRARY})
endif()

target_link_libraries(ws_module -L${WSLAY_INSTALL_DIR}/lib -lwslay -Wl,-rpath,${WSLAY_INSTALL_DIR}/lib)

include_directories(${CMAKE_CURRENT_LIST_DIR} ${WSLAY_INSTALL_DIR}/include)
