cmake_minimum_required(VERSION 3.15)
project(CFDashboardBackend CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find Drogon (assuming it is installed locally or via a package manager)
find_package(drogon REQUIRED)

add_executable(${PROJECT_NAME} main.cpp GhostArenaController.cc SprintController.cc TelemetryController.cc CodeExplorerController.cc)

target_link_libraries(${PROJECT_NAME} PRIVATE drogon::drogon)
