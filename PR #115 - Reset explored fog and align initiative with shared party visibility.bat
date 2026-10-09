@echo off
REM ============================================================
REM   Test launcher for PR #115 - Reset explored fog and align initiative with shared party visibility
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=115"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Reset explored fog and align initiative with shared party visibility"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
