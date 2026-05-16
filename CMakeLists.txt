cmake_minimum_required(VERSION 3.16)

# DeepUIDesigner - AI-powered Qt UI Designer
# Build against a pre-installed Qt 6.5+ SDK
project(DeepUIDesigner VERSION 1.0.0 LANGUAGES CXX)

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

# Private Qt modules
find_package(Qt6DesignerComponentsPrivate REQUIRED)

# Qt private headers required
if(NOT TARGET Qt6::CorePrivate)
    message(FATAL_ERROR "Qt6::CorePrivate not found. A Qt SDK with private headers is required.")
endif()

# ---- Designer core sources ----
set(DESIGNER_SOURCES
    # Main entry (modified)
    src/designer/main.cpp
    # Designer core (from Qt qttools, with DeepUIDesigner modifications)
    src/designer/appfontdialog.cpp
    src/designer/mainwindow.cpp
    src/designer/newform.cpp
    src/designer/preferencesdialog.cpp
    src/designer/qdesigner.cpp
    src/designer/qdesigner_actions.cpp
    src/designer/qdesigner_appearanceoptions.cpp
    src/designer/qdesigner_formwindow.cpp
    src/designer/qdesigner_server.cpp
    src/designer/qdesigner_settings.cpp
    src/designer/qdesigner_toolwindow.cpp
    src/designer/qdesigner_workbench.cpp
    src/designer/saveformastemplate.cpp
    src/designer/versiondialog.cpp
    # Shared Qt sources
    src/shared/fontpanel/fontpanel.cpp
    src/shared/qttoolbardialog/qttoolbardialog.cpp
    src/shared/helpclient/helpclient.cpp
    src/shared/helpclient/assistantclient.cpp
    # AI Panel (DeepUIDesigner additions)
    src/components/aipanel/ai_bridge.cpp
    src/components/aipanel/ai_toolwindow.cpp
    src/components/aipanel/file_watcher.cpp
    src/components/aipanel/node_server.cpp
)

# ---- Designer component sources ----
set(COMPONENT_SOURCES
    src/components/lib/qdesigner_components.cpp
    src/components/formeditor/default_actionprovider.cpp
    src/components/formeditor/default_container.cpp
    src/components/formeditor/default_layoutdecoration.cpp
    src/components/formeditor/deviceprofiledialog.cpp
    src/components/formeditor/dpi_chooser.cpp
    src/components/formeditor/embeddedoptionspage.cpp
    src/components/formeditor/formeditor.cpp
    src/components/formeditor/formeditor_optionspage.cpp
    src/components/formeditor/formwindow.cpp
    src/components/formeditor/formwindow_dnditem.cpp
    src/components/formeditor/formwindow_widgetstack.cpp
    src/components/formeditor/formwindowcursor.cpp
    src/components/formeditor/formwindowmanager.cpp
    src/components/formeditor/formwindowsettings.cpp
    src/components/formeditor/itemview_propertysheet.cpp
    src/components/formeditor/layout_propertysheet.cpp
    src/components/formeditor/line_propertysheet.cpp
    src/components/formeditor/previewactiongroup.cpp
    src/components/formeditor/qdesigner_resource.cpp
    src/components/formeditor/qlayoutwidget_propertysheet.cpp
    src/components/formeditor/qmainwindow_container.cpp
    src/components/formeditor/qmdiarea_container.cpp
    src/components/formeditor/qwizard_container.cpp
    src/components/formeditor/spacer_propertysheet.cpp
    src/components/formeditor/templateoptionspage.cpp
    src/components/formeditor/tool_widgeteditor.cpp
    src/components/formeditor/widgetselection.cpp
    src/components/propertyeditor/brushpropertymanager.cpp
    src/components/propertyeditor/designerpropertymanager.cpp
    src/components/propertyeditor/fontpropertymanager.cpp
    src/components/propertyeditor/newdynamicpropertydialog.cpp
    src/components/propertyeditor/paletteeditor.cpp
    src/components/propertyeditor/paletteeditorbutton.cpp
    src/components/propertyeditor/pixmapeditor.cpp
    src/components/propertyeditor/previewframe.cpp
    src/components/propertyeditor/previewwidget.cpp
    src/components/propertyeditor/propertyeditor.cpp
    src/components/propertyeditor/qlonglongvalidator.cpp
    src/components/propertyeditor/resetdecorator.cpp
    src/components/propertyeditor/stringlisteditor.cpp
    src/components/propertyeditor/stringlisteditorbutton.cpp
    src/components/propertyeditor/texteditor.cpp
    src/components/objectinspector/objectinspector.cpp
    src/components/objectinspector/objectinspectormodel.cpp
    src/components/widgetbox/widgetbox.cpp
    src/components/widgetbox/widgetbox_dnditem.cpp
    src/components/widgetbox/widgetboxcategorylistview.cpp
    src/components/widgetbox/widgetboxtreewidget.cpp
    src/components/taskmenu/button_taskmenu.cpp
    src/components/taskmenu/combobox_taskmenu.cpp
    src/components/taskmenu/containerwidget_taskmenu.cpp
    src/components/taskmenu/groupbox_taskmenu.cpp
    src/components/taskmenu/inplace_editor.cpp
    src/components/taskmenu/inplace_widget_helper.cpp
    src/components/taskmenu/itemlisteditor.cpp
    src/components/taskmenu/label_taskmenu.cpp
    src/components/taskmenu/layouttaskmenu.cpp
    src/components/taskmenu/lineedit_taskmenu.cpp
    src/components/taskmenu/listwidget_taskmenu.cpp
    src/components/taskmenu/listwidgeteditor.cpp
    src/components/taskmenu/menutaskmenu.cpp
    src/components/taskmenu/tablewidget_taskmenu.cpp
    src/components/taskmenu/tablewidgeteditor.cpp
    src/components/taskmenu/taskmenu_component.cpp
    src/components/taskmenu/textedit_taskmenu.cpp
    src/components/taskmenu/toolbar_taskmenu.cpp
    src/components/taskmenu/treewidget_taskmenu.cpp
    src/components/taskmenu/treewidgeteditor.cpp
    src/components/signalsloteditor/connectdialog.cpp
    src/components/signalsloteditor/signalslot_utils.cpp
    src/components/signalsloteditor/signalsloteditor.cpp
    src/components/signalsloteditor/signalsloteditor_plugin.cpp
    src/components/signalsloteditor/signalsloteditor_tool.cpp
    src/components/signalsloteditor/signalsloteditorwindow.cpp
    src/components/tabordereditor/tabordereditor.cpp
    src/components/tabordereditor/tabordereditor_plugin.cpp
    src/components/tabordereditor/tabordereditor_tool.cpp
    src/components/buddyeditor/buddyeditor.cpp
    src/components/buddyeditor/buddyeditor_plugin.cpp
    src/components/buddyeditor/buddyeditor_tool.cpp
)

