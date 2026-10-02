@echo off
REM ============================================================
REM   Test launcher for PR #97 - Fix 2024 spell effects, support labels, and Haste recovery feedback
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=97"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Fix 2024 spell effects, support labels, and Haste recovery feedback"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
