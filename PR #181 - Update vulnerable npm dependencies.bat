@echo off
REM ============================================================
REM   Test launcher for PR #181 - Update vulnerable npm dependencies
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=181"
set "PR_BRANCH=codex/npm-security-updates"
set "PR_TITLE=Update vulnerable npm dependencies"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
