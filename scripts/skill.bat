@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ==============================================
echo OmniDesigner Skill Packager v1.1.0
echo ==============================================
echo.

:: Check if pack.bat has been run
if not exist "DeepUIDesigner" (
    echo Error: DeepUIDesigner directory not found!
    echo Please run pack.bat first.
    pause
    exit /b 1
)

:: Set paths
set "SKILL_DIR=omnidesigner-skill"
set "DIST_DIR=%SKILL_DIR%"

echo [1/6] Creating skill directory structure...
rmdir /s /q "%DIST_DIR%" 2>nul
mkdir "%DIST_DIR%"
mkdir "%DIST_DIR%\designer"
mkdir "%DIST_DIR%\mcp-server"

echo [2/6] Copying Designer files...
xcopy /E /I /Y "DeepUIDesigner\designer.exe" "%DIST_DIR%\designer\" >nul
xcopy /E /I /Y "DeepUIDesigner\*.dll" "%DIST_DIR%\designer\" >nul
xcopy /E /I /Y "DeepUIDesigner\plugins" "%DIST_DIR%\designer\plugins\" >nul 2>nul
xcopy /E /I /Y "DeepUIDesigner\resources" "%DIST_DIR%\designer\resources\" >nul 2>nul

echo [3/6] Copying Skill configuration...
copy "skill.json" "%DIST_DIR%\" >nul
copy "SKILL.md" "%DIST_DIR%\" >nul
copy "README.md" "%DIST_DIR%\" >nul
copy "install.js" "%DIST_DIR%\" >nul

echo [4/6] Creating MCP server...
(
echo // OmniDesigner Minimal MCP Server v1.1.0
echo const { spawn } = require('child_process');
echo const path = require('path');
echo const readline = require('readline');
echo const DESIGNER_PATH = path.join(__dirname, '..', 'designer', 'designer.exe');
echo const TOOLS = [{ name: 'launchOmniDesigner', description: 'Launch OmniDesigner visual UI editor', inputSchema: { type: 'object', properties: { file_path: { type: 'string' } }, required: [] } }];
echo function send(data) { process.stdout.write(JSON.stringify(data) + '\n'); }
echo function launchDesigner(args) {
echo   return new Promise((resolve) => {
echo     const fp = args?.file_path ^|^| null;
echo     const child = spawn(DESIGNER_PATH, fp ? [fp] : [], { detached: true, stdio: 'ignore', cwd: path.dirname(DESIGNER_PATH), windowsHide: false });
echo     child.on('error', e =^> resolve({ success: false, error: e.message }));
echo     child.on('spawn', () =^> { child.unref(); resolve({ success: true, message: 'OmniDesigner launched' }); });
echo     setTimeout(() =^> resolve({ success: true }), 1000);
echo   });
echo }
echo async function handle(req) {
echo   const { id, method, params } = req;
echo   if (method === 'initialize') send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'omnidesigner-mcp', version: '1.1.0' } } });
echo   else if (method === 'tools/list') send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
echo   else if (method === 'tools/call' ^&^& params?.name === 'launchOmniDesigner') {
echo     const r = await launchDesigner(params?.arguments ^|^| {});
echo     send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(r) }] } });
echo   }
echo   else if (method !== 'notifications/initialized') send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown method' } });
echo }
echo const rl = readline.createInterface({ input: process.stdin });
echo rl.on('line', l =^> { try { handle(JSON.parse(l)); } catch(e) {} });
) > "%DIST_DIR%\mcp-server\index.js"

echo [5/6] Creating launcher config...
(
echo @echo off
echo chcp 65001 ^>nul
echo set "DIR=%%~dp0"
echo start "" "%%DIR%%designer\designer.exe" %%*
) > "%DIST_DIR%\launcher.bat"

echo [6/6] Creating npm package config...
(
echo {
echo   "name": "omnidesigner-skill",
echo   "version": "1.1.0",
echo   "description": "OmniDesigner Visual UI Designer Skill",
echo   "main": "index.js",
echo   "scripts": {
echo     "start": "node index.js",
echo     "postinstall": "node postinstall.js"
echo   },
echo   "keywords": ["omni", "designer", "qt", "ui", "skill", "ai"],
echo   "author": "OmniDesigner Team",
echo   "license": "MIT"
echo }
) > "%DIST_DIR%\package.json"

:: Create main index.js
(
echo const { spawn } = require('child_process');
echo const path = require('path');
echo const DESIGNER_PATH = path.join(__dirname, 'designer', 'designer.exe');
echo function launchOmniDesigner(params = {}) {
echo   return new Promise((resolve) => {
echo     const fp = params.filePath ^|^| params.file_path ^|^| null;
echo     const child = spawn(DESIGNER_PATH, fp ? [fp] : [], { detached: true, stdio: 'ignore', cwd: path.dirname(DESIGNER_PATH) });
echo     child.on('error', e =^> resolve({ success: false, error: e.message }));
echo     child.on('spawn', () =^> { child.unref(); resolve({ success: true }); });
echo     setTimeout(() =^> resolve({ success: true }), 1000);
echo   });
echo }
echo module.exports = { launchOmniDesigner };
) > "%DIST_DIR%\index.js"

:: Create postinstall.js
(
echo console.log('OmniDesigner Skill v1.1.0 installed!');
echo console.log('Run: node install.js to configure with your AI Agent');
) > "%DIST_DIR%\postinstall.js"

echo.
echo ==============================================
echo Skill package v1.1.0 created successfully!
echo ==============================================
echo.
echo Location: %cd%\%DIST_DIR%
echo.
echo To publish: cd %DIST_DIR% ^&^& npm publish
echo.
pause
