// NodeServer：跟着 Designer 一起启动/关停 AI 后端服务

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

    /// 启动后端服务；返回 true 只代表启动流程已触发，不保证真起来
    bool start();

    /// 停掉后端服务
    void stop();

    /// 现在还跑着吗
    bool isRunning() const;

    /// 设置 API Key（以环境变量形式传给后端进程）
    void setApiKey(const QString &key);

    /// 指定后端服务目录
    void setServerDir(const QString &dir);

signals:
    void started();          // 服务真起来了（检测到监听端口才算）
    void stopped();          // 服务已停
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
