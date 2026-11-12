@echo off
setlocal
title OrderFlow
cd /d "%~dp0"

echo.
echo  ============================================
echo   OrderFlow - starting local server
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found on this computer.
  echo         Install Node.js 22.13 or newer from https://nodejs.org
  echo.
  pause
  exit /b 1
)

node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo [ERROR] Node.js 22.13 or newer is required.
  node -v
  echo         Download the latest LTS release from https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\express\package.json" (
  echo [SETUP] Installing dependencies for the first run...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] Dependency installation failed. Check your internet connection.
    pause
    exit /b 1
  )
)

echo [RUN] Starting OrderFlow at http://127.0.0.1:3000
echo       Your browser will open automatically.
echo       Close this window or press Ctrl+C to stop the server.
echo.

set AUTO_OPEN=1
node server.js

if errorlevel 1 (
  echo.
  echo [ERROR] The server stopped unexpectedly. Review the message above.
  pause
)

endlocal
