// Stub: AssistantClient

#include "assistantclient.h"

#include <QDesktopServices>
#include <QUrl>
#include <QDebug>

QT_BEGIN_NAMESPACE

bool AssistantClient::showPage(const QString &url)
{
    qDebug() << "AssistantClient::showPage:" << url;
    return QDesktopServices::openUrl(QUrl(url));
}

bool AssistantClient::activateIdentifier(const QString &id)
{
    qDebug() << "AssistantClient::activateIdentifier:" << id;
    return true;
}

QT_END_NAMESPACE
