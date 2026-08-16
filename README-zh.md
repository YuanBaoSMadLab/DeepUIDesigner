# DeepUIDesigner — AI 驱动的 Qt UI 设计器

[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSES/GPL-3.0-only.txt)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)]()
[![Qt](https://img.shields.io/badge/Qt-6.8-green)]()

> 📖 [English Documentation](README.md)

**DeepUIDesigner**（深界设计器 / DeepUI Designer）把 Qt Designer 的可视化编辑能力和大语言模型（DeepSeek / OpenAI 兼容）绑在一起：你用自然语言描述界面需求，AI 直接改 `.ui` XML 文件，画布实时刷新。主打"说人话改界面"。

---

## 目录

- [功能特性](#功能特性)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
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

| 功能 | 说明 |
| --- | --- |
| **完整 Qt Designer** | 控件箱、属性编辑器、对象检查器、信号槽编辑器、布局工具 |
| **AI 对话面板** | 内嵌在属性编辑器下方，自然语言修改 UI |
| **精准 XML 编辑** | 四级渐进匹配 + 结构完整性校验，只改目标控件，不碰其他节点 |
| **滚动备份** | 5 级自动备份 + 对话前快照，AI 改砸了能一键回到提问前 |
| **中文化界面** | 默认简体中文（基于 Qt 翻译体系） |
| **多格式导出** | `.ui` → HTML / JSX / TSX / Vue / XAML |
| **深浅色自适应** | 跟随系统配色，不用手动切换 |

---

## 环境要求

- **Qt SDK 6.8+**（MSVC 2022 64 位）——必须勾选 **Qt Designer (with private headers)** 和 **Qt WebEngine**
- **CMake** 3.16+
- **Ninja**（`pip install ninja` 或随 Qt 安装）
- **Visual Studio 2022**（MSVC C++ 编译器）
- **Rust 工具链**（仅源码编译 AI 内核时需要；直接用发布包则免）
- **Node.js 20+**（可选，仅当你想跑 Node 版回退后端时需要）

### Qt 安装注意事项

私有头文件必须有，装完确认一下：

```
dir C:\Qt\6.8.0\msvc2022_64\include\QtDesigner\6.8.0\QtDesigner\private\
```

能看到 `shared_settings_p.h`、`abstractdialoggui_p.h` 等文件就对了。

---

## 快速开始

### 1. 安装 Qt SDK

从 https://www.qt.io/download 下载 Qt Online Installer，勾选：

```
Qt 6.8.0
  ├── MSVC 2022 64-bit
  ├── Additional Libraries
  │     ├── Qt Designer (Qt Widgets Designer)
  │     └── Qt WebEngine
  └── ...
```

安装路径建议 `C:\Qt\6.8.0\msvc2022_64`。

### 2. 编译 C++ 主程序

```bash
git clone https://github.com/YuanBaoSMadLab/DeepUIDesigner.git
cd DeepUIDesigner

# Windows 命令提示符 (cmd.exe) 中运行：
scripts\build.bat

# Qt 装在其他路径就指定一下：
set QTDIR=D:\Qt\6.8.0\msvc2022_64
scripts\build.bat
```

产物：`build\designer.exe` 和 `build\ui2html.exe`。

### 3. 编译 AI 内核

设计器启动时会自动拉起 AI 内核（监听 9527 端口）。内核首选 Rust 版，Node 版作回退：

```bash
# Rust 内核（推荐，cargo 编译完复制到 ai-server 下，deploy 时会一并带过去）
cd ai-server-rs
cargo build --release
copy target\release\omni-ai-server.exe ..\ai-server\omni-ai-server.exe
cd ..

# Node 版回退（可选；不装的话，找不到 Rust 内核时才需要它）
cd ai-server
npm install
cd ..
```

> 直接用发布包（见"打包发布"）的话这步全省了，包里两套内核都带好了。

### 4. 部署

```bash
scripts\deploy.bat
```

windeployqt 铺 Qt DLL，同时把 `ai-server/`（含内核）复制到 `build\ai-server/`。

### 5. 配置 API Key

方式 A（推荐）：启动后点 AI 面板的 **设置** 按钮，填 DeepSeek API Key。

方式 B：编辑配置文件。

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

> 兼容 OpenAI：`BASE_URL` 改成 `https://api.openai.com/v1`、`MODEL` 改成 `gpt-4o` 即可。还是 DeepSeek 好用。

### 6. 运行

```bash
build\designer.exe
```

1. 打开或新建 `.ui` 文件
2. 画布上选中一个控件
3. AI 面板输入需求（比如"把这个按钮改成蓝色圆角"）
4. AI 修改后画布自动刷新

首次启动等 3~5 秒让内核起来；关闭主程序时 AI 内核会一起退出。

---

## 使用指南

### AI 对话

```
选中控件 → 输入需求 → AI 修改 → 画布自动刷新
```

| 操作 | 方法 |
| --- | --- |
| 修改控件样式 | 选中后输入"改成蓝色圆角，字体 14px" |
| 调整布局 | 选中后在 AI 面板点布局优化 |
| 批量修改 | 画布上多选，AI 同时改 |
| 回退修改 | 点 **恢复到提问前** 一键撤销本次对话的全部改动 |
| 从备份恢复 | 点 **回退** 选历史版本 |

### 语言

默认就是简体中文，不需要额外设置。

### 导出

菜单栏 **File → Export → HTML...**，支持 HTML / JSX / TSX / Vue / XAML / .ui。

---

## 项目架构

```
┌─────────────────────────────────────────────────┐
│              designer.exe (C++/Qt)                │
│  ┌──────────┐ ┌───────────────────────────────┐ │
│  │ WidgetBox │ │       MDI 设计画布             │ │
│  └──────────┘ └───────────────────────────────┘ │
│  ┌────────────────────────────────────────────┐ │
│  │ ObjectInspector │ PropertyEditor           │ │
│  ├────────────────────────────────────────────┤ │
│  │  AI 面板 (QWebEngineView)                │ │
│  │   ├── AiBridge (QWebChannel C++ ↔ JS)     │ │
│  │   ├── NodeServer (QProcess 管理 AI 内核)   │ │
│  │   └── FileWatcher (.ui 文件变更监控)       │ │
│  └────────────────────────────────────────────┘ │
└───────────────────┬─────────────────────────────┘
                    │ HTTP localhost:9527
                    ▼
┌─────────────────────────────────────────────────┐
│  AI 内核 (ai-server/)                            │
│   ├── Rust 版 (omni-ai-server.exe，主力)        │
│   │    ├── /api/chat      SSE 流式对话          │
│   │    ├── /api/chat/apply 备份 / 回退          │
│   │    ├── /api/export    多格式导出            │
│   │    └── /api/ui        状态同步              │
│   └── Node 版 (TypeScript，回退，接口一致)      │
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
  → AI 调用 ui_read / ui_edit 工具改 .ui XML
  → 前端调用 aiBridge.refreshDesigner()
  → Designer 重新加载文件 → 画布刷新
```

---

## 目录结构

```
DeepUIDesigner/
├── CMakeLists.txt          # 顶层 CMake 构建脚本
├── README.md               # 英文文档
├── README-zh.md            # 本文件
├── LICENSES/               # 第三方许可证
│
├── src/                    # C++ 源码
│   ├── designer/           # Qt Designer 主程序
│   │   └── main.cpp        # 入口：语言配置 + AI 后端启动
│   ├── components/         # Designer 组件
│   │   ├── aipanel/        # AI 集成模块
│   │   │   ├── ai_bridge.*      # QWebChannel C++↔JS 桥接
│   │   │   ├── ai_toolwindow.*  # QWebEngineView AI 聊天面板
│   │   │   ├── node_server.*    # AI 内核进程管理（Rust 优先）
│   │   │   └── file_watcher.*   # .ui 文件变更监控
│   │   ├── formeditor/     # 表单编辑器
│   │   ├── propertyeditor/ # 属性编辑器
│   │   ├── objectinspector/# 对象检查器
│   │   └── ...             # 其余 Designer 组件
│   └── lib/                # Qt Designer 私有头文件
│
├── ai-server/              # AI 后端（Node 回退版 + 前端页面）
│   ├── .env.example        # API Key 模板
│   └── src/
│       ├── server.ts       # 服务入口（端口 9527）
│       ├── routes/         # chat / apply / ui-state 路由
│       ├── ai/             # 客户端、提示词、XML 编辑工具
│       └── ui/             # AI 聊天面板前端
│
├── ai-server-rs/           # AI 内核 Rust 版（主力）
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs         # 路由装配
│       ├── chat.rs         # SSE 流式对话 + Agent 工具循环
│       ├── client.rs       # DeepSeek 客户端
│       ├── session.rs      # 会话分层上下文
│       ├── tools.rs        # ui_read / ui_edit / ui_write
│       └── ...             # 备份、导出、状态同步等
│
├── tools/                  # ui2html：.ui → HTML 转换器
├── data/                   # ui4.xsd 等数据文件
├── resources/              # 图标等资源
│
└── scripts/                # 构建部署脚本
    ├── build.bat           # 编译
    ├── deploy.bat          # 部署
    ├── pack.bat            # 打包发布
    └── verify-rs.ps1       # Rust 内核功能自检
```

---

## 脚本说明

### `scripts\build.bat` — 编译

```
用法:
  scripts\build.bat              # 编译 (Release)
  scripts\build.bat clean        # 清理后编译

环境变量:
  QTDIR    Qt SDK 路径 (默认: C:\Qt\6.8.0\msvc2022_64)

流程:
  1. 设置 MSVC 2022 编译环境 (vcvarsall.bat)
  2. CMake 配置 (Ninja, Release)
  3. 编译 designer + ui2html
  4. 产物在 build\designer.exe / build\ui2html.exe
```

### `scripts\deploy.bat` — 部署

```
流程:
  1. windeployqt 复制 Qt DLL 到 build\
  2. 复制 ai-server\（含 AI 内核）到 build\ai-server\
  3. 复制 data\ 到 build\data\

依赖说明:
  ai-server\node_modules 会随目录整体复制；若源码克隆后没有
  （node_modules 不入库），按上面"编译 AI 内核"一节补即可。
```

### `scripts\pack.bat` — 打包发布

```
流程:
  1. 从 build\ 复制文件到 Output\DeepUIDesigner-v1.0.0\
  2. 清理构建产物（CMake 缓存、autogen、pdb 等）
  3. 生成 Start-Designer.bat 启动器
  4. 压缩为 Output\DeepUIDesigner-v1.0.0.zip

输出: Output\DeepUIDesigner-v1.0.0.zip
```

### `scripts\verify-rs.ps1` — Rust 内核自检

覆盖 22 项检查（静态页、设置、建议、UI 状态、备份回退、导出、真实 AI 对话等），每次改内核后跑一遍，全绿才算稳。加 `-IncludeChat` 会触发真实 DeepSeek 对话。

---

## 打包发布

完整流程：

```batch
scripts\build.bat
scripts\deploy.bat
scripts\pack.bat
```

产物 `Output\DeepUIDesigner-v1.0.0.zip`，解压后结构：

```
DeepUIDesigner-v1.0.0/
├── Start-Designer.bat     ← 双击启动
├── designer.exe
├── ui2html.exe
├── Qt6*.dll               ← Qt 运行库 (windeployqt)
├── platforms/             ← Qt 平台插件
├── imageformats/          ← 图片格式插件
├── translations/          ← 翻译文件
├── deepui.json            ← 语言配置
├── data/                  ← XSD 文件
└── ai-server/             ← AI 内核（Rust exe + Node 回退 + node_modules）
```

> API Key 不会打进包里，用户需要自行配置。

---

## 常见问题

### Q: 编译报错 "Qt6::CorePrivate not found"

A: Qt SDK 缺私有头文件。重跑 Qt Online Installer，勾上 Qt Designer 组件。

### Q: AI 面板显示"无法连接"

A: AI 内核没起来。检查：

1. `build\ai-server\omni-ai-server.exe` 是否存在（没有就按"编译 AI 内核"一节编译）
2. `build\ai-server\node_modules\` 是否存在（Rust 内核缺失时走 Node 回退需要它）
3. 端口 9527 是否被占用：`netstat -ano | findstr :9527`

### Q: 关闭主程序后 AI 内核还占着端口

A: 正常情况下关闭主程序会把内核一起杀掉。如果是被强杀（任务管理器结束进程）可能有残留，手动 `taskkill /F /T /PID <进程号>` 清理。

### Q: 构建时找不到 MSVC

A: 在**命令提示符 (cmd.exe)** 里跑 `scripts\build.bat`，别用 PowerShell 或 Git Bash。

### Q: 怎么换 AI 模型

A: 编辑 `build\ai-server\.env` 或 AI 面板设置界面改 `MODEL` 和 `BASE_URL`。

- DeepSeek: `MODEL=deepseek-chat`、`BASE_URL=https://api.deepseek.com`
- OpenAI: `MODEL=gpt-4o`、`BASE_URL=https://api.openai.com/v1`
- 其他 OpenAI 兼容接口同样支持

### Q: macOS 能编译吗

A: 理论上可以（Qt for macOS + Xcode CLT），但 `scripts\build.bat` 是 Windows 专用，需要手动 cmake。欢迎贡献 macOS 构建脚本。

---

## 技术栈与致谢

| 层级 | 技术 |
| --- | --- |
| 桌面 UI | C++17, Qt 6.x Widgets |
| AI 聊天 UI | HTML/CSS/JS, QWebEngineView |
| C++ ↔ JS 通信 | Qt QWebChannel |
| AI 后端 | Rust (axum，主力) + Node.js/TypeScript (回退) |
| XML 编辑 | 直接操作 .ui 文件 + 四级渐进匹配 |
| 构建系统 | CMake + Ninja |

本项目参考/用到了这些开源项目：

- **[Qt Project](https://www.qt.io/)** — C++ 跨平台框架，Qt Designer
- **[DeepCode CLI](https://github.com/anthropics/deepcode-cli)** — 上下文管理与工具调用的设计思路
- **[Qt-to-HTML](https://github.com/ashok-s-das/Qt-to-HTML)** — .ui 到 HTML 的转换器
- **[html-to-xaml](https://github.com/Restless-Development/html-to-xaml)** — HTML 到 XAML 参考实现

---

## 许可证

DeepUIDesigner 修改部分以 **GPL-3.0** 发布。

本软件包含以下第三方代码的衍生作品：

| 组件 | 原始许可 |
| --- | --- |
| Qt Designer (src/designer/, src/components/) | GPL-3.0-only WITH Qt-GPL-exception-1.0 |
| DeepCode CLI 设计理念 (ai-server/) | Apache-2.0 |
| ui2html (tools/) | LGPL-2.0+ |

详见 [LICENSES/](LICENSES/) 目录。
