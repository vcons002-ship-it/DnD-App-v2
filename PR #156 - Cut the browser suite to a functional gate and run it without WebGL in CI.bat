@echo off
REM ============================================================
REM   Test launcher for PR #156 - Cut the browser suite to a functional gate and run it without WebGL in CI
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=156"
set "PR_BRANCH=ccr-3046ec75-jekozb"
set "PR_TITLE=Cut the browser suite to a functional gate and run it without WebGL in CI"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
