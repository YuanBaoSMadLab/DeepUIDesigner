# DeepUIDesigner — AI-Powered Qt UI Designer

[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSES/GPL-3.0-only.txt)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()
[![Qt](https://img.shields.io/badge/Qt-6.5%2B-green)]()

> 📖 [中文文档](README-zh.md)

**DeepUIDesigner** (深界设计器 / DeepUI Designer) deeply integrates **Qt Designer**'s visual UI editing capabilities with **Large Language Model** (DeepSeek / OpenAI compatible) AI conversation. Describe your UI requirements in natural language — the AI directly edits `.ui` XML files and refreshes the designer canvas in real time.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
  - [1. Install Qt SDK](#1-install-qt-sdk)
  - [2. Install Node.js](#2-install-nodejs)
  - [3. Build the Project](#3-build-the-project)
  - [4. Configure AI Backend](#4-configure-ai-backend)
  - [5. Run](#5-run)
- [Usage Guide](#usage-guide)
- [Project Architecture](#project-architecture)
- [Directory Structure](#directory-structure)
- [Scripts Reference](#scripts-reference)
- [Packaging & Release](#packaging--release)
- [FAQ](#faq)
- [Tech Stack & Acknowledgements](#tech-stack--acknowledgements)
- [License](#license)

---

## Features


| Feature                      | Description                                                             |
| ---------------------------- | ----------------------------------------------------------------------- |
| **Full Qt Designer**         | Widget box, property editor, object inspector, signal/slot editor, layouts |
| **AI Chat Panel**            | Embedded below the property editor; edit UI via natural language        |
| **Precision XML Editing**    | Four-level progressive matching + structural validation; only the targeted widget is modified |
| **Rolling Backups**          | 5-level automatic backups + pre-chat snapshot; one-click revert to pre-chat state |
| **Multi-language UI**        | 31 languages, switch via Settings → Language                           |
| **Multi-format Export**      | `.ui` → HTML / JSX / TSX / Vue / XAML                                  |
| **Dark/Light Adaptive**      | Follows system color palette; no manual toggle needed                   |

---

## Requirements

### Required Software


| Software             | Minimum Version              | Purpose                                  | Download                            |
| -------------------- | ---------------------------- | ---------------------------------------- | ----------------------------------- |
| **Qt SDK**           | 6.5+ (MSVC 2022)             | C++ UI framework + Designer private headers | https://www.qt.io/download          |
| **CMake**            | 3.16+                        | Build system                             | https://cmake.org/download/         |
| **Ninja**            | Any                          | Build acceleration                       | `pip install ninja` or bundled with Qt |
| **Visual Studio**    | 2022 Community (2026 recommended) | C++ compiler (MSVC)                      | https://visualstudio.microsoft.com/ |
| **Node.js**          | 20+                          | AI backend runtime                       | https://nodejs.org/                 |
| **Git**              | Any                          | Clone the repository                     | https://git-scm.com/                |

### Qt Installation Notes

**Qt private headers are REQUIRED!** During installation, make sure to check:

- Qt 6.8.x → MSVC 2022 64-bit
- Qt → Additional Libraries → **Qt Designer (with private headers)**
- Qt → Additional Libraries → Qt WebEngine

Verify private headers exist after installation:

```
dir C:\Qt\6.8.0\msvc2022_64\include\QtDesigner\6.8.0\QtDesigner\private\
```

You should see `abstractdialoggui_p.h`, `shared_settings_p.h`, and other files.

---

## Quick Start

### 1. Install Qt SDK

Download Qt Online Installer from https://www.qt.io/download and select:

```
Qt 6.8.0
  ├── MSVC 2022 64-bit
  ├── Additional Libraries
  │     ├── Qt Designer (Qt Widgets Designer)
  │     └── Qt WebEngine
  └── ...
```

Recommended install path: `C:\Qt\6.8.0\msvc2022_64`

### 2. Install Node.js

Download the LTS version (20.x or 24.x) from https://nodejs.org/. Verify:

```bash
node --version   # should print v20.x.x or v24.x.x
npm --version    # should print 9.x.x or 10.x.x
```

### 3. Build the Project

```bash
# Clone the repository
git clone https://github.com/YuanBaoSMadLab/DeepUIDesigner.git
cd DeepUIDesigner

# Run in Windows Command Prompt (cmd.exe):
scripts\build.bat

# If Qt is installed elsewhere, set the environment variable:
set QTDIR=D:\Qt\6.8.0\msvc2022_64
scripts\build.bat
```

Successful build output:

```
BUILD SUCCESSFUL!
Output: build\DeepUIDesigner.exe
```

**macOS / Linux users**: Windows batch scripts are not applicable. Run manually:

```bash
cmake -B build -S . -G Ninja -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_PREFIX_PATH=/path/to/Qt/6.8.0/gcc_64
cmake --build build --config Release
```

### 4. Configure AI Backend

#### Method A: Via the UI (Recommended)

1. Launch `build\DeepUIDesigner.exe`
2. Click the **Settings** button in the AI panel
3. Enter your DeepSeek API Key (get one at https://platform.deepseek.com)
4. Model: `deepseek-chat` (default)
5. Save

#### Method B: Edit the config file directly

Copy `.env.example` to `.env` and fill in your key:

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

Then install dependencies:

```bash
cd build\ai-server
npm install
```

> **OpenAI compatible**: Change `BASE_URL` to `https://api.openai.com/v1` and `MODEL` to `gpt-4o`. However, DeepSeek is recommended!

### 5. Run

```bash
# Launch directly
build\Designer.exe

# The AI backend may take 3–5 seconds to start on first run
```

After launching:

1. Open or create a `.ui` file
2. Select a widget on the canvas
3. Type a request in the AI panel (e.g. "make this button blue with rounded corners")
4. The AI modifies and refreshes the canvas automatically

---

## Usage Guide

### AI Conversation

```
Select widget → Type request → AI modifies → Canvas auto-refreshes
```


| Action                  | How                                                               |
| ----------------------- | ----------------------------------------------------------------- |
| Modify widget style     | Select it, then type "make it blue with rounded corners, font 14px" |
| Adjust layout           | Select, then click 📐 Layout in the AI panel                      |
| Batch modifications     | Multi-select on canvas; AI modifies all selected widgets at once  |
| Revert changes          | Click **Revert to pre-chat** to undo all changes from this session |
| Restore from backup     | Click **Revert** and choose a historical version                  |

### Quick Commands

The AI panel automatically generates suggestion buttons based on the current context. You can also type freely in the input box.

### Language Switching

Menu bar: **Settings → Language → 简体中文**, then restart the application.

### Export

Menu bar: **File → Export → HTML...** — supports HTML / JSX / TSX / Vue / XAML / .ui.

---

## Project Architecture

```
┌─────────────────────────────────────────────────┐
│              DeepUIDesigner.exe (C++/Qt)         │
│  ┌──────────┐ ┌───────────────────────────────┐ │
│  │ WidgetBox │ │       MDI Design Canvas        │ │
│  └──────────┘ └───────────────────────────────┘ │
│  ┌────────────────────────────────────────────┐ │
│  │ ObjectInspector │ PropertyEditor           │ │
│  ├────────────────────────────────────────────┤ │
│  │  AI Panel (QWebEngineView)                │ │
│  │   ├── AiBridge (QWebChannel C++ ↔ JS)     │ │
│  │   ├── NodeServer (QProcess manages Node.js)│ │
│  │   └── FileWatcher (.ui file change monitor)│ │
│  └────────────────────────────────────────────┘ │
└───────────────────┬─────────────────────────────┘
                    │ HTTP localhost:9527
                    ▼
┌─────────────────────────────────────────────────┐
│           ai-server/ (Node.js/Express)           │
│  ├── /api/chat       SSE streaming AI chat      │
│  ├── /api/chat/apply Apply edits + backup/revert│
│  ├── /api/suggestions Smart suggestions         │
│  └── /api/export     Multi-format export        │
└────────────────────┬────────────────────────────┘
                     │ HTTPS
                     ▼
          ┌──────────────────┐
          │  DeepSeek / OpenAI │
          └──────────────────┘
```

### Core Data Flow

```
User selects a widget
  → QDesignerFormWindowInterface::selectionChanged
  → AiBridge::onSelectionChanged()
  → QWebChannel pushes JSON to the web frontend
  → Frontend displays context info
User types a request
  → POST /api/chat (SSE)
  → DeepSeek API (streaming response)
  → AI calls ui_read / ui_edit tools
  → Node.js modifies .ui XML file
  → Frontend calls aiBridge.refreshDesigner()
  → Designer reloads file → Canvas refreshes
```

---

## Directory Structure

```
DeepUIDesigner/
├── CMakeLists.txt              # Top-level CMake build script
├── README.md                   # This file (English)
├── README-zh.md                # Chinese documentation
├── .gitignore
├── LICENSES/                   # Third-party licenses
│
├── src/                        # C++ source code
│   ├── designer/               # Qt Designer main program (37 files)
│   │   ├── main.cpp            # ★ Entry point — language config + AI backend startup
│   │   ├── qdesigner_workbench.cpp  # ★ Workbench — language menu
│   │   ├── qdesigner_toolwindow.cpp # ★ Tool window — AI panel registration
│   │   └── ...                 # Remaining Qt Designer core files
│   ├── components/             # Designer components (196 files)
│   │   ├── aipanel/            # ★ AI integration module
│   │   │   ├── ai_bridge.cpp/h      # QWebChannel C++↔JS bridge
│   │   │   ├── ai_toolwindow.cpp/h  # QWebEngineView AI chat window
│   │   │   ├── node_server.cpp/h    # Node.js process lifecycle management
│   │   │   └── file_watcher.cpp/h   # .ui file change monitoring
│   │   ├── formeditor/         # Form editor
│   │   ├── propertyeditor/     # Property editor
│   │   ├── objectinspector/    # Object inspector
│   │   ├── widgetbox/          # Widget box
│   │   ├── taskmenu/           # Context menu
│   │   ├── signalsloteditor/   # Signal/slot editor
│   │   ├── tabordereditor/     # Tab order editor
│   │   ├── buddyeditor/       # Buddy editor
│   │   └── lib/                # Component library entry
│   ├── shared/                 # Qt shared components (8 files)
│   │   ├── fontpanel/          # Font panel
│   │   ├── qttoolbardialog/    # Toolbar dialog
│   │   └── helpclient/         # Help client
│   └── lib/                    # Qt Designer private headers (115 files)
│       ├── extension/          # Extension interfaces
│       ├── sdk/                # SDK interfaces
│       └── shared/             # Internal shared headers
│
├── ai-server/                  # Node.js AI backend (15 files)
│   ├── package.json            # Dependency declaration
│   ├── tsconfig.json           # TypeScript configuration
│   ├── .env.example            # API key template
│   └── src/
│       ├── server.ts           # Express entry point (port 9527)
│       ├── routes/
│       │   ├── chat.ts         # AI chat core (SSE streaming + context management)
│       │   ├── apply.ts        # Edit application + backup/revert
│       │   └── ui-state.ts     # UI state synchronization
│       ├── ai/
│       │   ├── client.ts       # DeepSeek/OpenAI client
│       │   ├── prompts.ts      # System prompt templates
│       │   ├── ui-tools.ts     # XML precision editing engine (core algorithm)
│       │   ├── xml-diff.ts     # XML patch parsing
│       │   └── export.ts       # Multi-format export
│       └── ui/
│           ├── index.html      # AI chat panel frontend
│           └── qwebchannel.js  # Qt WebChannel JS library
│
├── tools/                      # Auxiliary tools (3 files)
│   ├── ui2html.cpp             # .ui → HTML converter
│   ├── styles.h                # Style extraction
│   └── styles.cpp
│
├── data/                       # Data files (7 files)
│   ├── ui4.xsd                 # .ui file XML Schema
│   ├── generate_header.xsl     # Code generation XSL
│   ├── generate_impl.xsl
│   ├── generate_shared.xsl
│   └── generate_ui.py          # Code generation script
│
├── resources/                  # Resource files
│   ├── logo.ico                # Application icon
│   └── designer.rc             # Windows resource file
│
└── scripts/                    # Build scripts
    ├── build.bat               # Build script
    ├── deploy.bat              # Deploy script
    └── pack.bat                # Packaging & release script
```

---

## Scripts Reference

### `scripts/build.bat` — Build

```
Usage:
  scripts\build.bat              # Build (Release)
  scripts\build.bat clean        # Clean then build

Environment variables:
  QTDIR    Qt SDK path (default: C:\Qt\6.8.0\msvc2022_64)

Process:
  1. Set up MSVC 2022 build environment (vcvarsall.bat)
  2. CMake configure (Ninja, Release)
  3. Ninja build
  4. Output to build\DeepUIDesigner.exe + build\ui2html.exe
```

### `scripts/deploy.bat` — Deploy

```
Usage:
  scripts\deploy.bat

Process:
  1. windeployqt copies Qt DLLs to build\
  2. Copies ai-server\ to build\ai-server\
  3. Copies data\ to build\data\

After deployment:
  cd build\ai-server
  npm install          # Required on first run
  cd ..
  DeepUIDesigner.exe          # Launch
```

### `scripts/pack.bat` — Package for Release

```
Usage:
  scripts\pack.bat

Process:
  1. Copy all files from build\
  2. Install ai-server production dependencies (npm install --production)
  3. Create DeepUIDesigner.bat launcher
  4. Compress to DeepUIDesigner-v1.0.0.zip

Output: DeepUIDesigner-v1.0.0.zip
```

---

## Packaging & Release

Full release workflow:

```batch
:: 1. Clean build
scripts\build.bat clean

:: 2. Deploy DLLs + AI backend
scripts\deploy.bat

:: 3. Package into zip
scripts\pack.bat
```

Package directory structure:

```
DeepUIDesigner-v1.0.0/
├── DeepUIDesigner.exe
├── DeepUIDesigner.bat          ← Double-click to launch
├── ui2html.exe
├── Qt6*.dll             ← Qt runtime (windeployqt)
├── platforms/           ← Qt platform plugins
├── imageformats/        ← Image format plugins
├── translations/        ← Qt translation files (31 languages)
├── ai-server/           ← Node.js backend (with node_modules)
├── data/                ← XSD files
└── deepui.json         ← Language config file (optional)
```

> **Note**: The DeepSeek API key is NOT included in the package. Users must configure it themselves.

---

## FAQ

### Q: Build fails with "Qt6::CorePrivate not found"

A: The Qt SDK is missing private headers. Re-run Qt Online Installer and make sure the Qt Designer component is checked.

### Q: AI panel shows "Unable to connect"

A: The AI backend did not start. Check:

1. Does `build\ai-server\` exist?
2. Does `build\ai-server\node_modules\` exist? (run `npm install`)
3. Is port 9527 already in use? `netstat -ano | findstr :9527`

### Q: The UI is in English

A: Menu bar → **Settings → Language → 简体中文**, then restart the application.

### Q: Build can't find MSVC

A: Make sure to run `scripts\build.bat` from **Command Prompt (cmd.exe)**, not PowerShell or Git Bash.

### Q: How do I switch AI models

A: Edit `build\ai-server\.env` or use the AI panel Settings dialog to change `MODEL` and `BASE_URL`.

- DeepSeek: `MODEL=deepseek-chat`, `BASE_URL=https://api.deepseek.com`
- OpenAI: `MODEL=gpt-4o`, `BASE_URL=https://api.openai.com/v1`
- Other OpenAI-compatible providers are also supported

### Q: Can I build on macOS

A: Theoretically yes — requires Qt for macOS (clang) + Xcode Command Line Tools. `scripts/build.bat` does not apply; use manual cmake commands. macOS build script contributions are welcome.

---

## Tech Stack & Acknowledgements


| Layer                  | Technology                                      |
| ---------------------- | ----------------------------------------------- |
| Desktop UI             | C++17, Qt 6.x Widgets                           |
| AI Chat UI             | HTML/CSS/JS (Vanilla), QWebEngineView           |
| C++ ↔ JS Communication | Qt QWebChannel                                  |
| AI Backend             | Node.js, TypeScript, Express, OpenAI SDK        |
| XML Editing            | Direct .ui file manipulation + 4-level matching |
| Build System           | CMake 3.16+, Ninja                              |

This project is built upon the excellent work of these open-source projects:

- **[Qt Project](https://www.qt.io/)** — Cross-platform C++ framework, Qt Designer
- **[DeepCode CLI](https://github.com/anthropics/deepcode-cli)** — Context management and tool-calling design for AI coding assistants
- **[Qt-to-HTML](https://github.com/ashok-s-das/Qt-to-HTML)** — .ui file to HTML converter
- **[html-to-xaml](https://github.com/Restless-Development/html-to-xaml)** — HTML to XAML reference implementation

---

## License

The DeepUIDesigner modifications are released under **GPL-3.0**.

This software contains derivative works of the following third-party code:


| Component                                        | Original License                        |
| ------------------------------------------------ | --------------------------------------- |
| Qt Designer (src/designer/, src/components/)     | GPL-3.0-only WITH Qt-GPL-exception-1.0 |
| DeepCode CLI design philosophy (ai-server/)      | Apache-2.0                              |
| ui2html (tools/)                                 | LGPL-2.0+                               |

See the [LICENSES/](LICENSES/) directory for details.
