@echo off
REM ============================================================
REM   Test launcher for PR #79 - Expand miniature families and use multi-view texture generation
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=79"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Expand miniature families and use multi-view texture generation"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
