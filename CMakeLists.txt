cmake_minimum_required(VERSION 3.16)

# OmniDER (DeepUIDesigner) - Standalone Build
# Builds against a pre-built Qt 6.5+ SDK (requires Qt Designer with private headers)
project(OmniDER VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# ---- Find Qt ----
find_package(Qt6 REQUIRED COMPONENTS
    Core
    Gui
    Widgets
    Xml
    Network
    WebEngineWidgets
    Designer
)

# Private Qt modules (separate packages in pre-built SDK)
find_package(Qt6DesignerComponentsPrivate REQUIRED)

# Qt private headers required
if(NOT TARGET Qt6::CorePrivate)
    message(FATAL_ERROR "Qt6::CorePrivate not found. A Qt SDK with private headers is required.")
endif()

set(DESIGNER_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src/designer")
set(SHARED_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src/shared")
set(AIPANEL_SRC_DIR "${CMAKE_CURRENT_SOURCE_DIR}/src/components/aipanel")

# ---- Designer app sources (designer core + shared + AI panel) ----
set(DESIGNER_SOURCES
    ${DESIGNER_SRC_DIR}/appfontdialog.cpp
    ${DESIGNER_SRC_DIR}/main.cpp
    ${DESIGNER_SRC_DIR}/mainwindow.cpp
    ${DESIGNER_SRC_DIR}/newform.cpp
    ${DESIGNER_SRC_DIR}/preferencesdialog.cpp
    ${DESIGNER_SRC_DIR}/qdesigner.cpp
    ${DESIGNER_SRC_DIR}/qdesigner_actions.cpp
    ${DESIGNER_SRC_DIR}/qdesigner_appearanceoptions.cpp
    ${DESIGNER_SRC_DIR}/qdesigner_formwindow.cpp
    ${DESIGNER_SRC_DIR}/qdesigner_server.cpp
    ${DESIGNER_SRC_DIR}/qdesigner_settings.cpp
    ${DESIGNER_SRC_DIR}/qdesigner_toolwindow.cpp
    ${DESIGNER_SRC_DIR}/qdesigner_workbench.cpp
    ${DESIGNER_SRC_DIR}/saveformastemplate.cpp
    ${DESIGNER_SRC_DIR}/versiondialog.cpp
    ${SHARED_SRC_DIR}/fontpanel/fontpanel.cpp
    ${SHARED_SRC_DIR}/qttoolbardialog/qttoolbardialog.cpp
    ${SHARED_SRC_DIR}/helpclient/helpclient.cpp
    ${SHARED_SRC_DIR}/helpclient/assistantclient.cpp
    ${AIPANEL_SRC_DIR}/ai_bridge.cpp
    ${AIPANEL_SRC_DIR}/ai_toolwindow.cpp
    ${AIPANEL_SRC_DIR}/file_watcher.cpp
    ${AIPANEL_SRC_DIR}/node_server.cpp
)

# ---- Include directories ----
set(DESIGNER_INCLUDES
    ${DESIGNER_SRC_DIR}
    ${DESIGNER_SRC_DIR}/extra
    ${SHARED_SRC_DIR}/fontpanel
    ${SHARED_SRC_DIR}/qttoolbardialog
    ${SHARED_SRC_DIR}/helpclient
    ${AIPANEL_SRC_DIR}
    # Private Qt Designer headers (mirrored from qttools)
    ${CMAKE_CURRENT_SOURCE_DIR}/src/lib/extension
    ${CMAKE_CURRENT_SOURCE_DIR}/src/lib/sdk
    ${CMAKE_CURRENT_SOURCE_DIR}/src/lib/shared
)

# ---- Executable ----
add_executable(designer ${DESIGNER_SOURCES} resources/designer.rc)

target_include_directories(designer PRIVATE ${DESIGNER_INCLUDES})

target_link_libraries(designer PRIVATE
    Qt6::CorePrivate
    Qt6::DesignerPrivate
    Qt6::DesignerComponentsPrivate
    Qt6::Gui
    Qt6::Network
    Qt6::WebEngineWidgets
    Qt6::Widgets
    Qt6::Xml
)

# Compile definitions (used by ai_bridge/node_server to locate ai-server dir)
target_compile_definitions(designer PRIVATE
    DEEPUI_SOURCE_DIR="${CMAKE_SOURCE_DIR}"
)

if(WIN32)
    set_target_properties(designer PROPERTIES
        WIN32_EXECUTABLE TRUE
    )
endif()

# ---- ui2html converter tool ----
add_executable(ui2html
    tools/ui2html.cpp
    tools/styles.cpp
    resources/designer.rc
)
target_include_directories(ui2html PRIVATE tools)
target_link_libraries(ui2html PRIVATE
    Qt6::Core
    Qt6::Xml
)
if(WIN32)
    set_target_properties(ui2html PROPERTIES WIN32_EXECUTABLE FALSE)
endif()

# ---- Install ----
install(TARGETS designer ui2html RUNTIME DESTINATION .)
install(DIRECTORY ai-server/ DESTINATION ai-server
    PATTERN "node_modules" EXCLUDE)
install(DIRECTORY data/ DESTINATION data)
