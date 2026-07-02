@echo off
setlocal EnableDelayedExpansion
title DnD-App-v2 - Install always-on server service
cd /d "%~dp0"

REM ============================================================
REM   Installs the DnD-App-v2 SERVER as a Windows service so it
REM   starts automatically on boot and restarts if it crashes.
REM   Uses NSSM (auto-downloaded to tools\nssm.exe). The tunnel
REM   (cloudflared) is a SEPARATE service you set up already.
REM   Re-run any time to reinstall / repair the service.
REM
REM   Flat structure (single-line ifs + goto, no multi-line
REM   parenthesised blocks) on purpose -- cmd mishandles blocks
REM   that contain parens/quotes and silently closes the window.
REM ============================================================

REM ----- Service install needs admin: re-launch elevated if we aren't. -----
net session >nul 2>&1
if not errorlevel 1 goto is_admin
echo Administrator rights are required to install a service.
echo A UAC prompt will appear - click Yes.
powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
exit /b

:is_admin
REM ----- Make node visible even right after a fresh install. -----
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"

set "NODE_EXE="
for /f "usebackq delims=" %%N in (`where node 2^>nul`) do set "NODE_EXE=%%N"
if not defined NODE_EXE goto no_node

REM ----- The service runs the server ONLY (no rebuild), so the built client
REM ----- must exist. Build it once if it's missing. -----
if exist "%~dp0client\dist\index.html" goto have_client
echo No built client found - building it once...
call npm install
call npm run build
if errorlevel 1 goto build_failed
:have_client

REM ----- Make sure the data folder exists for the service log + DM secret. -----
if not exist "%~dp0server\data" mkdir "%~dp0server\data"

REM ----- Get NSSM (download once into tools\ if we don't have it). -----
set "NSSM=%~dp0tools\nssm.exe"
if exist "%NSSM%" goto have_nssm
echo Downloading NSSM ^(service manager^)...
if not exist "%~dp0tools" mkdir "%~dp0tools"
powershell -NoProfile -Command "$ErrorActionPreference='Stop'; try { Invoke-WebRequest -UseBasicParsing -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile \"$env:TEMP\nssm.zip\"; Expand-Archive -Force \"$env:TEMP\nssm.zip\" \"$env:TEMP\nssm-dl\"; Copy-Item \"$env:TEMP\nssm-dl\nssm-2.24\win64\nssm.exe\" \"%~dp0tools\nssm.exe\" -Force } catch { exit 1 }"
if not exist "%NSSM%" goto nssm_failed
:have_nssm

REM ----- Remove any previous copy of the service, then install fresh. -----
"%NSSM%" stop DnDServer >nul 2>&1
"%NSSM%" remove DnDServer confirm >nul 2>&1

echo Installing the DnDServer service...
"%NSSM%" install DnDServer "%NODE_EXE%" "--import tsx src/index.ts"
"%NSSM%" set DnDServer AppDirectory "%~dp0server"
"%NSSM%" set DnDServer DisplayName "DnD-App-v2 server"
"%NSSM%" set DnDServer Description "Local D&D virtual tabletop server, always-on."
"%NSSM%" set DnDServer AppStdout "%~dp0server\data\service.log"
"%NSSM%" set DnDServer AppStderr "%~dp0server\data\service.log"
"%NSSM%" set DnDServer AppRotateFiles 1
"%NSSM%" set DnDServer AppRotateBytes 5242880
"%NSSM%" set DnDServer Start SERVICE_AUTO_START
"%NSSM%" start DnDServer

echo.
echo ============================================
echo    The DnD server is now an always-on service.
echo ============================================
echo  - Starts automatically on boot, restarts if it crashes.
echo  - Logs:       server\data\service.log
echo  - DM secret:  server\data\dm-secret.txt
echo.
echo  IMPORTANT: don't use start.bat anymore - the service owns the port.
echo  After updating with install.bat it restarts the service for you.
echo  To stop:    "%NSSM%" stop DnDServer
echo  To remove:  "%NSSM%" remove DnDServer confirm
echo.
pause
exit /b 0

:no_node
echo [ERROR] Node.js was not found. Run install.bat first.
pause
exit /b 1

:build_failed
echo [ERROR] Build failed. Fix the errors above and re-run.
pause
exit /b 1

:nssm_failed
echo.
echo [ERROR] Could not download NSSM automatically ^(network or antivirus^).
echo Download it yourself from https://nssm.cc/download and put the file
echo    win64\nssm.exe
echo at
echo    %~dp0tools\nssm.exe
echo then run this again.
pause
exit /b 1
