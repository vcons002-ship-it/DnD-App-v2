@echo off
REM ============================================================
REM   Test launcher for PR #183 - perfclient: retain player vision and darkness layers between moves
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=183"
set "PR_BRANCH=perf/player-vision-darkness-layers"
set "PR_TITLE=perfclient: retain player vision and darkness layers between moves"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
