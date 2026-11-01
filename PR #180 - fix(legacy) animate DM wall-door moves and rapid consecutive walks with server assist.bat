@echo off
REM ============================================================
REM   Test launcher for PR #180 - fixlegacy: animate DM wall/door moves and rapid consecutive walks with server assist
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=180"
set "PR_BRANCH=fix/legacy-wall-door-movement"
set "PR_TITLE=fixlegacy: animate DM wall/door moves and rapid consecutive walks with server assist"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
