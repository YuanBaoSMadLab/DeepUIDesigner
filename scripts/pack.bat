@echo off
chcp 65001 >nul 2>&1
echo =============================================
echo   DeepUIDesigner - Package Script
echo   Output dir: Output\
echo =============================================

if not exist build\designer.exe (
    echo [ERROR] build\designer.exe not found.
    echo   Run scripts\build.bat ^&^& scripts\deploy.bat first.
    pause && exit /b 1
)

set PKG_NAME=DeepUIDesigner-v1.0.0
set OUT_DIR=Output
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"
if exist "%OUT_DIR%\%PKG_NAME%"   rmdir /s /q "%OUT_DIR%\%PKG_NAME%"
if exist "%OUT_DIR%\%PKG_NAME%.zip" del /q "%OUT_DIR%\%PKG_NAME%.zip"

echo.
echo [1/4] Creating package directory...
mkdir "%OUT_DIR%\%PKG_NAME%"

echo [2/4] Copying files (excluding build artifacts)...
xcopy /E /Y /I /Q build "%OUT_DIR%\%PKG_NAME%" >nul
:: strip build leftovers from the package
if exist "%OUT_DIR%\%PKG_NAME%\CMakeFiles"       rmdir /s /q "%OUT_DIR%\%PKG_NAME%\CMakeFiles"
if exist "%OUT_DIR%\%PKG_NAME%\.ninja*"          del /q "%OUT_DIR%\%PKG_NAME%\.ninja*" >nul 2>&1
if exist "%OUT_DIR%\%PKG_NAME%\*.ilk"            del /q "%OUT_DIR%\%PKG_NAME%\*.ilk" >nul 2>&1
if exist "%OUT_DIR%\%PKG_NAME%\*.pdb"            del /q "%OUT_DIR%\%PKG_NAME%\*.pdb" >nul 2>&1
if exist "%OUT_DIR%\%PKG_NAME%\cmake_install.*"  del /q "%OUT_DIR%\%PKG_NAME%\cmake_install.*" >nul 2>&1
if exist "%OUT_DIR%\%PKG_NAME%\compile_commands.json" del /q "%OUT_DIR%\%PKG_NAME%\compile_commands.json" >nul 2>&1
if exist "%OUT_DIR%\%PKG_NAME%\CMakeCache.txt"   del /q "%OUT_DIR%\%PKG_NAME%\CMakeCache.txt" >nul 2>&1
if exist "%OUT_DIR%\%PKG_NAME%\build.ninja"      del /q "%OUT_DIR%\%PKG_NAME%\build.ninja" >nul 2>&1
if exist "%OUT_DIR%\%PKG_NAME%\.qt"              rmdir /s /q "%OUT_DIR%\%PKG_NAME%\.qt"
:: drop *_autogen folders (designer_autogen / ui2html_autogen)
for /d %%A in ("%OUT_DIR%\%PKG_NAME%\*_autogen") do rmdir /s /q "%%A"
:: top-level rust exe is a duplicate; runtime picks up ai-server\omni-ai-server.exe
if exist "%OUT_DIR%\%PKG_NAME%\omni-ai-server.exe" del /q "%OUT_DIR%\%PKG_NAME%\omni-ai-server.exe" >nul 2>&1
:: don't ship runtime logs
if exist "%OUT_DIR%\%PKG_NAME%\ai-server\server.log" del /q "%OUT_DIR%\%PKG_NAME%\ai-server\server.log" >nul 2>&1
if exist "%OUT_DIR%\%PKG_NAME%\ai-server\omni-ai-server.exe" echo  Rust core present: ai-server\omni-ai-server.exe

echo [3/4] Creating launcher...
(
    echo @echo off
    echo cd /d "%%~dp0"
    echo echo ============================================
    echo echo   OmniDER DeepUI Designer Launcher
    echo echo   AI core: Rust ^(omni-ai-server.exe^)
    echo echo   AI panel: http://localhost:9527
    echo echo ============================================
    echo echo.
    echo start "" "%%~dp0designer.exe"
    echo echo Designer started. AI core runs alongside.
    echo echo Closing Designer also stops the AI core.
) > "%OUT_DIR%\%PKG_NAME%\Start-Designer.bat"

echo [4/4] Creating zip archive...
powershell -command "Compress-Archive -Path '%OUT_DIR%\%PKG_NAME%' -DestinationPath '%OUT_DIR%\%PKG_NAME%.zip' -Force"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to create zip.
    pause && exit /b 1
)

echo.
echo =============================================
echo   PACKAGE COMPLETE!
echo =============================================
echo   %OUT_DIR%\%PKG_NAME%.zip
for %%F in ("%OUT_DIR%\%PKG_NAME%.zip") do echo   Size: %%~zF bytes
echo.
echo To use: extract the zip, double-click Start-Designer.bat
echo.
pause
