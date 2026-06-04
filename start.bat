@echo off
title DnD-App-v2
cd /d "%~dp0"

REM Make sure node/npm/cloudflared are visible even right after install.
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js was not found. Run install.bat first.
  pause
  exit /b 1
)

echo Starting DnD-App-v2 ... share the links printed below with your table.
echo (Press Ctrl+C in this window to stop the server.)
echo.
call npm start
pause
