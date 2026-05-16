// Omni设计师 - Node.js AI 服务管理器 实现

#include "node_server.h"

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QFile>
#include <QTextStream>
#include <QTimer>
#include <QDebug>

QT_BEGIN_NAMESPACE

static const char *SERVER_PORT = "9527";

NodeServer::NodeServer(QObject *parent)
    : QObject(parent)
{
}

NodeServer::~NodeServer()
{
    stop();
}

void NodeServer::setApiKey(const QString &key)
{
    m_apiKey = key;
}

void NodeServer::setServerDir(const QString &dir)
{
    m_serverDir = dir;
}

bool NodeServer::isRunning() const
{
    return m_running && m_process && m_process->state() == QProcess::Running;
}

QString NodeServer::findServerDir() const
{
    if (!m_serverDir.isEmpty() && QDir(m_serverDir).exists())
        return m_serverDir;

    // 搜索相对于可执行文件的路径
    const QString appDir = QCoreApplication::applicationDirPath();
    QStringList candidates = {
        appDir + QStringLiteral("/../../ai-server"),      // build dir → source
        appDir + QStringLiteral("/../ai-server"),
        appDir + QStringLiteral("/ai-server"),
        QStringLiteral("../ai-server"),
        QStringLiteral("ai-server"),
    };

    for (const auto &candidate : candidates) {
        QDir dir(candidate);
        if (dir.exists() && dir.exists(QStringLiteral("package.json"))) {
            return dir.absolutePath();
        }
    }

    // 回退到编译时路径
#ifdef DEEPUI_SOURCE_DIR
    QString compilePath = QStringLiteral(DEEPUI_SOURCE_DIR) + QStringLiteral("/ai-server");
    if (QDir(compilePath).exists())
        return compilePath;
#endif

    return {};
}

QString NodeServer::findNodeExecutable() const
{
    // 在 PATH 中查找 node
#ifdef Q_OS_WIN
    QString nodeExe = QStringLiteral("node.exe");
#else
    QString nodeExe = QStringLiteral("node");
#endif

    // 检查常见 Node.js 安装路径
    QStringList searchPaths = {
#ifdef Q_OS_WIN
        QStringLiteral("C:/Program Files/nodejs"),
        QStringLiteral("C:/Program Files (x86)/nodejs"),
        QDir::homePath() + QStringLiteral("/AppData/Local/fnm"),
        QDir::homePath() + QStringLiteral("/AppData/Roaming/nvm"),
#endif
    };

    for (const auto &path : searchPaths) {
        QFileInfo fi(QDir(path), nodeExe);
        if (fi.exists() && fi.isExecutable())
            return fi.absoluteFilePath();
    }

    // 回退到 PATH 中的 node
    return nodeExe;
}

bool NodeServer::start()
{
    if (isRunning()) {
        qDebug() << "NodeServer: already running";
        return true;
    }

    const QString serverDir = findServerDir();
    if (serverDir.isEmpty()) {
        const QString msg = QStringLiteral("找不到 AI 服务目录 (ai-server/)");
        qWarning() << "NodeServer:" << msg;
        emit errorOccurred(msg);
        return false;
    }

    m_serverDir = serverDir;
    qDebug() << "NodeServer: using server dir:" << m_serverDir;

    tryStart();
    return true;
}

