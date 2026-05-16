// Omni设计师 - 文件监控
// 监听 .UI 文件变化，通知 Designer 刷新

#ifndef FILE_WATCHER_H
#define FILE_WATCHER_H

#include <QObject>
#include <QFileSystemWatcher>
#include <QString>

QT_BEGIN_NAMESPACE

class QDesignerFormEditorInterface;

class FileWatcher : public QObject
{
    Q_OBJECT

public:
    explicit FileWatcher(QObject *parent = nullptr);

    void watchFile(const QString &path);
    void unwatchFile(const QString &path);
    void unwatchAll();

signals:
    void fileChanged(const QString &path);

private slots:
    void onFileChanged(const QString &path);

private:
    QFileSystemWatcher *m_watcher;
};

QT_END_NAMESPACE

#endif // FILE_WATCHER_H
