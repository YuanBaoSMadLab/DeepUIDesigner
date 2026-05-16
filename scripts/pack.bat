@echo off
chcp 65001 >nul 2>&1
echo =============================================
echo   DeepUIDesigner - Package Script
echo =============================================

if not exist build\DeepUIDesigner.exe (
    echo [ERROR] build\DeepUIDesigner.exe not found.
    echo   Run scripts\build.bat ^&^& scripts\deploy.bat first.
    pause && exit /b 1
)

where node >nul 2>&1 || (
    echo [ERROR] Node.js not found. Required for packaging AI server dependencies.
    echo   Install from: https://nodejs.org/
    pause && exit /b 1
)

set PKG_NAME=DeepUIDesigner-v1.0.0
if exist "%PKG_NAME%"   rmdir /s /q "%PKG_NAME%"
if exist "%PKG_NAME%.zip" del /q "%PKG_NAME%.zip"

echo.
echo [1/5] Creating package directory...
mkdir "%PKG_NAME%"

echo [2/5] Copying binaries...
xcopy /E /Y /I /Q build "%PKG_NAME%" >nul
:: Remove build artifacts
if exist "%PKG_NAME%\CMakeFiles"       rmdir /s /q "%PKG_NAME%\CMakeFiles"
if exist "%PKG_NAME%\.ninja*"          del /q "%PKG_NAME%\.ninja*" >nul 2>&1
if exist "%PKG_NAME%\*.ilk"            del /q "%PKG_NAME%\*.ilk" >nul 2>&1
if exist "%PKG_NAME%\*.pdb"            del /q "%PKG_NAME%\*.pdb" >nul 2>&1
if exist "%PKG_NAME%\cmake_install.*"  del /q "%PKG_NAME%\cmake_install.*" >nul 2>&1

echo [3/5] Installing AI server dependencies...
cd "%PKG_NAME%\ai-server"
call npm install --omit=dev 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] npm install failed. User will need to run it manually.
)
cd ..\..

echo [4/5] Creating launcher...
(
    echo @echo off
    echo echo Starting DeepUIDesigner...
    echo start "" "%%~dp0DeepUIDesigner.exe"
) > "%PKG_NAME%\DeepUIDesigner.bat"

echo [5/5] Creating zip archive...
powershell -command "Compress-Archive -Path '%PKG_NAME%' -DestinationPath '%PKG_NAME%.zip' -Force"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to create zip.
    pause && exit /b 1
)

:: Clean up temp directory
rmdir /s /q "%PKG_NAME%"

echo.
echo =============================================
echo   PACKAGE COMPLETE!
echo =============================================
echo.
echo   %PKG_NAME%.zip
echo   Size: %~z1 bytes
echo.
echo To distribute, send the zip file. Users need to:
echo   1. Extract the zip
echo   2. Double-click DeepUIDesigner.bat
echo   3. Configure API key in Settings
echo.
pause
