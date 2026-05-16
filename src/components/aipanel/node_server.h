// Omni设计师 - Node.js AI 服务管理器
// 在 Designer 启动/关闭时自动启动/停止 AI 后端

#ifndef NODE_SERVER_H
#define NODE_SERVER_H

#include <QObject>
#include <QProcess>
#include <QString>

QT_BEGIN_NAMESPACE

class NodeServer : public QObject
{
    Q_OBJECT

public:
    explicit NodeServer(QObject *parent = nullptr);
    ~NodeServer() override;

    /// 启动 Node.js 后端服务，返回 true 表示已触发启动（不保证成功）
    bool start();

    /// 停止后端服务
    void stop();

    /// 是否正在运行
    bool isRunning() const;

    /// 设置 API 密钥（通过环境变量传入 Node 进程）
    void setApiKey(const QString &key);

    /// 设置服务器目录路径
    void setServerDir(const QString &dir);

signals:
    void started();          // 服务启动完成（检测到监听端口）
    void stopped();          // 服务已停止
    void errorOccurred(const QString &error);

private slots:
    void onProcessStarted();
    void onProcessErrorOccurred(QProcess::ProcessError error);
    void onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus);
    void onReadyReadStdout();
    void onReadyReadStderr();

private:
    QString findServerDir() const;
    QString findNodeExecutable() const;
    void tryStart();

    QProcess *m_process = nullptr;
    QString m_serverDir;
    QString m_apiKey;
    bool m_running = false;
    int m_retryCount = 0;
    static constexpr int MAX_RETRIES = 3;
    static constexpr int RETRY_INTERVAL_MS = 2000;
};

QT_END_NAMESPACE

#endif // NODE_SERVER_H
