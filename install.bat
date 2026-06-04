@echo off
setlocal EnableDelayedExpansion
title DnD-App-v2 Installer

REM ============================================================
REM   DnD-App-v2  -  one-click Windows installer
REM   Checks for + installs Git, Node.js (LTS) and cloudflared,
REM   clones/updates the repo, installs dependencies, and can
REM   launch the app. Safe to re-run any time to update.
REM ============================================================

REM ----- Settings you can edit -----
set "REPO_URL=https://github.com/vcons002-ship-it/DnD-App-v2.git"
set "BRANCH=claude/app-concept-architecture-sJbvy"
set "INSTALL_DIR=%USERPROFILE%\DnD-App-v2"
REM ---------------------------------

echo ============================================
echo    DnD-App-v2  -  one-click installer
echo ============================================
echo.

REM ----- Need admin rights so winget can install software -----
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator privileges...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0"

REM ----- winget is required to auto-install the tools -----
where winget >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] 'winget' was not found on this PC.
  echo Update "App Installer" from the Microsoft Store, then re-run this file.
  echo Or install these three manually and re-run:
  echo    Git:         https://git-scm.com/download/win
  echo    Node.js LTS: https://nodejs.org
  echo    cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
  echo.
  pause
  exit /b 1
)

call :ensure Git.Git           git          "Git"
call :ensure OpenJS.NodeJS.LTS node         "Node.js LTS"
call :ensure Cloudflare.cloudflared cloudflared "cloudflared"

REM ----- Make freshly installed tools visible in THIS window -----
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"

REM ----- Get the code (clone first time, update afterwards) -----
if exist "%INSTALL_DIR%\.git" (
  echo.
  echo Updating existing install at "%INSTALL_DIR%" ...
  pushd "%INSTALL_DIR%"
  git fetch origin %BRANCH%
  git checkout %BRANCH%
  git pull origin %BRANCH%
  popd
) else (
  echo.
  echo Cloning repository to "%INSTALL_DIR%" ...
  echo (If the repo is private, a GitHub sign-in window will appear.)
  git clone --branch %BRANCH% "%REPO_URL%" "%INSTALL_DIR%"
  if !errorlevel! neq 0 (
    echo.
    echo [ERROR] git clone failed. If the repo is private, sign in when prompted and re-run this file.
    pause
    exit /b 1
  )
)

REM ----- Install dependencies -----
pushd "%INSTALL_DIR%"
echo.
echo Installing dependencies (this can take a minute the first time)...
call npm install
if !errorlevel! neq 0 (
  echo.
  echo [ERROR] npm install failed. See the messages above.
  popd
  pause
  exit /b 1
)

REM ----- Create .env from the template on first run -----
if not exist ".env" (
  if exist ".env.example" (
    copy ".env.example" ".env" >nul
    echo Created .env from template ^(defaults are fine for a first run^).
  )
)
popd

echo.
echo ============================================
echo    Done!  Installed to:
echo    %INSTALL_DIR%
echo ============================================
echo.
echo  To play later: open that folder and double-click  start.bat
echo  (Local-only testing without a tunnel: start-dev.bat)
echo.
set /p LAUNCH="Start the app now? [Y/N] "
if /i "!LAUNCH!"=="Y" (
  pushd "%INSTALL_DIR%"
  call npm start
  popd
)
echo.
pause
exit /b 0

REM ===== helper: ensure <wingetId> <command> <friendlyName> =====
:ensure
where %2 >nul 2>nul
if %errorlevel%==0 (
  echo [OK] %~3 is already installed.
  goto :eof
)
echo Installing %~3 ...
winget install -e --id %1 --accept-package-agreements --accept-source-agreements --silent
goto :eof
