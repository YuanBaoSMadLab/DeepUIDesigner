// AI 工具窗口实现

#include "ai_toolwindow.h"
#include "ai_bridge.h"

#include <QtDesigner/abstractformwindow.h>
#include <QtDesigner/abstractformwindowmanager.h>

#include <QVBoxLayout>
#include <QTimer>
#include <QJsonDocument>
#include <QJsonObject>

// 9527：前端页面和后端服务约好的端口，换端口两边得一起换
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

    // 等页面加载完再初始化桥接
    connect(m_webView, &QWebEngineView::loadFinished,
            this, &AiToolWindow::onPageLoaded);

    // 打开 AI 面板
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
        // 没加载出来，3 秒后再试
        QTimer::singleShot(3000, this, [this]() {
            m_webView->load(QUrl(QString::fromLatin1(AI_PANEL_URL)));
        });
        return;
    }

    injectBridgeScript();

    // 页面好了，把之前攒下的文件路径补发给前端
    if (!m_pendingFilePath.isEmpty()) {
        notifyFrontendState();
    }
}

void AiToolWindow::injectBridgeScript()
{
    // 前端页面自己用 qwebchannel.js + initQtBridge 把桥接初始化好了，
    // C++ 这边不用再注入脚本；方法留着备用
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