set(DESIGNER_ALL_SOURCES ${DESIGNER_SOURCES} ${COMPONENT_SOURCES})

# ---- Include directories ----
set(DESIGNER_INCLUDES
    src/designer
    src/designer/extra
    src/shared/fontpanel
    src/shared/qttoolbardialog
    src/shared/helpclient
    src/components/aipanel
    src/components/lib
    src/components/formeditor
    src/components/propertyeditor
    src/components/objectinspector
    src/components/widgetbox
    src/components/taskmenu
    src/components/signalsloteditor
    src/components/tabordereditor
    src/components/buddyeditor
    # Private Qt Designer headers (from qttools-src)
    src/lib/extension
    src/lib/sdk
    src/lib/shared
)

# ---- Executable ----
add_executable(DeepUIDesigner ${DESIGNER_ALL_SOURCES} resources/designer.rc)

target_include_directories(DeepUIDesigner PRIVATE ${DESIGNER_INCLUDES})

target_link_libraries(DeepUIDesigner PRIVATE
    Qt6::CorePrivate
    Qt6::DesignerPrivate
    Qt6::DesignerComponentsPrivate
    Qt6::Gui
    Qt6::Network
    Qt6::WebEngineWidgets
    Qt6::Widgets
    Qt6::Xml
)

target_compile_definitions(DeepUIDesigner PRIVATE
    DEEPUI_SOURCE_DIR="${CMAKE_SOURCE_DIR}"
)

if(WIN32)
    set_target_properties(DeepUIDesigner PROPERTIES WIN32_EXECUTABLE TRUE)
endif()

# ---- ui2html converter tool ----
add_executable(ui2html
    tools/ui2html.cpp
    tools/styles.cpp
    resources/designer.rc
)
target_include_directories(ui2html PRIVATE tools)
target_link_libraries(ui2html PRIVATE Qt6::Core Qt6::Xml)
if(WIN32)
    set_target_properties(ui2html PROPERTIES WIN32_EXECUTABLE FALSE)
endif()

# ---- Install ----
install(TARGETS DeepUIDesigner ui2html RUNTIME DESTINATION .)
install(DIRECTORY ai-server/ DESTINATION ai-server
    PATTERN "node_modules" EXCLUDE)
install(DIRECTORY data/ DESTINATION data)
