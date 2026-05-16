// Omni设计师 - AI Bridge 实现

#include "ai_bridge.h"

#include <QtDesigner/abstractformeditor.h>
#include <QDir>
#include <QTimer>
#include <QtDesigner/abstractformwindow.h>
#include <QtDesigner/abstractformwindowcursor.h>
#include <QBuffer>
#include <QtDesigner/abstractformwindowmanager.h>
#include <QtDesigner/abstractobjectinspector.h>

#include <QFile>
#include <QFileInfo>
#include <QXmlStreamWriter>

QT_BEGIN_NAMESPACE

AiBridge::AiBridge(QDesignerFormEditorInterface *core, QObject *parent)
    : QObject(parent)
    , m_core(core)
{
}

void AiBridge::setWebChannel(QWebChannel *channel)
{
    m_channel = channel;
    if (m_channel) {
        m_channel->registerObject(QStringLiteral("aiBridge"), this);
    }
}

void AiBridge::setUiFilePath(const QString &path)
{
    if (m_uiFilePath != path) {
        m_uiFilePath = path;
        m_uiFileContent = readFileContent(path);
        emit stateChanged();
    }
}

void AiBridge::setSelectedElement(const QString &elementXml)
{
    if (m_selectedElement != elementXml) {
        m_selectedElement = elementXml;
        emit stateChanged();
    }
}

void AiBridge::notifyStateChanged()
{
    emit stateChanged();
}

void AiBridge::onActiveFormWindowChanged(QDesignerFormWindowInterface *fw)
{
    if (fw) {
        const QString fileName = fw->fileName();
        // 不绑定临时文件，等用户保存到正式路径后再绑定
        if (!fileName.isEmpty() && !isTempFile(fileName)) {
            setUiFilePath(fileName);
        }
    }
}

bool AiBridge::isTempFile(const QString &path) const
{
    return path.contains(QDir::tempPath());
}

void AiBridge::onSelectionChanged()
{
    QString xml = serializeCurrentElement();
    setSelectedElement(xml);
}

// ---- JS 可调用的槽 ----

QString AiBridge::getUiFilePath()
{
    return m_uiFilePath;
}

QString AiBridge::getUiFileContent()
{
    // 每次都重新读取以确保最新
    if (!m_uiFilePath.isEmpty()) {
        m_uiFileContent = readFileContent(m_uiFilePath);
    }
    return m_uiFileContent;
}

QString AiBridge::getSelectedElement()
{
    // 实时获取当前选中元素
    QString xml = serializeCurrentElement();
    if (!xml.isEmpty()) {
        m_selectedElement = xml;
    }
    return m_selectedElement;
}

QString AiBridge::getObjectTree()
{
    // 返回空数组；完整实现需要 Qt 内部 API
    return QStringLiteral("[]");
}

void AiBridge::reloadForm()
{
    refreshDesigner();
}

QString AiBridge::refreshDesigner()
{
    if (m_uiFilePath.isEmpty()) return QStringLiteral("ERR: no file");
    if (!m_core) return QStringLiteral("ERR: no core");

    QDesignerFormWindowInterface *fw = m_core->formWindowManager()->activeFormWindow();
    if (!fw) return QStringLiteral("ERR: no active window");

    QFile f(m_uiFilePath);
    if (!f.open(QIODevice::ReadOnly | QIODevice::Text))
        return QStringLiteral("ERR: cannot open ") + m_uiFilePath;

    QString err;
    bool ok = fw->setContents(&f, &err);
    f.close();

    return ok ? QStringLiteral("OK") : QStringLiteral("ERR: ") + err;
}

// ---- 私有方法 ----

QString AiBridge::readFileContent(const QString &path) const
{
    if (path.isEmpty())
        return {};

    QFile file(path);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text))
        return {};

    return QString::fromUtf8(file.readAll());
}

