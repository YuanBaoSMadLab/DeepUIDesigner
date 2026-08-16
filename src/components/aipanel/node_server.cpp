// NodeServer 实现

#include "node_server.h"

#include <QCoreApplication>
#include <QDir>
#include <QFileInfo>
#include <QFile>
#include <QTextStream>
#include <QTimer>
#include <QDebug>

QT_BEGIN_NAMESPACE

// 9527：前端页面和后端服务约好的端口，换端口两边得一起换
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

    // 按可执行文件的位置猜几个相对路径
    const QString appDir = QCoreApplication::applicationDirPath();
    QStringList candidates = {
        appDir + QStringLiteral("/../../ai-server"),      // 从 build 目录退回源码树
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

    // 上面都找不到就退回编译时写死的路径
#ifdef DEEPUI_SOURCE_DIR
    QString compilePath = QStringLiteral(DEEPUI_SOURCE_DIR) + QStringLiteral("/ai-server");
    if (QDir(compilePath).exists())
        return compilePath;
#endif

    return {};
}

QString NodeServer::findNodeExecutable() const
{
    // 先翻常见安装目录，找不到就丢 "node.exe" 让系统去 PATH 里找
#ifdef Q_OS_WIN
    QString nodeExe = QStringLiteral("node.exe");
#else
    QString nodeExe = QStringLiteral("node");
#endif

    // fnm、nvm 这类版本管理器装的 node 也一起查
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

    // 兜底：直接让系统从 PATH 里找 node
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

    // 用户是在网页 Settings 里改的配置，落在 .env 文件里，读进来灌进环境变量
    QProcessEnvironment env = QProcessEnvironment::systemEnvironment();
    env.insert(QStringLiteral("PORT"), QString::fromLatin1(SERVER_PORT));

    // 代码里设了 Key 就用它，否则靠 .env / Settings 里配的
    if (!m_apiKey.isEmpty()) {
        env.insert(QStringLiteral("API_KEY"), m_apiKey);
    }

    // 读 .env（在服务目录下），已存在的环境变量不覆盖
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

    // 工作目录切到服务目录，里面的相对路径才找得到
    m_process->setWorkingDirectory(m_serverDir);

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

    // 启动方式按优先级：Rust 内核 > 打包的 node.exe > 系统 npm。
    // 有 Rust 版就用 Rust，跑得快还不依赖用户机器装 Node
    const QString rustExe = m_serverDir + "/omni-ai-server.exe";
    const QString bundledNode = m_serverDir + "/../node/node.exe";
    const QString tsxPath = m_serverDir + "/node_modules/tsx/dist/cli.mjs";
    QString program;
    QStringList args;

    if (QFile::exists(rustExe)) {
        // 用 Rust 内核
        program = rustExe;
    } else if (QFile::exists(bundledNode) && QFile::exists(tsxPath)) {
        // 没 Rust 版，用打包自带的 node.exe + tsx 跑 TS 服务
        program = bundledNode;
        args << QStringLiteral("--experimental-vm-modules")
             << tsxPath
             << (m_serverDir + "/src/server.ts");
    } else {
        // 最后兜底：让系统 npm start（开发时用的）
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
    // npm start 会 fork 出一堆子进程，只杀父进程端口还占着；
    // 先 netstat 找出 9527 的 PID，再 taskkill /F /T 连树带根一起杀
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

    // 起不来就重试
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
        // 非正常退出，自动重启
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

    // 后端打日志说"已启动"了才算真正就绪
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
