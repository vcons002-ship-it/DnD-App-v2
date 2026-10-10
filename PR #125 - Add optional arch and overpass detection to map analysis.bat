@echo off
REM ============================================================
REM   Test launcher for PR #125 - Add optional arch and overpass detection to map analysis
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=125"
set "PR_BRANCH=codex/arch-overpass-detection"
set "PR_TITLE=Add optional arch and overpass detection to map analysis"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