QString AiBridge::serializeCurrentElement() const
{
    QDesignerFormWindowManagerInterface *fwm = m_core->formWindowManager();
    if (!fwm)
        return {};

    QDesignerFormWindowInterface *fw = fwm->activeFormWindow();
    if (!fw)
        return {};

    // 支持多选：序列化所有选中的控件
    QDesignerFormWindowCursorInterface *cursor = fw->cursor();
    if (!cursor)
        return {};

    const int count = cursor->selectedWidgetCount();
    if (count == 0) {
        // 没有选中任何控件，返回当前控件
        QWidget *current = cursor->current();
        if (!current) return {};
        return serializeWidget(current);
    }

    QStringList results;
    for (int i = 0; i < count; i++) {
        QWidget *w = cursor->selectedWidget(i);
        if (w) {
            results.append(serializeWidget(w));
        }
    }
    return results.join(QStringLiteral("\n"));
}

QString AiBridge::serializeWidget(QWidget *w) const
{
    // 生成该控件的基本 XML 表示，包含 AI 识别所需的关键属性
    QString result;
    QXmlStreamWriter xml(&result);
    xml.setAutoFormatting(true);
    xml.setAutoFormattingIndent(2);

    const QMetaObject *meta = w->metaObject();
    xml.writeStartElement(QStringLiteral("widget"));
    xml.writeAttribute(QStringLiteral("class"), QString::fromUtf8(meta->className()));
    xml.writeAttribute(QStringLiteral("name"), w->objectName());

    // ---- 几何 ----
    xml.writeStartElement(QStringLiteral("property"));
    xml.writeAttribute(QStringLiteral("name"), QStringLiteral("geometry"));
    xml.writeTextElement(QStringLiteral("rect"),
                         QString::fromUtf8("%1, %2, %3, %4")
                             .arg(w->x()).arg(w->y())
                             .arg(w->width()).arg(w->height()));
    xml.writeEndElement();

    // ---- 关键识别属性（动态查询） ----
    auto prop = [w](const char *name) -> QVariant {
        return w->property(name);
    };

    // text (QAbstractButton, QLabel, QCheckBox, etc.)
    if (const QVariant v = prop("text"); v.isValid() && !v.toString().isEmpty()) {
        xml.writeStartElement(QStringLiteral("property"));
        xml.writeAttribute(QStringLiteral("name"), QStringLiteral("text"));
        xml.writeTextElement(QStringLiteral("string"), v.toString());
        xml.writeEndElement();
    }
    // title (QGroupBox, QDockWidget, etc.)
    if (const QVariant v = prop("title"); v.isValid() && !v.toString().isEmpty()) {
        xml.writeStartElement(QStringLiteral("property"));
        xml.writeAttribute(QStringLiteral("name"), QStringLiteral("title"));
        xml.writeTextElement(QStringLiteral("string"), v.toString());
        xml.writeEndElement();
    }
    // windowTitle (top-level widgets)
    if (const QVariant v = prop("windowTitle"); v.isValid() && !v.toString().isEmpty()) {
        xml.writeStartElement(QStringLiteral("property"));
        xml.writeAttribute(QStringLiteral("name"), QStringLiteral("windowTitle"));
        xml.writeTextElement(QStringLiteral("string"), v.toString());
        xml.writeEndElement();
    }
    // toolTip
    if (const QVariant v = prop("toolTip"); v.isValid() && !v.toString().isEmpty()) {
        xml.writeStartElement(QStringLiteral("property"));
        xml.writeAttribute(QStringLiteral("name"), QStringLiteral("toolTip"));
        xml.writeTextElement(QStringLiteral("string"), v.toString());
        xml.writeEndElement();
    }
    // placeholderText (QLineEdit, QTextEdit, etc.)
    if (const QVariant v = prop("placeholderText"); v.isValid() && !v.toString().isEmpty()) {
        xml.writeStartElement(QStringLiteral("property"));
        xml.writeAttribute(QStringLiteral("name"), QStringLiteral("placeholderText"));
        xml.writeTextElement(QStringLiteral("string"), v.toString());
        xml.writeEndElement();
    }

    // styleSheet
    if (!w->styleSheet().isEmpty()) {
        xml.writeStartElement(QStringLiteral("property"));
        xml.writeAttribute(QStringLiteral("name"), QStringLiteral("styleSheet"));
        xml.writeTextElement(QStringLiteral("string"), w->styleSheet());
        xml.writeEndElement();
    }

    xml.writeEndElement(); // widget
    return result;
}

QT_END_NAMESPACE
