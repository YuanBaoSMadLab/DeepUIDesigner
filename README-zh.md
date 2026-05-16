# DeepUIDesigner— AI 驱动的 Qt UI 设计器

[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSES/GPL-3.0-only.txt)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()
[![Qt](https://img.shields.io/badge/Qt-6.5%2B-green)]()

> 📖 [English Documentation](README.md)

**DeepUIDesigner**（深界设计器 / DeepUI Designer）将 **Qt Designer** 的可视化 UI 编辑能力与 **大语言模型**（DeepSeek / OpenAI 兼容）的 AI 对话能力深度融合。用自然语言描述需求，AI 直接修改 `.ui` XML 文件，实时刷新设计器画布。

---

## 目录

- [功能特性](#功能特性)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
  - [1. 安装 Qt SDK](#1-安装-qt-sdk)
  - [2. 安装 Node.js](#2-安装-nodejs)
  - [3. 编译项目](#3-编译项目)
  - [4. 配置 AI 后端](#4-配置-ai-后端)
  - [5. 运行](#5-运行)
- [使用指南](#使用指南)
- [项目架构](#项目架构)
- [目录结构](#目录结构)
- [脚本说明](#脚本说明)
- [打包发布](#打包发布)
- [常见问题](#常见问题)
- [技术栈与致谢](#技术栈与致谢)
- [许可证](#许可证)

---

## 功能特性


| 功能                 | 说明                                                   |
| -------------------- | ------------------------------------------------------ |
| **完整 Qt Designer** | 控件箱、属性编辑器、对象检查器、信号槽编辑器、布局工具 |
| **AI 对话面板**      | 内嵌于属性编辑器下方，自然语言修改 UI                  |
| **精准 XML 编辑**    | 四级渐进匹配 + 结构完整性校验，只修改目标控件          |
| **滚动备份**         | 5 级自动备份 + 对话前快照，一键恢复到提问前            |
| **多语言界面**       | 31 种语言，Settings → Language 随时切换               |
| **多格式导出**       | `.ui` → HTML / JSX / TSX / Vue / XAML                 |
| **深浅色自适应**     | 跟随系统调色板，不用手动切换                           |

---

## 环境要求

### 必需软件


| 软件              | 最低版本                   | 用途                              | 下载                                |
| ----------------- | -------------------------- | --------------------------------- | ----------------------------------- |
| **Qt SDK**        | 6.5+ (MSVC 2022)           | C++ UI 框架 + Designer 私有头文件 | https://www.qt.io/download          |
| **CMake**         | 3.16+                      | 构建系统                          | https://cmake.org/download/         |
| **Ninja**         | 任意                       | 构建加速                          | `pip install ninja` 或随 Qt 安装    |
| **Visual Studio** | 2022 Community（建议2026） | C++ 编译器 (MSVC)                 | https://visualstudio.microsoft.com/ |
| **Node.js**       | 20+                        | AI 后端运行时                     | https://nodejs.org/                 |
| **Git**           | 任意                       | 克隆仓库                          | https://git-scm.com/                |

### Qt 安装注意事项

**必须安装 Qt 私有头文件！** 安装时勾选：

- Qt 6.8.x → MSVC 2022 64-bit
- Qt → Additional Libraries → **Qt Designer (with private headers)**
- Qt → Additional Libraries → Qt WebEngine

安装后验证私有头文件存在：

```
dir C:\Qt\6.8.0\msvc2022_64\include\QtDesigner\6.8.0\QtDesigner\private\
```

应看到 `abstractdialoggui_p.h`、`shared_settings_p.h` 等文件。

---

## 快速开始

### 1. 安装 Qt SDK

从 https://www.qt.io/download 下载 Qt Online Installer，选择：

```
Qt 6.8.0
  ├── MSVC 2022 64-bit
  ├── Additional Libraries
  │     ├── Qt Designer (Qt Widgets Designer)
  │     └── Qt WebEngine
  └── ...
```

安装路径建议：`C:\Qt\6.8.0\msvc2022_64`

### 2. 安装 Node.js

从 https://nodejs.org/ 下载 LTS 版本（20.x 或 24.x）。安装后验证：

```bash
node --version   # 应输出 v20.x.x 或 v24.x.x
npm --version    # 应输出 9.x.x 或 10.x.x
```

### 3. 编译项目

```bash
# 克隆仓库
git clone https://github.com/YuanBaoSMadLab/DeepUIDesigner.git
cd DeepUIDesigner

# Windows 命令提示符 (cmd.exe) 中运行：
scripts\build.bat

# 如果 Qt 安装在其他路径，设置环境变量：
set QTDIR=D:\Qt\6.8.0\msvc2022_64
scripts\build.bat
```

编译成功后输出：

```
BUILD SUCCESSFUL!
Output: build\DeepUIDesigner.exe
```

**macOS / Linux 用户**：Windows bat 脚本不适用，手动执行：

```bash
cmake -B build -S . -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_PREFIX_PATH=/path/to/Qt/6.8.0/gcc_64
cmake --build build --config Release
```

### 4. 配置 AI 后端

#### 方式 A：通过界面配置（推荐）

1. 启动 `build\DeepUIDesigner.exe`
2. 点击 AI 面板中的 **设置** 按钮
3. 填入 DeepSeek API Key（从 https://platform.deepseek.com 获取）
4. 模型选择 `deepseek-chat`（默认）
5. 保存

#### 方式 B：直接编辑配置文件

复制 `.env.example` 为 `.env` 并填入密钥：

```bash
cd build\ai-server
copy .env.example .env
notepad .env
```

```env
API_KEY=sk-your-deepseek-api-key-here
MODEL=deepseek-chat
BASE_URL=https://api.deepseek.com
```

然后安装依赖：

```bash
cd build\ai-server
npm install
```

> **兼容 OpenAI**：将 `BASE_URL` 改为 `https://api.openai.com/v1`，`MODEL` 改为 `gpt-4o` 即可。但推荐使用Deepseek！

### 5. 运行

```bash
# 直接运行
build\Designer.exe

# 首次运行可能需要等待 AI 后端启动（约 3-5 秒）
```

启动后：

1. 打开或新建 `.ui` 文件
2. 在画布上选中一个控件
3. 在 AI 面板输入需求（如"把这个按钮改成蓝色圆角"）
4. AI 自动修改并刷新画布

---

## 使用指南

### AI 对话

```
选中控件 → 输入需求 → AI 修改 → 画布自动刷新
```


| 操作         | 方法                                |
| ------------ | ----------------------------------- |
| 修改控件样式 | 选中后输入"改成蓝色圆角，字体 14px" |
| 调整布局     | 选中后在 AI 面板点 📐 布局优化      |
| 批量修改     | 在画布上多选，AI 同时修改           |
| 回退修改     | 点击**恢复到提问前** 一键撤销       |
| 从备份恢复   | 点击**回退** 选择历史版本           |

### 快捷命令

AI 面板顶部会根据当前上下文自动生成建议按钮，也可以直接在输入框打字。

### 语言切换

菜单栏：**Settings → Language → 简体中文**，重启生效。

### 导出

菜单栏：**File → Export → HTML...**，支持 HTML / JSX / TSX / Vue / XAML / .ui。

---

## 项目架构

```
┌─────────────────────────────────────────────────┐
│              DeepUIDesigner.exe (C++/Qt)                │
│  ┌──────────┐ ┌───────────────────────────────┐ │
│  │ WidgetBox │ │       MDI 设计画布             │ │
│  └──────────┘ └───────────────────────────────┘ │
│  ┌────────────────────────────────────────────┐ │
│  │ ObjectInspector │ PropertyEditor           │ │
│  ├────────────────────────────────────────────┤ │
│  │  AI 面板 (QWebEngineView)                │ │
│  │   ├── AiBridge (QWebChannel C++ ↔ JS)     │ │
│  │   ├── NodeServer (QProcess 管理 Node.js)   │ │
│  │   └── FileWatcher (.ui 文件变更监控)       │ │
│  └────────────────────────────────────────────┘ │
└───────────────────┬─────────────────────────────┘
                    │ HTTP localhost:9527
                    ▼
┌─────────────────────────────────────────────────┐
│           ai-server/ (Node.js/Express)           │
│  ├── /api/chat       SSE 流式 AI 对话           │
│  ├── /api/chat/apply 修改应用 + 备份回退        │
│  ├── /api/suggestions 智能建议                  │
│  └── /api/export     多格式导出                 │
└────────────────────┬────────────────────────────┘
                     │ HTTPS
                     ▼
          ┌──────────────────┐
          │  DeepSeek / OpenAI │
          └──────────────────┘
```

### 核心数据流

```
用户选中控件
  → QDesignerFormWindowInterface::selectionChanged
  → AiBridge::onSelectionChanged()
  → QWebChannel 推送 JSON 到 Web 前端
  → 前端显示上下文信息
用户输入需求
  → POST /api/chat (SSE)
  → DeepSeek API (流式返回)
  → AI 调用 ui_read / ui_edit 工具
  → Node.js 修改 .ui XML 文件
  → 前端调用 aiBridge.refreshDesigner()
  → Designer 重新加载文件 → 画布刷新
```

---

## 目录结构

```
DeepUIDesigner/
├── CMakeLists.txt              # 顶层 CMake 构建脚本
├── README.md                   # 本文件
├── .gitignore
├── LICENSES/                   # 第三方许可证
│
├── src/                        # C++ 源码
│   ├── designer/               # Qt Designer 主程序 (37 文件)
│   │   ├── main.cpp            # ★ 入口 — 语言配置 + AI 后端启动
│   │   ├── qdesigner_workbench.cpp  # ★ 工作台 — 语言菜单
│   │   ├── qdesigner_toolwindow.cpp # ★ 工具窗口 — AI 面板注册
│   │   └── ...                 # 其余 Qt Designer 核心文件
│   ├── components/             # Designer 组件 (196 文件)
│   │   ├── aipanel/            # ★ AI 集成模块
│   │   │   ├── ai_bridge.cpp/h      # QWebChannel C++↔JS 桥接
│   │   │   ├── ai_toolwindow.cpp/h  # QWebEngineView AI 聊天窗口
│   │   │   ├── node_server.cpp/h    # Node.js 进程生命周期管理
│   │   │   └── file_watcher.cpp/h   # .ui 文件变更监控
│   │   ├── formeditor/         # 表单编辑器
│   │   ├── propertyeditor/     # 属性编辑器
│   │   ├── objectinspector/    # 对象检查器
│   │   ├── widgetbox/          # 控件箱
│   │   ├── taskmenu/           # 右键菜单
│   │   ├── signalsloteditor/   # 信号槽编辑器
│   │   ├── tabordereditor/     # Tab 顺序编辑器
│   │   ├── buddyeditor/       # Buddy 编辑器
│   │   └── lib/                # 组件库入口
│   ├── shared/                 # Qt 共享组件 (8 文件)
│   │   ├── fontpanel/          # 字体面板
│   │   ├── qttoolbardialog/    # 工具栏对话框
│   │   └── helpclient/         # 帮助客户端
│   └── lib/                    # Qt Designer 私有头文件 (115 文件)
│       ├── extension/          # 扩展接口
│       ├── sdk/                # SDK 接口
│       └── shared/             # 内部共享头文件
│
├── ai-server/                  # Node.js AI 后端 (15 文件)
│   ├── package.json            # 依赖声明
│   ├── tsconfig.json           # TypeScript 配置
│   ├── .env.example            # API 密钥模板
│   └── src/
│       ├── server.ts           # Express 入口 (端口 9527)
│       ├── routes/
│       │   ├── chat.ts         # AI 对话核心 (SSE 流式 + 上下文管理)
│       │   ├── apply.ts        # 修改应用 + 备份回退
│       │   └── ui-state.ts     # UI 状态同步
│       ├── ai/
│       │   ├── client.ts       # DeepSeek/OpenAI 客户端
│       │   ├── prompts.ts      # System Prompt 模板
│       │   ├── ui-tools.ts     # XML 精准编辑引擎 (核心算法)
│       │   ├── xml-diff.ts     # XML Patch 解析
│       │   └── export.ts       # 多格式导出
│       └── ui/
│           ├── index.html      # AI 聊天面板前端
│           └── qwebchannel.js  # Qt WebChannel JS 库
│
├── tools/                      # 辅助工具 (3 文件)
│   ├── ui2html.cpp             # .ui → HTML 转换器
│   ├── styles.h                # 样式提取
│   └── styles.cpp
│
├── data/                       # 数据文件 (7 文件)
│   ├── ui4.xsd                 # .ui 文件 XML Schema
│   ├── generate_header.xsl     # 代码生成 XSL
│   ├── generate_impl.xsl
│   ├── generate_shared.xsl
│   └── generate_ui.py          # 代码生成脚本
│
├── resources/                  # 资源文件
│   ├── logo.ico                # 应用图标
│   └── designer.rc             # Windows 资源文件
│
└── scripts/                    # 构建脚本
    ├── build.bat               # 编译脚本
    ├── deploy.bat              # 部署脚本
    └── pack.bat                # 打包发布脚本
```

---

## 脚本说明

### `scripts/build.bat` — 编译

```
用法:
  scripts\build.bat              # 编译 (Release)
  scripts\build.bat clean        # 清理后编译

环境变量:
  QTDIR    Qt SDK 路径 (默认: C:\Qt\6.8.0\msvc2022_64)

流程:
  1. 设置 MSVC 2022 编译环境 (vcvarsall.bat)
  2. CMake 配置 (Ninja, Release)
  3. Ninja 编译
  4. 输出到 build\DeepUIDesigner.exe + build\ui2html.exe
```

### `scripts/deploy.bat` — 部署

```
用法:
  scripts\deploy.bat

流程:
  1. windeployqt 复制 Qt DLL 到 build\
  2. 复制 ai-server\ 到 build\ai-server\
  3. 复制 data\ 到 build\data\

部署后:
  cd build\ai-server
  npm install          # 首次运行需要
  cd ..
  DeepUIDesigner.exe          # 启动
```

### `scripts/pack.bat` — 打包发布

```
用法:
  scripts\pack.bat

流程:
  1. 从 build\ 复制所有文件
  2. 安装 ai-server 生产依赖 (npm install --production)
  3. 创建 DeepUIDesigner.bat 启动器
  4. 压缩为 DeepUIDesigner-v1.0.0.zip

输出: DeepUIDesigner-v1.0.0.zip
```

---

## 打包发布

完整发布流程：

```batch
:: 1. 清理编译
scripts\build.bat clean

:: 2. 部署 DLL + AI 后端
scripts\deploy.bat

:: 3. 打包 zip
scripts\pack.bat
```

打包产物目录结构：

```
DeepUIDesigner-v1.0.0/
├── DeepUIDesigner.exe
├── DeepUIDesigner.bat          ← 双击启动
├── ui2html.exe
├── Qt6*.dll             ← Qt 运行时 (windeployqt)
├── platforms/           ← Qt 平台插件
├── imageformats/        ← 图片格式插件
├── translations/        ← Qt 翻译文件 (31 语言)
├── ai-server/           ← Node.js 后端 (含 node_modules)
├── data/                ← XSD 文件
└── deepui.json         ← 语言配置文件 (可选)
```

> **注意**：deepseek API key 不会包含在打包中，用户需自行配置。

---

## 常见问题

### Q: 编译报错 "Qt6::CorePrivate not found"

A: Qt SDK 缺少私有头文件。重新运行 Qt Online Installer，确保勾选 Qt Designer 组件。

### Q: AI 面板显示 "无法连接"

A: AI 后端未启动。检查：

1. `build\ai-server\` 目录是否存在
2. `build\ai-server\node_modules\` 是否存在（运行 `npm install`）
3. 端口 9527 是否被占用：`netstat -ano | findstr :9527`

### Q: 界面是英文

A: 菜单栏 → **Settings → Language → 简体中文**，重启程序。

### Q: 构建时找不到 MSVC

A: 确保在**命令提示符 (cmd.exe)** 中运行 `scripts\build.bat`，不要在 PowerShell 或 Git Bash 中运行。

### Q: 如何更换 AI 模型

A: 编辑 `build\ai-server\.env` 或通过 AI 面板设置界面修改 `MODEL` 和 `BASE_URL`。

- DeepSeek: `MODEL=deepseek-chat`, `BASE_URL=https://api.deepseek.com`
- OpenAI: `MODEL=gpt-4o`, `BASE_URL=https://api.openai.com/v1`
- 其他兼容接口同样支持

### Q: macOS 能编译吗

A: 理论上支持，需安装 Qt for macOS (clang) + Xcode Command Line Tools。`scripts/build.bat` 不适用，需手动 cmake 命令。欢迎贡献 macOS 构建脚本。

---

## 技术栈与致谢


| 层级          | 技术                                     |
| ------------- | ---------------------------------------- |
| 桌面 UI       | C++17, Qt 6.x Widgets                    |
| AI 聊天 UI    | HTML/CSS/JS (Vanilla), QWebEngineView    |
| C++  JS 通信 | Qt QWebChannel                           |
| AI 后端       | Node.js, TypeScript, Express, OpenAI SDK |
| XML 编辑      | 直接 .ui 文件操作 + 四级渐进匹配         |
| 构建系统      | CMake 3.16+, Ninja                       |

本项目基于以下开源项目的卓越工作：

- **[Qt Project](https://www.qt.io/)** — C++ 跨平台框架，Qt Designer
- **[DeepCode CLI](https://github.com/anthropics/deepcode-cli)** — AI 编程助手的上下文管理与工具调用设计
- **[Qt-to-HTML](https://github.com/ashok-s-das/Qt-to-HTML)** — .ui 文件到 HTML 的转换器
- **[html-to-xaml](https://github.com/Restless-Development/html-to-xaml)** — HTML 到 XAML 的参考实现

---

## 许可证

DeepUIDesigner 修改部分以 **GPL-3.0** 发布。

本软件包含以下第三方代码的衍生作品：


| 组件                                         | 原始许可                               |
| -------------------------------------------- | -------------------------------------- |
| Qt Designer (src/designer/, src/components/) | GPL-3.0-only WITH Qt-GPL-exception-1.0 |
| DeepCode CLI 设计理念 (ai-server/)           | Apache-2.0                             |
| ui2html (tools/)                             | LGPL-2.0+                              |

详见 [LICENSES/](LICENSES/) 目录。
