@echo off
chcp 65001 >nul 2>&1
echo =============================================
echo   DeepUIDesigner - Deploy Script
echo =============================================

if not defined QTDIR set QTDIR=C:\Qt\6.8.0\msvc2022_64

if not exist build\DeepUIDesigner.exe (
    echo [ERROR] build\DeepUIDesigner.exe not found.
    echo   Run scripts\build.bat first.
    pause && exit /b 1
)

:: ---- windeployqt ----
echo [1/2] Running windeployqt...
"%QTDIR%\bin\windeployqt.exe" build\DeepUIDesigner.exe --no-system-d3d-compiler --no-compiler-runtime
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] windeployqt failed. Some Qt DLLs may be missing.
)

:: ---- Copy AI server ----
echo [2/2] Copying AI server...
if not exist build\ai-server mkdir build\ai-server
xcopy /E /Y /I /Q ai-server build\ai-server >nul 2>&1
if exist build\ai-server\node_modules (
    echo   Removing pre-existing node_modules...
    rmdir /s /q build\ai-server\node_modules
)
:: Copy .env.example if .env doesn't exist
if not exist build\ai-server\.env (
    if exist build\ai-server\.env.example (
        echo   Creating .env from .env.example (edit to add your API key^)
        copy build\ai-server\.env.example build\ai-server\.env >nul
    )
)

:: ---- Copy data ----
if not exist build\data mkdir build\data
xcopy /E /Y /I /Q data build\data >nul 2>&1

echo.
echo =============================================
echo   DEPLOY COMPLETE!
echo =============================================
echo.
echo First-time setup:
echo   cd build\ai-server
echo   npm install
echo   cd ..
echo   DeepUIDesigner.exe
echo.
pause
