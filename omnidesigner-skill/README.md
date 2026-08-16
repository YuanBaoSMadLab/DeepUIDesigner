# OmniDesigner Skill

给 AI Agent 用的视觉 UI 设计器 Skill：一句话让 AI 帮你打开 Qt/Python 的可视化编辑器（OmniDesigner / DeepUIDesigner）。

## 功能

- 启动 OmniDesigner 可视化编辑器
- 打开指定的 .ui 文件
- 配合 MCP 工具 `launchOmniDesigner` 使用，兼容大多数支持 Skill 的 AI Agent
- 一键安装，不用手动配

## 安装

### 方法 1：运行安装脚本（推荐）

```bash
node install.js
```

脚本会引导你选择 AI Agent 并自动配置。

### 方法 2：npm 安装

```bash
npm install omnidesigner-skill
```

## 支持的 AI Agent

- Trae AI
- CodeBuddy
- Cursor
- 其他支持 Skill 的 Agent

## 使用方法

### 命令行启动

```bash
# 启动软件
node index.js

# 打开指定文件
node index.js mainwindow.ui
```

### 通过 AI Agent 使用

1. 运行 `node install.js` 安装到你的 AI Agent
2. 重启 AI Agent
3. 输入"帮我设计 Qt UI"或"编辑 mainwindow.ui"
4. AI 会询问是否打开 OmniDesigner，确认后自动启动

### 工作流程示例

```
用户: "帮我设计一个Qt界面"
AI:   "你想打开OmniDesigner进行可视化编辑吗？"
用户: "是的"
AI:   launchOmniDesigner() → 启动软件
```

## 文件结构

```
omnidesigner-skill/
├── index.js          # 主模块
├── skill.json        # Skill 配置（系统提示词 + 工具）
├── SKILL.md          # Agent 触发规则
├── package.json      # npm 配置
├── install.js        # 一键安装脚本
├── postinstall.js    # 安装后提示
├── README.md         # 使用说明
└── mcp-server/       # MCP 服务器（launchOmniDesigner 工具）
```

## License

MIT
