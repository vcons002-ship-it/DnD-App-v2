@echo off
REM ============================================================
REM   Test launcher for PR #53 - No-risk cleanups + small client-UX safety fixes
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=53"
set "PR_BRANCH=claude/app-state-analysis-odi72f"
set "PR_TITLE=No-risk cleanups + small client-UX safety fixes"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
