@echo off
REM ============================================================
REM   Test launcher for PR #184 - Give DM settings a separate toolbar button
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=184"
set "PR_BRANCH=codex/dm-settings-toolbar"
set "PR_TITLE=Give DM settings a separate toolbar button"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
