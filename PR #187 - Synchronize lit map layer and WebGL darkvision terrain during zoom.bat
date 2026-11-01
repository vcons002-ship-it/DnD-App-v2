@echo off
REM ============================================================
REM   Test launcher for PR #187 - Synchronize lit map layer and WebGL darkvision terrain during zoom
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=187"
set "PR_BRANCH=fix/zoom-lit-terrain-sync"
set "PR_TITLE=Synchronize lit map layer and WebGL darkvision terrain during zoom"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
