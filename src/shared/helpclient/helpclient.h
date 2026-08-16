// HelpClient stub for DeepUIDesigner build
// Provides the API that Qt Designer expects

#ifndef HELPCLIENT_H
#define HELPCLIENT_H

#include <memory>
#include <QString>

QT_BEGIN_NAMESPACE

enum class HelpClientType {
    Assistant,
    Web,
    Python
};

class HelpClient
{
public:
    HelpClient() = default;
    virtual ~HelpClient() = default;

    static std::unique_ptr<HelpClient> create(HelpClientType type);

    virtual bool showPage(const QString &url, QString *errorMessage = nullptr) = 0;
    virtual bool activateIdentifier(const QString &id, QString *errorMessage = nullptr) = 0;

    QString designerManualUrl() const { return QString(); }
    QString documentUrl(const QString &page) const { Q_UNUSED(page); return QString(); }
};

QT_END_NAMESPACE

#endif // HELPCLIENT_H
