@echo off
title DnD-App-v2 (local dev)
cd /d "%~dp0"

for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js was not found. Run install.bat first.
  pause
  exit /b 1
)

echo Starting in LOCAL DEV mode (no tunnel) with hot reload.
echo Open http://localhost:5173 in your browser.
echo (Press Ctrl+C in this window to stop.)
echo.
call npm run dev
pause
