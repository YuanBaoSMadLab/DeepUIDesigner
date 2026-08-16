// Copyright (C) 2016 The Qt Company Ltd.
// SPDX-License-Identifier: LicenseRef-Qt-Commercial OR GPL-3.0-only WITH Qt-GPL-exception-1.0

#include "qdesigner.h"
#include "qdesigner_toolwindow.h"
#include "qdesigner_settings.h"
#include "qdesigner_workbench.h"

#include <QtDesigner/abstractpropertyeditor.h>
#include <QtDesigner/abstractformeditor.h>
#include <QtDesigner/abstractactioneditor.h>
#include <QtDesigner/abstractobjectinspector.h>
#include <QtDesigner/abstractwidgetbox.h>
#include <QtDesigner/QDesignerComponents>

#include <QtDesigner/abstractformwindow.h>
#include <QtDesigner/abstractformwindowmanager.h>
#include "../components/aipanel/ai_toolwindow.h"
#include "../components/aipanel/ai_bridge.h"
#include "../components/aipanel/file_watcher.h"

#include <QtGui/qaction.h>
#include <QtGui/qevent.h>

#include <QtCore/qdebug.h>
#include <QtCore/qfile.h>

static constexpr bool debugToolWindow = false;

QT_BEGIN_NAMESPACE

using namespace Qt::StringLiterals;

static constexpr int margin = 20;

// ---------------- QDesignerToolWindow
QDesignerToolWindow::QDesignerToolWindow(QDesignerWorkbench *workbench,
                                         QWidget *w,
                                         const QString &objectName,
                                         const QString &title,
                                         const QString &actionObjectName,
                                         Qt::DockWidgetArea dockAreaHint,
                                         QWidget *parent,
                                         Qt::WindowFlags flags) :
    MainWindowBase(parent, flags),
    m_dockAreaHint(dockAreaHint),
    m_workbench(workbench),
    m_action(new QAction(this))
{
    setObjectName(objectName);
    setCentralWidget(w);

    setWindowTitle(title);

    m_action->setObjectName(actionObjectName);
    m_action->setShortcutContext(Qt::ApplicationShortcut);
    m_action->setText(title);
    m_action->setCheckable(true);
    connect(m_action, &QAction::triggered, this, &QDesignerToolWindow::showMe);
}

void QDesignerToolWindow::showMe(bool v)
{
    // Access the QMdiSubWindow in MDI mode.
    if (QWidget *target = m_workbench->mode() == DockedMode ? parentWidget() : this) {
        if (v)
            target->setWindowState(target->windowState() & ~Qt::WindowMinimized);
        target->setVisible(v);
    }
}

void QDesignerToolWindow::showEvent(QShowEvent *e)
{
    Q_UNUSED(e);

    bool blocked = m_action->blockSignals(true);
    m_action->setChecked(true);
    m_action->blockSignals(blocked);
}

void QDesignerToolWindow::hideEvent(QHideEvent *e)
{
    Q_UNUSED(e);

    bool blocked = m_action->blockSignals(true);
    m_action->setChecked(false);
    m_action->blockSignals(blocked);
}

QAction *QDesignerToolWindow::action() const
{
    return m_action;
}

void QDesignerToolWindow::changeEvent(QEvent *e)
{
    switch (e->type()) {
        case QEvent::WindowTitleChange:
            m_action->setText(windowTitle());
            break;
        case QEvent::WindowIconChange:
            m_action->setIcon(windowIcon());
            break;
        default:
            break;
    }
    QMainWindow::changeEvent(e);
}

QDesignerWorkbench *QDesignerToolWindow::workbench() const
{
    return m_workbench;
}

//  ---------------------- PropertyEditorToolWindow

static inline QWidget *createPropertyEditor(QDesignerFormEditorInterface *core, QWidget *parent = nullptr)
{
    QDesignerPropertyEditorInterface *widget = QDesignerComponents::createPropertyEditor(core, parent);
    core->setPropertyEditor(widget);
    return widget;
}

class PropertyEditorToolWindow : public QDesignerToolWindow
{
public:
    explicit PropertyEditorToolWindow(QDesignerWorkbench *workbench);

    QRect geometryHint(const QRect &) const override;

protected:
    void showEvent(QShowEvent *event) override;
};

PropertyEditorToolWindow::PropertyEditorToolWindow(QDesignerWorkbench *workbench) :
    QDesignerToolWindow(workbench,
                        createPropertyEditor(workbench->core()),
                        u"qt_designer_propertyeditor"_s,
                        QDesignerToolWindow::tr("Property Editor"),
                        u"__qt_property_editor_action"_s,
                        Qt::RightDockWidgetArea)
{
    action()->setShortcut(Qt::CTRL | Qt::Key_I);

}

