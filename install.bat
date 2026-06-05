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
set "BRANCH=claude/Main"
set "INSTALL_DIR=%USERPROFILE%\DnD-App-v2"
REM ---------------------------------

echo ============================================
echo    DnD-App-v2  -  one-click installer
echo ============================================
echo.

REM ----- Detect which prerequisites are missing (decides if we need admin) -----
set "NEED_ADMIN="
where git         >nul 2>nul || set "NEED_ADMIN=1"
where node        >nul 2>nul || set "NEED_ADMIN=1"
where cloudflared >nul 2>nul || set "NEED_ADMIN=1"

REM ----- Only elevate if we actually have to install something. Running as a
REM ----- normal user keeps the repo owned by YOU, which avoids git
REM ----- "dubious ownership" errors when updating later. -----
if defined NEED_ADMIN (
  net session >nul 2>&1
  if !errorlevel! neq 0 (
    echo Installing prerequisites requires administrator rights...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
  )
)
cd /d "%~dp0"

REM ----- Install any missing tools via winget (uses the elevation above) -----
if defined NEED_ADMIN (
  where winget >nul 2>nul
  if !errorlevel! neq 0 (
    echo [ERROR] 'winget' was not found on this PC.
    echo Update "App Installer" from the Microsoft Store, then re-run this file.
    echo Or install these manually and re-run:
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
  REM Make freshly installed tools visible in THIS window.
  for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"
)

REM ----- Trust this folder for git, in case an earlier elevated run left it
REM ----- owned by Administrators (which blocks git with "dubious ownership"). -----
set "GITDIR=%INSTALL_DIR:\=/%"
git config --global --add safe.directory "%GITDIR%" >nul 2>nul

REM ----- Get the code (clone first time, update afterwards) -----
REM Flat goto structure: all jumps come from single-line ifs, never from inside
REM a parenthesized block (cmd.exe mishandles goto-out-of-block).
if exist "%INSTALL_DIR%\.git" goto do_update
if exist "%INSTALL_DIR%" goto not_repo

echo.
echo Cloning repository to "%INSTALL_DIR%" ...
echo If the repo is private, a GitHub sign-in window will appear.
git clone --branch %BRANCH% "%REPO_URL%" "%INSTALL_DIR%"
if errorlevel 1 goto clone_failed
goto code_ready

:do_update
echo.
echo Updating existing install at "%INSTALL_DIR%" ...
pushd "%INSTALL_DIR%"
git fetch origin %BRANCH%
git checkout %BRANCH%
git pull origin %BRANCH%
popd
goto code_ready

:not_repo
echo.
echo [ERROR] "%INSTALL_DIR%" already exists but is not a git checkout.
echo Rename or remove that folder, then re-run this installer.
pause
exit /b 1

:clone_failed
echo.
echo [ERROR] git clone failed. If the repo is private, sign in when prompted and re-run this file.
pause
exit /b 1

:code_ready

REM ----- Clean up throwaway PR test folders whose launcher is gone -----
REM Once a PR merges/closes, the cleanup Action removes its "PR #N - *.bat"
REM launcher from claude/Main (pulled above), so any matching local test folder
REM at %USERPROFILE%\DnD-App-v2-pr-N is now stale and safe to delete.
for /d %%D in ("%USERPROFILE%\DnD-App-v2-pr-*") do call :clean_stale_pr "%%~fD"

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

REM ===== helper: delete a PR test folder if its launcher is gone =====
:clean_stale_pr
set "PRDIR=%~1"
set "LEAF=%~nx1"
set "NUM=!LEAF:DnD-App-v2-pr-=!"
if not exist "%INSTALL_DIR%\PR #!NUM! - *.bat" (
  echo Removing test folder for merged/closed PR #!NUM! ...
  rmdir /s /q "%PRDIR%"
)
goto :eof

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
