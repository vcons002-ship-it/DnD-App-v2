@echo off
REM ============================================================
REM   Test launcher for PR #176 - Align Legacy darkness colors with server-managed rendering
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=176"
set "PR_BRANCH=codex/legacy-visibility-color-parity"
set "PR_TITLE=Align Legacy darkness colors with server-managed rendering"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
