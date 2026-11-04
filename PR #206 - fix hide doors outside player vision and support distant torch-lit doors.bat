@echo off
REM ============================================================
REM   Test launcher for PR #206 - fix: hide doors outside player vision and support distant torch-lit doors
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=206"
set "PR_BRANCH=fix/door-player-vision"
set "PR_TITLE=fix: hide doors outside player vision and support distant torch-lit doors"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
