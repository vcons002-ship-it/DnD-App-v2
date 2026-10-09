@echo off
REM ============================================================
REM   Test launcher for PR #122 - Back up the creature, character and item libraries
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=122"
set "PR_BRANCH=ccr-3046ec75-jekozb"
set "PR_TITLE=Back up the creature, character and item libraries"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
