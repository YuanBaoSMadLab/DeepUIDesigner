// Stub: AssistantClient - thin wrapper (original: qt5/qttools/src/shared/helpclient/)

#ifndef ASSISTANTCLIENT_H
#define ASSISTANTCLIENT_H

#include <QString>

QT_BEGIN_NAMESPACE

class AssistantClient
{
public:
    AssistantClient() = default;
    ~AssistantClient() = default;

    bool showPage(const QString &url);
    bool activateIdentifier(const QString &id);
};

QT_END_NAMESPACE

#endif // ASSISTANTCLIENT_H
