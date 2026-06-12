@echo off
REM ============================================================
REM   Test launcher for PR #28 - DM-editable loot-item modifiers + animated combat FX
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=28"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=DM-editable loot-item modifiers + animated combat FX"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
