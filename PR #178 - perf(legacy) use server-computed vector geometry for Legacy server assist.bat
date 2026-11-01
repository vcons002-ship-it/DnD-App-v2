@echo off
REM ============================================================
REM   Test launcher for PR #178 - perflegacy: use server-computed vector geometry for Legacy server assist
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=178"
set "PR_BRANCH=perf/legacy-server-vector-geometry"
set "PR_TITLE=perflegacy: use server-computed vector geometry for Legacy server assist"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
