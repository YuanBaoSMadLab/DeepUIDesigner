// Omni设计师 - AI 工具窗口
// 在属性编辑器下方嵌入 Web 页面作为 AI 聊天面板

#ifndef AI_TOOLWINDOW_H
#define AI_TOOLWINDOW_H

#include <QtDesigner/abstractformeditor.h>

#include <QWidget>
#include <QWebEngineView>
#include <QWebChannel>

QT_BEGIN_NAMESPACE

class QDesignerWorkbench;
class AiBridge;

class AiToolWindow : public QWidget
{
    Q_OBJECT

public:
    explicit AiToolWindow(QDesignerFormEditorInterface *core,
                          QWidget *parent = nullptr);

    AiBridge *bridge() const { return m_bridge; }
    QWebEngineView *webView() const { return m_webView; }

    void setUiFilePath(const QString &path);
    void onSelectionChanged();

private slots:
    void onPageLoaded(bool ok);

private:
    void setupWebChannel();
    void injectBridgeScript();
    void notifyFrontendState();

    QDesignerFormEditorInterface *m_core;
    QWebEngineView *m_webView;
    QWebChannel *m_channel;
    AiBridge *m_bridge;

    QString m_pendingFilePath;
    QString m_currentFilePath;
};

QT_END_NAMESPACE

#endif // AI_TOOLWINDOW_H
