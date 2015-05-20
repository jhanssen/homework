cmake_minimum_required(VERSION 2.8)

include(rct/rct.cmake)
include(common/common.cmake)

add_subdirectory(daemon)

include(ExternalProject)
ExternalProject_Add(
  wslay
  SOURCE_DIR ${CMAKE_CURRENT_LIST_DIR}/wslay
  BINARY_DIR ${CMAKE_CURRENT_BINARY_DIR}/wslay
  UPDATE_COMMAND autoreconf -i && automake && autoconf
  CONFIGURE_COMMAND <SOURCE_DIR>/configure CC=${CMAKE_C_COMPILER} CXX=${CMAKE_CXX_COMPILER} "CXX_FLAGS=${EXTERNAL_CXX_FLAGS}" "LDFLAGS=${EXTERNAL_LD_FLAGS}" --prefix=${CMAKE_CURRENT_BINARY_DIR}/wslay-install
  BUILD_COMMAND make -C lib -j
  INSTALL_COMMAND make -C lib -j install
  )

add_dependencies(common wslay)
add_dependencies(daemon rct common)
