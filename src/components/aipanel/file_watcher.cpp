// Omni设计师 - 文件监控实现

#include "file_watcher.h"

#include <QFileInfo>
#include <QDebug>

QT_BEGIN_NAMESPACE

FileWatcher::FileWatcher(QObject *parent)
    : QObject(parent)
    , m_watcher(new QFileSystemWatcher(this))
{
    connect(m_watcher, &QFileSystemWatcher::fileChanged,
            this, &FileWatcher::onFileChanged);
}

void FileWatcher::watchFile(const QString &path)
{
    if (path.isEmpty())
        return;

    // 移除旧监听
    if (!m_watcher->files().isEmpty()) {
        m_watcher->removePaths(m_watcher->files());
    }

    if (m_watcher->addPath(path)) {
        qDebug() << "FileWatcher: watching" << path;
    }
}

void FileWatcher::unwatchFile(const QString &path)
{
    if (!path.isEmpty()) {
        m_watcher->removePath(path);
    }
}

void FileWatcher::unwatchAll()
{
    if (!m_watcher->files().isEmpty()) {
        m_watcher->removePaths(m_watcher->files());
    }
}

void FileWatcher::onFileChanged(const QString &path)
{
    // 文件变化后重新添加监听（有些编辑器会删除再创建文件）
    if (!m_watcher->files().contains(path)) {
        QFileInfo fi(path);
        if (fi.exists()) {
            m_watcher->addPath(path);
        }
    }

    qDebug() << "FileWatcher: file changed" << path;
    emit fileChanged(path);
}

QT_END_NAMESPACE
