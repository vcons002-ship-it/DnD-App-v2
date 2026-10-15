@echo off
REM ============================================================
REM   Test launcher for PR #147 - Document: prefer instant reveals over hiding preloaded model names
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=147"
set "PR_BRANCH=ccr-3046ec75-jekozb"
set "PR_TITLE=Document: prefer instant reveals over hiding preloaded model names"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
