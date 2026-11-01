@echo off
REM ============================================================
REM   Test launcher for PR #179 - fixclient: include affinity in LegacyVisionOverlay fallback geometry type
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=179"
set "PR_BRANCH=fix/legacy-vision-overlay-typecheck"
set "PR_TITLE=fixclient: include affinity in LegacyVisionOverlay fallback geometry type"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
