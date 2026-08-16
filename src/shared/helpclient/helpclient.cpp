// HelpClient stub implementation for DeepUIDesigner build

#include "helpclient.h"

#include <QDesktopServices>
#include <QUrl>
#include <QDebug>

QT_BEGIN_NAMESPACE

namespace {

class AssistantHelpClient : public HelpClient
{
public:
    bool showPage(const QString &url, QString *errorMessage) override
    {
        Q_UNUSED(errorMessage)
        QDesktopServices::openUrl(QUrl(url));
        return true;
    }
    bool activateIdentifier(const QString &id, QString *errorMessage) override
    {
        Q_UNUSED(errorMessage)
        qDebug() << "HelpClient::activateIdentifier" << id;
        return true;
    }
};

class WebHelpClient : public HelpClient
{
public:
    bool showPage(const QString &url, QString *errorMessage) override
    {
        Q_UNUSED(errorMessage)
        QDesktopServices::openUrl(QUrl(url));
        return true;
    }
    bool activateIdentifier(const QString &id, QString *errorMessage) override
    {
        Q_UNUSED(errorMessage)
        qDebug() << "HelpClient(web)::activateIdentifier" << id;
        return true;
    }
};

class PythonHelpClient : public HelpClient
{
public:
    bool showPage(const QString &url, QString *errorMessage) override
    {
        Q_UNUSED(errorMessage)
        QDesktopServices::openUrl(QUrl(url));
        return true;
    }
    bool activateIdentifier(const QString &id, QString *errorMessage) override
    {
        Q_UNUSED(errorMessage)
        qDebug() << "HelpClient(python)::activateIdentifier" << id;
        return true;
    }
};

} // anonymous namespace

std::unique_ptr<HelpClient> HelpClient::create(HelpClientType type)
{
    switch (type) {
    case HelpClientType::Web:
        return std::make_unique<WebHelpClient>();
    case HelpClientType::Python:
        return std::make_unique<PythonHelpClient>();
    case HelpClientType::Assistant:
    default:
        return std::make_unique<AssistantHelpClient>();
    }
}

QT_END_NAMESPACE
