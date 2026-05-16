// Copyright (C) 2016 The Qt Company Ltd.
// SPDX-License-Identifier: LicenseRef-Qt-Commercial OR GPL-3.0-only WITH Qt-GPL-exception-1.0

#include "qdesigner.h"
#include <QtCore/qtranslator.h>
#include <QtCore/qlocale.h>
#include <QtCore/qlibraryinfo.h>
#include <QtCore/qjsondocument.h>
#include <QtCore/qjsonobject.h>
#include <QtCore/qfile.h>
#include <QtCore/qdir.h>

#include "../components/aipanel/node_server.h"

QT_USE_NAMESPACE

int main(int argc, char *argv[])
{
    // required for QWebEngineView
    QCoreApplication::setAttribute(Qt::AA_ShareOpenGLContexts);

    QDesigner app(argc, argv);

    // 读取语言配置 deepui.json（位于 exe 同目录）
    const QString appDir = QCoreApplication::applicationDirPath();
    QString preferredLanguage;
    QFile configFile(appDir + "/deepui.json");
    if (configFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QJsonDocument doc = QJsonDocument::fromJson(configFile.readAll());
        preferredLanguage = doc.object().value("language").toString();
        configFile.close();
    }

    // 确定目标语言：配置优先，否则跟随系统
    const QLocale targetLocale = preferredLanguage.isEmpty()
        ? QLocale::system()
        : QLocale(preferredLanguage);

    // 加载翻译 — 直接用完整路径，避免 QTranslator::load 的文件名解析问题
    QTranslator qtTranslator, qtbaseTranslator, designerTranslator;
    const QStringList transDirs = {
        appDir + "/translations",                                       // 部署目录
        "C:/Users/38820/omnider-build/Qt/6.8.0/msvc2022_64/translations", // Qt SDK (fallback)
        QLibraryInfo::path(QLibraryInfo::TranslationsPath),             // Qt 内置路径
    };

    // 构造递减的 locale 名称：zh_Hans_CN → zh_CN → zh
    QStringList locNames;
    const QStringList uiLangs = targetLocale.uiLanguages();
    for (const QString &lang : uiLangs) {
        const QString us = QString(lang).replace('-', '_');
        if (!locNames.contains(us))
            locNames << us;
    }
    const QString nameStr = QString(targetLocale.name()).replace('-', '_');
    if (!locNames.contains(nameStr))
        locNames << nameStr;

    for (const QString &dir : transDirs) {
        for (const QString &ln : locNames) {
            if (qtTranslator.isEmpty())
                qtTranslator.load("qt_" + ln, dir);
            if (qtbaseTranslator.isEmpty())
                qtbaseTranslator.load("qtbase_" + ln, dir);
            if (designerTranslator.isEmpty())
                designerTranslator.load("designer_" + ln, dir);
        }
    }

    if (!qtTranslator.isEmpty()) app.installTranslator(&qtTranslator);
    if (!qtbaseTranslator.isEmpty()) app.installTranslator(&qtbaseTranslator);
    if (!designerTranslator.isEmpty()) app.installTranslator(&designerTranslator);

    switch (app.parseCommandLineArguments()) {
    case QDesigner::ParseArgumentsSuccess:
        break;
    case QDesigner::ParseArgumentsError:
        return 1;
    case QDesigner::ParseArgumentsHelpRequested:
        return 0;
    }
    QGuiApplication::setQuitOnLastWindowClosed(false);

    // 启动 AI 后端服务（API Key 通过 Web 界面 Settings 配置，存储在 .env 文件）
    NodeServer nodeServer;
    nodeServer.start();

    // 确保退出时释放端口
    QObject::connect(&app, &QCoreApplication::aboutToQuit, [&nodeServer]() {
        nodeServer.stop();
    });

    const int ret = QApplication::exec();
    return ret;
}
