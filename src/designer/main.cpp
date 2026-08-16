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

    // 语言配置放 deepui.json 里，跟 exe 同目录
    const QString appDir = QCoreApplication::applicationDirPath();
    QString preferredLanguage;
    QFile configFile(appDir + "/deepui.json");
    if (configFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QJsonDocument doc = QJsonDocument::fromJson(configFile.readAll());
        preferredLanguage = doc.object().value("language").toString();
        configFile.close();
    }

    // 语言优先级：配置里写了用配置的，否则跟系统走
    const QLocale targetLocale = preferredLanguage.isEmpty()
        ? QLocale::system()
        : QLocale(preferredLanguage);

    // 加载翻译；路径给全，免得 QTranslator 自己解析文件名出错
    QTranslator qtTranslator, qtbaseTranslator, designerTranslator;
    const QStringList transDirs = {
        appDir + "/translations",                                       // 发布时拷过去的翻译
        "C:/Qt/6.8.0/msvc2022_64/translations",                          // 本机 Qt SDK 的翻译（兜底）
        QLibraryInfo::path(QLibraryInfo::TranslationsPath),             // Qt 自己算出来的翻译路径
    };

    // locale 名从长到短逐级试：zh_Hans_CN → zh_CN → zh
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

    // 启动 AI 后端；API Key 在网页 Settings 里配，存进 .env
    NodeServer nodeServer;
    nodeServer.start();

    // 退出前把后端停掉，别占着 9527
    QObject::connect(&app, &QCoreApplication::aboutToQuit, [&nodeServer]() {
        nodeServer.stop();
    });

    const int ret = QApplication::exec();
    return ret;
}
