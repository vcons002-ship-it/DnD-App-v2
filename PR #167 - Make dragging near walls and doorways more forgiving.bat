@echo off
REM ============================================================
REM   Test launcher for PR #167 - Make dragging near walls and doorways more forgiving
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=167"
set "PR_BRANCH=codex/forgiving-wall-movement"
set "PR_TITLE=Make dragging near walls and doorways more forgiving"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
