@echo off
REM ============================================================
REM   Test launcher for PR #177 - perflegacy: accelerate server-assisted walking sight and terrain atlas encoding
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=177"
set "PR_BRANCH=feat/fast-legacy-server-assist"
set "PR_TITLE=perflegacy: accelerate server-assisted walking sight and terrain atlas encoding"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
