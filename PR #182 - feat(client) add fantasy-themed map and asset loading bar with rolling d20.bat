@echo off
REM ============================================================
REM   Test launcher for PR #182 - featclient: add fantasy-themed map and asset loading bar with rolling d20
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=182"
set "PR_BRANCH=feat/map-loading-bar"
set "PR_TITLE=featclient: add fantasy-themed map and asset loading bar with rolling d20"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
