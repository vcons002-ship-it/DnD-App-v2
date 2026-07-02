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

REM ----- If the always-on service is running, don't launch a second server
REM ----- (they'd fight over the same port). Reading service state is fine as a
REM ----- normal user; controlling it needs admin. -----
sc query DnDServer 2>nul | find "RUNNING" >nul
if %errorlevel%==0 (
  echo The DnD server is already running as an always-on service ^(DnDServer^),
  echo so there is nothing to start here - just use your usual links.
  echo.
  echo To run it manually in THIS window instead, stop the service first in an
  echo admin prompt:   net stop DnDServer
  echo.
  pause
  exit /b 0
)

echo Starting DnD-App-v2 ... share the links printed below with your table.
echo (Press Ctrl+C in this window to stop the server.)
echo.
call npm start
pause
