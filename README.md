# DeepUIDesigner — AI-Powered Qt UI Designer

[![License](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSES/GPL-3.0-only.txt)
[![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)]()
[![Qt](https://img.shields.io/badge/Qt-6.8-green)]()

> 📖 [中文文档](README-zh.md)

**DeepUIDesigner** (深界设计器) fuses Qt Designer's visual UI editing with a large language model (DeepSeek / OpenAI-compatible). Describe the interface you want in plain language, and the AI edits the `.ui` XML directly — the canvas refreshes live. Think "just tell it what you want".

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Architecture](#architecture)
- [Directory Layout](#directory-layout)
- [Scripts](#scripts)
- [Packaging](#packaging)
- [FAQ](#faq)
- [Tech Stack & Credits](#tech-stack--credits)
- [License](#license)

---

## Features

| Feature | What it does |
| --- | --- |
| **Full Qt Designer** | Widget box, property editor, object inspector, signal/slot editor, layout tools |
| **AI Chat Panel** | Lives under the property editor; edit UI by typing what you want |
| **Precise XML Editing** | 4-level progressive matching + structural validation — only the target widget gets touched |
| **Rolling Backups** | 5-level auto backups + a pre-chat snapshot; one click gets you back to before the conversation |
| **Chinese UI** | Simplified Chinese by default (via Qt's translation system) |
| **Multi-format Export** | `.ui` → HTML / JSX / TSX / Vue / XAML |
| **Dark/Light Adaptive** | Follows the system palette, nothing to toggle |

---

## Requirements

- **Qt SDK 6.8+** (MSVC 2022, 64-bit) — you **must** tick **Qt Designer (with private headers)** and **Qt WebEngine**
- **CMake** 3.16+
- **Ninja** (`pip install ninja`, or bundled with Qt)
- **Visual Studio 2022** (MSVC C++ compiler)
- **Rust toolchain** — only needed to build the AI core from source; skip it if you use a release package
- **Node.js 20+** — optional, only if you want to run the Node fallback backend

### Qt install notes

The private headers are non-negotiable. After installing, check:

```
dir C:\Qt\6.8.0\msvc2022_64\include\QtDesigner\6.8.0\QtDesigner\private\
```

You should see `shared_settings_p.h`, `abstractdialoggui_p.h`, etc.

---

## Quick Start

### 1. Install Qt SDK

Grab the Qt Online Installer from https://www.qt.io/download and pick:

```
Qt 6.8.0
  ├── MSVC 2022 64-bit
  ├── Additional Libraries
  │     ├── Qt Designer (Qt Widgets Designer)
  │     └── Qt WebEngine
  └── ...
```

Default path `C:\Qt\6.8.0\msvc2022_64` works fine.

### 2. Build the C++ app

```bash
git clone https://github.com/YuanBaoSMadLab/DeepUIDesigner.git
cd DeepUIDesigner

# Run from Windows Command Prompt (cmd.exe):
scripts\build.bat

# If Qt lives somewhere else:
set QTDIR=D:\Qt\6.8.0\msvc2022_64
scripts\build.bat
```

This produces `build\designer.exe` and `build\ui2html.exe`.

### 3. Build the AI core

The designer launches the AI core automatically (it listens on port 9527). The Rust version is the primary backend; the Node version is the fallback:

```bash
# Rust core (recommended; copy the binary under ai-server/ so deploy picks it up)
cd ai-server-rs
cargo build --release
copy target\release\omni-ai-server.exe ..\ai-server\omni-ai-server.exe
cd ..

# Node fallback (optional; only needed if the Rust core is missing)
cd ai-server
npm install
cd ..
```

> Using a release package (see [Packaging](#packaging))? Skip this whole step — both cores are already inside.

### 4. Deploy

```bash
scripts\deploy.bat
```

Runs windeployqt for the Qt DLLs and copies `ai-server/` (including the AI core) into `build\ai-server/`.

### 5. Set your API key

Option A (recommended): start the app and fill in the DeepSeek API key in the AI panel's **Settings** dialog.

Option B: edit the config file.

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

> OpenAI-compatible: point `BASE_URL` at `https://api.openai.com/v1` and set `MODEL` to `gpt-4o`. DeepSeek is still the better deal, though.

### 6. Run

```bash
build\designer.exe
```

1. Open or create a `.ui` file
2. Select a widget on the canvas
3. Type a request in the AI panel (e.g. "make this button blue with rounded corners")
4. The AI edits the file and the canvas refreshes

Give the core 3–5 seconds to boot on first launch. Closing the designer also stops the AI core.

---

## Usage

### AI conversation

```
Select widget → Type request → AI edits → Canvas auto-refreshes
```

| Action | How |
| --- | --- |
| Restyle a widget | Select it, type "make it blue with rounded corners, font 14px" |
| Tweak layout | Select it, use the layout option in the AI panel |
| Batch changes | Multi-select on the canvas; the AI updates them all |
| Undo a chat's changes | **Restore to pre-chat** reverts everything from that conversation |
| Restore a backup | **Revert** and pick a historical version |

### Language

It's Simplified Chinese out of the box — nothing to configure.

### Export

Menu bar **File → Export → HTML...** — HTML / JSX / TSX / Vue / XAML / .ui.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              designer.exe (C++/Qt)                │
│  ┌──────────┐ ┌───────────────────────────────┐ │
│  │ WidgetBox │ │       MDI design canvas       │ │
│  └──────────┘ └───────────────────────────────┘ │
│  ┌────────────────────────────────────────────┐ │
│  │ ObjectInspector │ PropertyEditor           │ │
│  ├────────────────────────────────────────────┤ │
│  │  AI panel (QWebEngineView)                │ │
│  │   ├── AiBridge (QWebChannel C++ ↔ JS)     │ │
│  │   ├── NodeServer (QProcess, AI core mgmt) │ │
│  │   └── FileWatcher (.ui change monitor)    │ │
│  └────────────────────────────────────────────┘ │
└───────────────────┬─────────────────────────────┘
                    │ HTTP localhost:9527
                    ▼
┌─────────────────────────────────────────────────┐
│  AI core (ai-server/)                            │
│   ├── Rust version (omni-ai-server.exe, primary)│
│   │    ├── /api/chat      SSE streaming chat    │
│   │    ├── /api/chat/apply backups / revert     │
│   │    ├── /api/export    multi-format export   │
│   │    └── /api/ui        state sync            │
│   └── Node version (TypeScript, fallback, same) │
└────────────────────┬────────────────────────────┘
                     │ HTTPS
                     ▼
          ┌──────────────────┐
          │  DeepSeek / OpenAI │
          └──────────────────┘
```

### Core data flow

```
User selects a widget
  → QDesignerFormWindowInterface::selectionChanged
  → AiBridge::onSelectionChanged()
  → QWebChannel pushes JSON to the web frontend
  → frontend shows the context
User types a request
  → POST /api/chat (SSE)
  → DeepSeek API (streaming)
  → AI calls ui_read / ui_edit tools to edit the .ui XML
  → frontend calls aiBridge.refreshDesigner()
  → Designer reloads the file → canvas refreshes
```

---

## Directory Layout

```
DeepUIDesigner/
├── CMakeLists.txt          # top-level CMake script
├── README.md               # this file
├── README-zh.md            # Chinese docs
├── LICENSES/               # third-party licenses
│
├── src/                    # C++ sources
│   ├── designer/           # Qt Designer main app
│   │   └── main.cpp        # entry: language config + AI core startup
│   ├── components/         # Designer components
│   │   ├── aipanel/        # AI integration
│   │   │   ├── ai_bridge.*      # QWebChannel C++↔JS bridge
│   │   │   ├── ai_toolwindow.*  # QWebEngineView chat panel
│   │   │   ├── node_server.*    # AI core process mgmt (Rust first)
│   │   │   └── file_watcher.*   # .ui change monitor
│   │   ├── formeditor/     # form editor
│   │   ├── propertyeditor/ # property editor
│   │   ├── objectinspector/# object inspector
│   │   └── ...             # remaining Designer components
│   └── lib/                # Qt Designer private headers
│
├── ai-server/              # AI backend (Node fallback + frontend pages)
│   ├── .env.example        # API key template
│   └── src/
│       ├── server.ts       # service entry (port 9527)
│       ├── routes/         # chat / apply / ui-state routes
│       ├── ai/             # client, prompts, XML editing tools
│       └── ui/             # AI chat panel frontend
│
├── ai-server-rs/           # AI core, Rust version (primary)
│   ├── Cargo.toml
│   └── src/
│       ├── main.rs         # router assembly
│       ├── chat.rs         # SSE chat + agent tool loop
│       ├── client.rs       # DeepSeek client
│       ├── session.rs      # layered session context
│       ├── tools.rs        # ui_read / ui_edit / ui_write
│       └── ...             # backups, export, state sync, etc.
│
├── tools/                  # ui2html: .ui → HTML converter
├── data/                   # ui4.xsd and friends
├── resources/              # icons, etc.
│
└── scripts/                # build/deploy scripts
    ├── build.bat           # build
    ├── deploy.bat          # deploy
    ├── pack.bat            # package release
    └── verify-rs.ps1       # Rust core smoke tests
```

---

## Scripts

### `scripts\build.bat` — Build

```
Usage:
  scripts\build.bat              # Release build
  scripts\build.bat clean        # clean, then build

Env vars:
  QTDIR    Qt SDK path (default: C:\Qt\6.8.0\msvc2022_64)

Steps:
  1. Set up MSVC 2022 env (vcvarsall.bat)
  2. CMake configure (Ninja, Release)
  3. Build designer + ui2html
  4. Output: build\designer.exe / build\ui2html.exe
```

### `scripts\deploy.bat` — Deploy

```
Steps:
  1. windeployqt copies Qt DLLs to build\
  2. Copies ai-server\ (incl. AI core) to build\ai-server\
  3. Copies data\ to build\data\

Dependencies:
  ai-server\node_modules is copied along as part of the folder. After a fresh
  clone it won't be there (it's not tracked in git) — build the core as shown
  in "Quick Start" step 3.
```

### `scripts\pack.bat` — Package a release

```
Steps:
  1. Copy build\ into Output\DeepUIDesigner-v1.0.0\
  2. Strip build artifacts (CMake caches, autogen, pdb, etc.)
  3. Generate the Start-Designer.bat launcher
  4. Zip it up as Output\DeepUIDesigner-v1.0.0.zip
```

### `scripts\verify-rs.ps1` — Rust core smoke tests

22 checks covering static pages, settings, suggestions, UI state, backup/revert, export, real AI chat, etc. Run it after touching the core; everything must go green. Add `-IncludeChat` to hit the real DeepSeek API.

---

## Packaging

Full release flow:

```batch
scripts\build.bat
scripts\deploy.bat
scripts\pack.bat
```

You get `Output\DeepUIDesigner-v1.0.0.zip`. Unzipped, it looks like:

```
DeepUIDesigner-v1.0.0/
├── Start-Designer.bat     ← double-click to launch
├── designer.exe
├── ui2html.exe
├── Qt6*.dll               ← Qt runtime (windeployqt)
├── platforms/             ← Qt platform plugins
├── imageformats/          ← image format plugins
├── translations/          ← translation files
├── deepui.json            ← language config
├── data/                  ← XSD files
└── ai-server/             ← AI core (Rust exe + Node fallback + node_modules)
```

> The API key is never bundled. Users configure it themselves.

---

## FAQ

### Q: Build fails with "Qt6::CorePrivate not found"

A: The Qt SDK is missing private headers. Re-run the Qt Online Installer and tick the Qt Designer component.

### Q: The AI panel says "can't connect"

A: The AI core didn't start. Check:

1. Does `build\ai-server\omni-ai-server.exe` exist? (if not, build it — see Quick Start step 3)
2. Does `build\ai-server\node_modules\` exist? (needed for the Node fallback when the Rust core is absent)
3. Is port 9527 taken? `netstat -ano | findstr :9527`

### Q: The AI core still holds the port after I close the designer

A: Normally closing the designer kills the core too. If it was force-killed (e.g. Task Manager), something may linger — clean it up with `taskkill /F /T /PID <pid>`.

### Q: Build can't find MSVC

A: Run `scripts\build.bat` from **Command Prompt (cmd.exe)**, not PowerShell or Git Bash.

### Q: How do I switch AI models

A: Edit `build\ai-server\.env` or use the AI panel's Settings dialog to change `MODEL` and `BASE_URL`.

- DeepSeek: `MODEL=deepseek-chat`, `BASE_URL=https://api.deepseek.com`
- OpenAI: `MODEL=gpt-4o`, `BASE_URL=https://api.openai.com/v1`
- Any OpenAI-compatible endpoint works

### Q: Can I build on macOS

A: Theoretically yes (Qt for macOS + Xcode CLT), but `scripts\build.bat` is Windows-only; you'd run cmake manually. A macOS build script would be a welcome contribution.

---

## Tech Stack & Credits

| Layer | Tech |
| --- | --- |
| Desktop UI | C++17, Qt 6.x Widgets |
| AI chat UI | HTML/CSS/JS, QWebEngineView |
| C++ ↔ JS | Qt QWebChannel |
| AI backend | Rust (axum, primary) + Node.js/TypeScript (fallback) |
| XML editing | Direct .ui manipulation + 4-level progressive matching |
| Build | CMake + Ninja |

Built on top of / inspired by these open-source projects:

- **[Qt Project](https://www.qt.io/)** — C++ framework and Qt Designer
- **[DeepCode CLI](https://github.com/anthropics/deepcode-cli)** — context management and tool-calling design ideas
- **[Qt-to-HTML](https://github.com/ashok-s-das/Qt-to-HTML)** — .ui to HTML converter
- **[html-to-xaml](https://github.com/Restless-Development/html-to-xaml)** — HTML to XAML reference

---

## License

DeepUIDesigner's own modifications are released under **GPL-3.0**.

It contains derivative works of the following third-party code:

| Component | Original license |
| --- | --- |
| Qt Designer (src/designer/, src/components/) | GPL-3.0-only WITH Qt-GPL-exception-1.0 |
| DeepCode CLI design ideas (ai-server/) | Apache-2.0 |
| ui2html (tools/) | LGPL-2.0+ |

See the [LICENSES/](LICENSES/) directory for details.
