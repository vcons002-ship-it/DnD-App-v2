@echo off
REM ============================================================
REM   Test launcher for PR #117 - Security and data-safety fixes from code review
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=117"
set "PR_BRANCH=ccr-3046ec75-jekozb"
set "PR_TITLE=Security and data-safety fixes from code review"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
