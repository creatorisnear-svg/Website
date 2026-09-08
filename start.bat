@echo off
REM One-click start for Windows. Double-click this file.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Download the LTS version from https://nodejs.org then double-click this file again.
  pause
  exit /b 1
)

if "%PORT%"=="" set PORT=4317
start "" "http://127.0.0.1:%PORT%/app/"
node src\server.js
pause
