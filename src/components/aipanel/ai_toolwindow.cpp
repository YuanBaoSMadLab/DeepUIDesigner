// Omni设计师 - AI 工具窗口实现

#include "ai_toolwindow.h"
#include "ai_bridge.h"

#include <QtDesigner/abstractformwindow.h>
#include <QtDesigner/abstractformwindowmanager.h>

#include <QVBoxLayout>
#include <QTimer>
#include <QJsonDocument>
#include <QJsonObject>

static const char *AI_PANEL_URL = "http://localhost:9527";

QT_BEGIN_NAMESPACE

AiToolWindow::AiToolWindow(QDesignerFormEditorInterface *core,
                           QWidget *parent)
    : QWidget(parent)
    , m_core(core)
    , m_webView(new QWebEngineView(this))
    , m_channel(new QWebChannel(this))
    , m_bridge(new AiBridge(core, this))
{
    auto *layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->setSpacing(0);
    layout->addWidget(m_webView);
    setLayout(layout);

    setupWebChannel();

    // 页面加载完成后注入桥接脚本
    connect(m_webView, &QWebEngineView::loadFinished,
            this, &AiToolWindow::onPageLoaded);

    // 加载 AI 面板页面
    m_webView->load(QUrl(QString::fromLatin1(AI_PANEL_URL)));
}

void AiToolWindow::setupWebChannel()
{
    m_bridge->setWebChannel(m_channel);
    m_webView->page()->setWebChannel(m_channel);
}

void AiToolWindow::onPageLoaded(bool ok)
{
    if (!ok) {
        // 重试加载
        QTimer::singleShot(3000, this, [this]() {
            m_webView->load(QUrl(QString::fromLatin1(AI_PANEL_URL)));
        });
        return;
    }

    injectBridgeScript();

    // 如果有待绑定的文件路径，通知前端
    if (!m_pendingFilePath.isEmpty()) {
        notifyFrontendState();
    }
}

void AiToolWindow::injectBridgeScript()
{
    // QWebChannel 桥接已由前端 HTML (qwebchannel.js + initQtBridge) 自行初始化，
    // 不再需要 C++ 端注入脚本。此方法保留用于后续扩展。
}

void AiToolWindow::setUiFilePath(const QString &path)
{
    m_currentFilePath = path;
    m_pendingFilePath = path;

    if (m_bridge) {
        m_bridge->setUiFilePath(path);
    }

    notifyFrontendState();
}

void AiToolWindow::onSelectionChanged()
{
    if (m_bridge) {
        m_bridge->onSelectionChanged();
        notifyFrontendState();
    }
}

void AiToolWindow::notifyFrontendState()
{
    if (!m_bridge)
        return;

    QJsonObject data;
    data[QStringLiteral("uiFilePath")] = m_bridge->uiFilePath();
    data[QStringLiteral("uiFileContent")] = m_bridge->uiFileContent();
    data[QStringLiteral("selectedElement")] = m_bridge->selectedElement();

    QString json = QString::fromUtf8(
        QJsonDocument(data).toJson(QJsonDocument::Compact)
    );

    QString js = QString::fromLatin1(
        "if (typeof window.updateUiState === 'function') {"
        "  window.updateUiState(%1);"
        "}"
    ).arg(json);

    m_webView->page()->runJavaScript(js);
}

QT_END_NAMESPACE
