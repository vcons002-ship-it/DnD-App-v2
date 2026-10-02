@echo off
REM ============================================================
REM   Test launcher for PR #98 - Complete linked spell flows, area targeting, and roll privacy
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=98"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Complete linked spell flows, area targeting, and roll privacy"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
