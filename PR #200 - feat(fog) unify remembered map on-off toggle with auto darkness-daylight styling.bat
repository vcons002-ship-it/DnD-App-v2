@echo off
REM ============================================================
REM   Test launcher for PR #200 - featfog: unify remembered map on/off toggle with auto darkness/daylight styling
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=200"
set "PR_BRANCH=feat/remembered-map-toggle-and-lighting-style"
set "PR_TITLE=featfog: unify remembered map on/off toggle with auto darkness/daylight styling"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
