@echo off
REM ============================================================
REM   Test launcher for PR #64 - ADV/DIS on the map, damage prompt waits for the reveal, overlays on Slides maps
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=64"
set "PR_BRANCH=claude/app-state-analysis-odi72f"
set "PR_TITLE=ADV/DIS on the map, damage prompt waits for the reveal, overlays on Slides maps"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
