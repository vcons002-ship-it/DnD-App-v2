@echo off
REM ============================================================
REM   Test launcher for PR #69 - Full-detail character miniatures with overhead and 45-degree battlefield views
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=69"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Full-detail character miniatures with overhead and 45-degree battlefield views"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
