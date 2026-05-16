// Omni设计师 - AI Bridge
// C++ ↔ JS 桥接，通过 QWebChannel 暴露 UI 状态给 Web 页面

#ifndef AI_BRIDGE_H
#define AI_BRIDGE_H

#include <QObject>
#include <QString>
#include <QWebChannel>

QT_BEGIN_NAMESPACE

class QDesignerFormEditorInterface;
class QDesignerFormWindowInterface;
class QDesignerFormWindowManagerInterface;

class AiBridge : public QObject
{
    Q_OBJECT

public:
    explicit AiBridge(QDesignerFormEditorInterface *core, QObject *parent = nullptr);

    void setWebChannel(QWebChannel *channel);
    void setUiFilePath(const QString &path);
    void setSelectedElement(const QString &elementXml);
    void notifyStateChanged();

    // 从 Designer 回调
    void onActiveFormWindowChanged(QDesignerFormWindowInterface *fw);
    void onSelectionChanged();

    Q_PROPERTY(QString uiFilePath READ uiFilePath NOTIFY stateChanged)
    Q_PROPERTY(QString uiFileContent READ uiFileContent NOTIFY stateChanged)
    Q_PROPERTY(QString selectedElement READ selectedElement NOTIFY stateChanged)

    QString uiFilePath() const { return m_uiFilePath; }
    QString uiFileContent() const { return m_uiFileContent; }
    QString selectedElement() const { return m_selectedElement; }

signals:
    void stateChanged();

public slots:
    // JS 可调用的方法
    QString getUiFilePath();
    QString getUiFileContent();
    QString getSelectedElement();
    QString getObjectTree();
    void reloadForm(); // AI 修改文件后通知 Designer 刷新
    QString refreshDesigner(); // JS 可调，返回状态

private:
    QString readFileContent(const QString &path) const;
    QString serializeCurrentElement() const;
    QString serializeWidget(QWidget *w) const;
    bool isTempFile(const QString &path) const;

    QDesignerFormEditorInterface *m_core;
    QString m_uiFilePath;
    QString m_uiFileContent;
    QString m_selectedElement;
    QWebChannel *m_channel = nullptr;
};

QT_END_NAMESPACE

#endif // AI_BRIDGE_H
