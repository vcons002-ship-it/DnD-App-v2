@echo off
REM Build and deploy this checkout's local fixes without replacing them from GitHub.
call "%~dp0install.bat" --local
exit /b %errorlevel%
