@echo off
REM ============================================================
REM   Test launcher for PR #163 - Add Legacy rendering, server assist, and safer map updates
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=163"
set "PR_BRANCH=codex/map-editing-and-spell-dismiss"
set "PR_TITLE=Add Legacy rendering, server assist, and safer map updates"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