QRect PropertyEditorToolWindow::geometryHint(const QRect &g) const
{
    const int spacing = 40;
    const QSize sz(g.width() * 1/4, g.height() * 4/6);

    const QRect rc = QRect((g.right() + 1 - sz.width() - margin),
                           (g.top() + margin + g.height() * 1/6) + spacing,
                           sz.width(), sz.height());
    if (debugToolWindow)
        qDebug() << Q_FUNC_INFO << rc;
    return rc;
}

void PropertyEditorToolWindow::showEvent(QShowEvent *event)
{
    if (QDesignerPropertyEditorInterface *e = workbench()->core()->propertyEditor()) {
        // workaround to update the propertyeditor when it is not visible!
        e->setObject(e->object()); // ### remove me
    }

    QDesignerToolWindow::showEvent(event);
}

//  ---------------------- ActionEditorToolWindow

static inline QWidget *createActionEditor(QDesignerFormEditorInterface *core, QWidget *parent = nullptr)
{
    QDesignerActionEditorInterface *widget = QDesignerComponents::createActionEditor(core, parent);
    core->setActionEditor(widget);
    return widget;
}

class ActionEditorToolWindow: public QDesignerToolWindow
{
public:
    explicit ActionEditorToolWindow(QDesignerWorkbench *workbench);

    QRect geometryHint(const QRect &g) const override;
};

ActionEditorToolWindow::ActionEditorToolWindow(QDesignerWorkbench *workbench) :
    QDesignerToolWindow(workbench,
                        createActionEditor(workbench->core()),
                        u"qt_designer_actioneditor"_s,
                        QDesignerToolWindow::tr("Action Editor"),
                        u"__qt_action_editor_tool_action"_s,
                        Qt::RightDockWidgetArea)
{
}

QRect ActionEditorToolWindow::geometryHint(const QRect &g) const
{
    const QSize sz(g.width() * 1/4, g.height() * 1/6);

    const QRect rc = QRect((g.right() + 1 - sz.width() - margin),
                            g.top() + margin,
                            sz.width(), sz.height());
    if (debugToolWindow)
        qDebug() << Q_FUNC_INFO << rc;
    return rc;
}

//  ---------------------- ObjectInspectorToolWindow

static inline QWidget *createObjectInspector(QDesignerFormEditorInterface *core, QWidget *parent = nullptr)
{
    QDesignerObjectInspectorInterface *widget = QDesignerComponents::createObjectInspector(core, parent);
    core->setObjectInspector(widget);
    return widget;
}

class ObjectInspectorToolWindow: public QDesignerToolWindow
{
public:
    explicit ObjectInspectorToolWindow(QDesignerWorkbench *workbench);

    QRect geometryHint(const QRect &g) const override;
};

ObjectInspectorToolWindow::ObjectInspectorToolWindow(QDesignerWorkbench *workbench) :
    QDesignerToolWindow(workbench,
                        createObjectInspector(workbench->core()),
                        u"qt_designer_objectinspector"_s,
                        QDesignerToolWindow::tr("Object Inspector"),
                        u"__qt_object_inspector_tool_action"_s,
                        Qt::RightDockWidgetArea)
{
}

QRect ObjectInspectorToolWindow::geometryHint(const QRect &g) const
{
    const QSize sz(g.width() * 1/4, g.height() * 1/6);

    const QRect rc = QRect((g.right() + 1 - sz.width() - margin),
                            g.top() + margin,
                           sz.width(), sz.height());
    if (debugToolWindow)
        qDebug() << Q_FUNC_INFO << rc;
    return rc;
}

//  ---------------------- ResourceEditorToolWindow

class ResourceEditorToolWindow: public QDesignerToolWindow
{
public:
    explicit ResourceEditorToolWindow(QDesignerWorkbench *workbench);

    QRect geometryHint(const QRect &g) const override;
};

ResourceEditorToolWindow::ResourceEditorToolWindow(QDesignerWorkbench *workbench)  :
    QDesignerToolWindow(workbench,
                        QDesignerComponents::createResourceEditor(workbench->core(), nullptr),
                        u"qt_designer_resourceeditor"_s,
                        QDesignerToolWindow::tr("Resource Browser"),
                        u"__qt_resource_editor_tool_action"_s,
                        Qt::RightDockWidgetArea)
{
}

