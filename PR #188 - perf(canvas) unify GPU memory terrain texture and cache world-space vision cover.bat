@echo off
REM ============================================================
REM   Test launcher for PR #188 - perfcanvas: unify GPU memory terrain texture and cache world-space vision cover
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=188"
set "PR_BRANCH=perf/unified-webgl-ground-vision"
set "PR_TITLE=perfcanvas: unify GPU memory terrain texture and cache world-space vision cover"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
