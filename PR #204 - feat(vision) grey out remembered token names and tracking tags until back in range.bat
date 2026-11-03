@echo off
REM ============================================================
REM   Test launcher for PR #204 - featvision: grey out remembered token names and tracking tags until back in range
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=204"
set "PR_BRANCH=feat/grey-out-remembered-token-names"
set "PR_TITLE=featvision: grey out remembered token names and tracking tags until back in range"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
