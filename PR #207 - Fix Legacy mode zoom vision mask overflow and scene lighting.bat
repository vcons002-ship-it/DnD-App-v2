@echo off
REM ============================================================
REM   Test launcher for PR #207 - Fix Legacy mode zoom vision mask overflow and scene lighting
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=207"
set "PR_BRANCH=fix/legacy-zoom-mask-and-scene-lighting"
set "PR_TITLE=Fix Legacy mode zoom vision mask overflow and scene lighting"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
