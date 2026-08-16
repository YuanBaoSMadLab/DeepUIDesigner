@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
echo =============================================
echo   DeepUIDesigner - Build Script
echo =============================================
echo.

where cmake >nul 2>&1 || (
    echo [ERROR] CMake not found. Install from https://cmake.org/download/
    pause && exit /b 1
)
where ninja >nul 2>&1 || (
    echo [WARNING] Ninja not found in PATH. Trying pip...
    pip install ninja >nul 2>&1
    where ninja >nul 2>&1 || (
        echo [ERROR] Ninja not found. Run: pip install ninja
        pause && exit /b 1
    )
)

if not defined QTDIR set QTDIR=C:\Qt\6.8.0\msvc2022_64
if not exist "%QTDIR%\bin\qmake.exe" (
    echo [ERROR] Qt SDK not found at: %QTDIR%
    echo   Set QTDIR environment variable or install Qt 6.5+ with private headers.
    echo   Download: https://www.qt.io/download
    pause && exit /b 1
)
echo Qt SDK: %QTDIR%

:: building the Designer plugin needs Qt private headers (path must match your Qt version)
if not exist "%QTDIR%\include\QtDesigner\6.8.0\QtDesigner\private\shared_settings_p.h" (
    echo [ERROR] Qt private headers not found.
    echo   Re-run Qt Online Installer and check "Qt Designer ^(with private headers^)".
    pause && exit /b 1
)

if /i "%1"=="clean" (
    echo [Clean] Removing build directory...
    if exist build rmdir /s /q build
    echo Done.
)

echo.
echo [1/4] Setting up MSVC environment...
set "VCVARS="
for %%d in (
    "C:\Program Files\Microsoft Visual Studio\2022\Community"
    "C:\Program Files\Microsoft Visual Studio\2022\Professional"
    "C:\Program Files\Microsoft Visual Studio\2022\Enterprise"
    "C:\Program Files\Microsoft Visual Studio\18\Community"
) do (
    if exist "%%~d\VC\Auxiliary\Build\vcvarsall.bat" (
        set "VCVARS=%%~d\VC\Auxiliary\Build\vcvarsall.bat"
    )
)
if "%VCVARS%"=="" (
    echo [ERROR] Visual Studio 2022 not found.
    echo   Install from: https://visualstudio.microsoft.com/
    pause && exit /b 1
)
call "%VCVARS%" x64 >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to set up MSVC environment.
    echo   Try running from "Developer Command Prompt for VS 2022"
    pause && exit /b 1
)
echo   OK.

echo.
echo [2/4] Configuring CMake...
if not exist build mkdir build
cmake -B build -S . -G "Ninja" ^
    -DCMAKE_BUILD_TYPE=Release ^
    -DCMAKE_PREFIX_PATH="%QTDIR%" ^
    -DCMAKE_C_COMPILER=cl ^
    -DCMAKE_CXX_COMPILER=cl
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] CMake configuration failed. See above for details.
    pause && exit /b 1
)

echo.
echo [3/4] Building designer...
cmake --build build --config Release
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Build failed.
    pause && exit /b 1
)

echo.
echo [4/4] Building ui2html...
cmake --build build --config Release --target ui2html
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] ui2html build failed. HTML export will not work.
)

echo.
echo =============================================
echo   BUILD SUCCESSFUL!
echo   designer: build\designer.exe
echo   ui2html: build\ui2html.exe
echo =============================================
echo.
echo Next steps:
echo   1. scripts\deploy.bat   -- deploy DLLs and AI server
echo   2. cd build\ai-server ^&^& npm install
echo   3. build\designer.exe
echo.
pause