QRect ResourceEditorToolWindow::geometryHint(const QRect &g) const
{
    const QSize sz(g.width() * 1/3, g.height() * 1/6);
    QRect r(QPoint(0, 0), sz);
    r.moveCenter(g.center());
    r.moveBottom(g.bottom() - margin);
    if (debugToolWindow)
        qDebug() << Q_FUNC_INFO << r;
    return r;
}

//  ---------------------- SignalSlotEditorToolWindow

class SignalSlotEditorToolWindow: public QDesignerToolWindow
{
public:
    explicit SignalSlotEditorToolWindow(QDesignerWorkbench *workbench);

    QRect geometryHint(const QRect &g) const override;
};

SignalSlotEditorToolWindow::SignalSlotEditorToolWindow(QDesignerWorkbench *workbench) :
    QDesignerToolWindow(workbench,
                        QDesignerComponents::createSignalSlotEditor(workbench->core(), nullptr),
                        u"qt_designer_signalsloteditor"_s,
                        QDesignerToolWindow::tr("Signal/Slot Editor"),
                        u"__qt_signal_slot_editor_tool_action"_s,
                        Qt::RightDockWidgetArea)
{
}

QRect SignalSlotEditorToolWindow::geometryHint(const QRect &g) const
{
    const QSize sz(g.width() * 1/3, g.height() * 1/6);
    QRect r(QPoint(0, 0), sz);
    r.moveCenter(g.center());
    r.moveTop(margin + g.top());
    if (debugToolWindow)
        qDebug() << Q_FUNC_INFO << r;
    return r;
}

//  ---------------------- AiPanelToolWindow

class AiPanelToolWindow: public QDesignerToolWindow
{
public:
    explicit AiPanelToolWindow(QDesignerWorkbench *workbench);

    QRect geometryHint(const QRect &g) const override;

    AiToolWindow *aiWidget() const { return m_aiWidget; }

protected:
    void showEvent(QShowEvent *event) override;

private:
    void connectFormSelection(QDesignerFormWindowInterface *fw);

    AiToolWindow *m_aiWidget;
    FileWatcher *m_fileWatcher;
    QMetaObject::Connection m_selectionConnection;
    QMetaObject::Connection m_fileNameConnection;
};

static inline QWidget *createAiPanel(QDesignerFormEditorInterface *core, QWidget *parent = nullptr)
{
    auto *widget = new AiToolWindow(core, parent);
    return widget;
}

AiPanelToolWindow::AiPanelToolWindow(QDesignerWorkbench *workbench) :
    QDesignerToolWindow(workbench,
                        createAiPanel(workbench->core()),
                        u"qt_designer_aipanel"_s,
                        QDesignerToolWindow::tr("AI 设计助手"),
                        u"__qt_ai_panel_action"_s,
                        Qt::RightDockWidgetArea),
    m_aiWidget(static_cast<AiToolWindow *>(centralWidget())),
    m_fileWatcher(new FileWatcher(this))
{
    action()->setShortcut(Qt::CTRL | Qt::Key_J);

    // 连接表单窗口变化信号
    QDesignerFormWindowManagerInterface *fwm = workbench->core()->formWindowManager();
    if (fwm) {
        QObject::connect(fwm, &QDesignerFormWindowManagerInterface::activeFormWindowChanged,
                         this, [this](QDesignerFormWindowInterface *fw) {
            if (fw && !fw->fileName().isEmpty()) {
                m_aiWidget->setUiFilePath(fw->fileName());
                m_fileWatcher->watchFile(fw->fileName());
            }
            // 连接选中元素变化信号
            connectFormSelection(fw);
        });
    }

    // 初始化时检查是否已有激活的表单窗口
    if (fwm && fwm->activeFormWindow()) {
        QDesignerFormWindowInterface *fw = fwm->activeFormWindow();
        if (!fw->fileName().isEmpty()) {
            m_aiWidget->setUiFilePath(fw->fileName());
            m_fileWatcher->watchFile(fw->fileName());
        }
        connectFormSelection(fw);
    }

    // 文件变化 → 重新加载当前窗体内容
    QObject::connect(m_fileWatcher, &FileWatcher::fileChanged,
                     workbench, [this, workbench](const QString &path) {
        // 重新读取文件内容并更新当前窗体（而非新开窗体）
        QDesignerFormWindowManagerInterface *fwm = workbench->core()->formWindowManager();
        if (!fwm) return;
        QDesignerFormWindowInterface *fw = fwm->activeFormWindow();
        if (!fw) return;

        QFile file(path);
        if (file.open(QIODevice::ReadOnly | QIODevice::Text)) {
            QString errorMessage;
            if (!fw->setContents(&file, &errorMessage)) {
                qWarning() << "AI修改后重载失败:" << errorMessage;
            }
            file.close();
        }
    });
}