void NodeServer::tryStart()
{
    if (m_retryCount >= MAX_RETRIES) {
        const QString msg = QStringLiteral("AI 服务启动失败，已重试 %1 次").arg(MAX_RETRIES);
        qWarning() << "NodeServer:" << msg;
        emit errorOccurred(msg);
        return;
    }

    if (m_process) {
        m_process->deleteLater();
        m_process = nullptr;
    }

    m_process = new QProcess(this);

    // 从 .env 文件读取配置（用户通过 Web Settings 界面管理）
    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    env.insert(QStringLiteral("PORT"), QString::fromLatin1(SERVER_PORT));

    // 如果代码中设置了 API Key 则优先使用，否则由 .env 或 Settings 界面提供
    if (!m_apiKey.isEmpty()) {
        env.insert(QStringLiteral("API_KEY"), m_apiKey);
    }

    // 尝试读取 .env 文件（与 ai-server 同目录）
    const QString envFile = m_serverDir + QStringLiteral("/.env");
    QFile f(envFile);
    if (f.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QTextStream in(&f);
        while (!in.atEnd()) {
            const QString line = in.readLine().trimmed();
            if (line.isEmpty() || line.startsWith('#')) continue;
            const int eq = line.indexOf('=');
            if (eq > 0) {
                const QString key = line.left(eq).trimmed();
                const QString val = line.mid(eq + 1).trimmed();
                if (!key.isEmpty() && !val.isEmpty() && !env.contains(key)) {
                    env.insert(key, val);
                }
            }
        }
        f.close();
    }

    m_process->setProcessEnvironment(env);

    // 设置工作目录
    m_process->setWorkingDirectory(m_serverDir);

    // 连接信号
    connect(m_process, &QProcess::started,
            this, &NodeServer::onProcessStarted);
    connect(m_process, &QProcess::errorOccurred,
            this, &NodeServer::onProcessErrorOccurred);
    connect(m_process, &QProcess::finished,
            this, &NodeServer::onProcessFinished);
    connect(m_process, &QProcess::readyReadStandardOutput,
            this, &NodeServer::onReadyReadStdout);
    connect(m_process, &QProcess::readyReadStandardError,
            this, &NodeServer::onReadyReadStderr);

    // 启动 Node.js 服务
    // 优先使用打包内的 node.exe，否则使用系统 npm
    const QString bundledNode = m_serverDir + "/../node/node.exe";
    const QString tsxPath = m_serverDir + "/node_modules/tsx/dist/cli.mjs";
    QString program;
    QStringList args;

    if (QFile::exists(bundledNode) && QFile::exists(tsxPath)) {
        // 打包模式：使用内嵌 Node.js
        program = bundledNode;
        args << QStringLiteral("--experimental-vm-modules")
             << tsxPath
             << (m_serverDir + "/src/server.ts");
    } else {
        // 开发模式：使用系统 npm
#ifdef Q_OS_WIN
        program = QStringLiteral("npm.cmd");
#else
        program = QStringLiteral("npm");
#endif
        args << QStringLiteral("start");
    }

    qDebug() << "NodeServer: starting" << program << args.join(' ')
             << "in" << m_serverDir;

    m_process->start(program, args);
}

void NodeServer::stop()
{
    if (!m_process)
        return;

    qDebug() << "NodeServer: stopping...";

    disconnect(m_process, nullptr, this, nullptr);

#ifdef Q_OS_WIN
    // 强制结束 node 进程树（包括子进程）
    QProcess cleanup;
    cleanup.start(QStringLiteral("cmd"), {
        QStringLiteral("/c"),
        QStringLiteral("for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :9527 ^| findstr LISTENING') do taskkill /F /T /PID %a >nul 2>&1")
    });
    cleanup.waitForFinished(2000);
#endif

    if (m_process->state() == QProcess::Running) {
        m_process->terminate();
        if (!m_process->waitForFinished(3000)) {
            m_process->kill();
            m_process->waitForFinished(2000);
        }
    }

    m_process->deleteLater();
    m_process = nullptr;
    m_running = false;
    m_retryCount = 0;

    emit stopped();
}

void NodeServer::onProcessStarted()
{
    qDebug() << "NodeServer: process started";
}

void NodeServer::onProcessErrorOccurred(QProcess::ProcessError error)
{
    QString errorMsg;
    switch (error) {
    case QProcess::FailedToStart:
        errorMsg = QStringLiteral("无法启动 Node.js，请确认已安装 Node.js 并加入 PATH");
        break;
    case QProcess::Crashed:
        errorMsg = QStringLiteral("AI 服务进程崩溃");
        break;
    case QProcess::Timedout:
        errorMsg = QStringLiteral("AI 服务启动超时");
        break;
    default:
        errorMsg = QStringLiteral("AI 服务进程错误: %1").arg(error);
        break;
    }
    qWarning() << "NodeServer:" << errorMsg;
    emit errorOccurred(errorMsg);

    // 重试
    m_retryCount++;
    QTimer::singleShot(RETRY_INTERVAL_MS, this, &NodeServer::tryStart);
}

void NodeServer::onProcessFinished(int exitCode, QProcess::ExitStatus exitStatus)
{
    qDebug() << "NodeServer: process finished, exitCode:" << exitCode
             << "status:" << exitStatus;

    const bool wasRunning = m_running;
    m_running = false;

    if (wasRunning) {
        // 意外退出，尝试重启
        if (exitStatus != QProcess::NormalExit || exitCode != 0) {
            qDebug() << "NodeServer: unexpected exit, retrying...";
            m_retryCount++;
            QTimer::singleShot(RETRY_INTERVAL_MS, this, &NodeServer::tryStart);
        }
    }
}

void NodeServer::onReadyReadStdout()
{
    if (!m_process)
        return;

    const QString output = QString::fromUtf8(m_process->readAllStandardOutput());
    qDebug() << "NodeServer [stdout]:" << output.trimmed();

    // 检测服务启动成功的标志
    if (!m_running && output.contains(QStringLiteral("已启动"))) {
        m_running = true;
        m_retryCount = 0;
        qDebug() << "NodeServer: server is ready";
        emit started();
    }
}

void NodeServer::onReadyReadStderr()
{
    if (!m_process)
        return;

    const QString output = QString::fromUtf8(m_process->readAllStandardError());
    qDebug() << "NodeServer [stderr]:" << output.trimmed();
}

QT_END_NAMESPACE
