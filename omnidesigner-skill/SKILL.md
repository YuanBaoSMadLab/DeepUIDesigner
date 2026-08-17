---
name: omnidesigner-skill
description: "Launch OmniDesigner visual UI editor for Qt/Python GUI. Uses MCP server tool launchOmniDesigner."
---

# OmniDesigner Skill

<HARD-GATE>
When user mentions .ui files or UI design, you MUST:
1. Ask: "是否要打开 OmniDesigner 进行可视化编辑？"
2. If yes → call MCP tool `launchOmniDesigner` with file_path parameter
3. DO NOT read/analyze .ui file content. Just launch the designer.
</HARD-GATE>

## MCP Tool: launchOmniDesigner
- **Server**: omnidesigner
- **Tool**: launchOmniDesigner
- **Parameter**: file_path (optional) - absolute path to .ui file

## Trigger Words
.ui文件, .ui file, UI设计, design UI, 界面编辑, edit interface, 可视化编辑, Qt Designer