QRect AiPanelToolWindow::geometryHint(const QRect &g) const
{
    const QSize sz(g.width() * 1/4, g.height() * 1/3);
    const QRect rc = QRect((g.right() + 1 - sz.width() - 20),
                            g.top() + 20 + g.height() * 2/3,
                            sz.width(), sz.height());
    return rc;
}

void AiPanelToolWindow::showEvent(QShowEvent *event)
{
    // 同步当前激活表单
    QDesignerFormWindowManagerInterface *fwm = workbench()->core()->formWindowManager();
    if (fwm && fwm->activeFormWindow()) {
        QDesignerFormWindowInterface *fw = fwm->activeFormWindow();
        m_aiWidget->setUiFilePath(fw->fileName());
        // 同步选中状态
        connectFormSelection(fw);
        m_aiWidget->onSelectionChanged();
    }
    QDesignerToolWindow::showEvent(event);
}

void AiPanelToolWindow::connectFormSelection(QDesignerFormWindowInterface *fw)
{
    // 断开旧的连接
    if (m_selectionConnection) {
        QObject::disconnect(m_selectionConnection);
        m_selectionConnection = {};
    }
    if (m_fileNameConnection) {
        QObject::disconnect(m_fileNameConnection);
        m_fileNameConnection = {};
    }

    if (!fw)
        return;

    // 监听选中元素变化
    m_selectionConnection = QObject::connect(
        fw, &QDesignerFormWindowInterface::selectionChanged,
        m_aiWidget, [this]() {
            m_aiWidget->onSelectionChanged();
        });

    // 监听文件名变化（Save As 后自动重新绑定）
    m_fileNameConnection = QObject::connect(
        fw, &QDesignerFormWindowInterface::fileNameChanged,
        m_aiWidget, [this](const QString &fileName) {
            if (!fileName.isEmpty()) {
                m_aiWidget->setUiFilePath(fileName);
                m_fileWatcher->watchFile(fileName);
            }
        });

    // 立即同步一次当前选中状态
    m_aiWidget->onSelectionChanged();
}

//  ---------------------- WidgetBoxToolWindow

static inline QWidget *createWidgetBox(QDesignerFormEditorInterface *core, QWidget *parent = nullptr)
{
    QDesignerWidgetBoxInterface *widget = QDesignerComponents::createWidgetBox(core, parent);
    core->setWidgetBox(widget);
    return widget;
}

class WidgetBoxToolWindow: public QDesignerToolWindow
{
public:
    explicit WidgetBoxToolWindow(QDesignerWorkbench *workbench);

    QRect geometryHint(const QRect &g) const override;
};

WidgetBoxToolWindow::WidgetBoxToolWindow(QDesignerWorkbench *workbench) :
    QDesignerToolWindow(workbench,
                        createWidgetBox(workbench->core()),
                        u"qt_designer_widgetbox"_s,
                        QDesignerToolWindow::tr("Widget Box"),
                        u"__qt_widget_box_tool_action"_s,
                        Qt::LeftDockWidgetArea)
{
}

QRect WidgetBoxToolWindow::geometryHint(const QRect &g) const
{
    const  QRect rc = QRect(g.left() + margin,
                            g.top() + margin,
                            g.width() * 1/4, g.height() * 5/6);
    if (debugToolWindow)
        qDebug() << Q_FUNC_INFO << rc;
    return rc;
}

// -- Factory
QDesignerToolWindow *QDesignerToolWindow::createStandardToolWindow(StandardToolWindow which,
                                                                   QDesignerWorkbench *workbench)
{
    switch (which) {
    case ActionEditor:
        return new ActionEditorToolWindow(workbench);
    case ResourceEditor:
        return new ResourceEditorToolWindow(workbench);
    case SignalSlotEditor:
        return new SignalSlotEditorToolWindow(workbench);
    case PropertyEditor:
        return new PropertyEditorToolWindow(workbench);
    case ObjectInspector:
        return new ObjectInspectorToolWindow(workbench);
    case WidgetBox:
        return new WidgetBoxToolWindow(workbench);
    case AiPanel:
        return new AiPanelToolWindow(workbench);
    default:
        break;
    }
    return nullptr;
}


QT_END_NAMESPACE
