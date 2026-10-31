@echo off
REM ============================================================
REM   Test launcher for PR #174 - Keep mobile and tablet toolbars compact
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=174"
set "PR_BRANCH=codex/mobile-toolbar-space"
set "PR_TITLE=Keep mobile and tablet toolbars compact"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
