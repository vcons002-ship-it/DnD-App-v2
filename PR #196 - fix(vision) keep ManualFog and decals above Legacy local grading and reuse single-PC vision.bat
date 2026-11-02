@echo off
REM ============================================================
REM   Test launcher for PR #196 - fixvision: keep ManualFog and decals above Legacy local grading and reuse single-PC vision
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=196"
set "PR_BRANCH=fix/pr195-legacy-grading-layer-and-vision-cache"
set "PR_TITLE=fixvision: keep ManualFog and decals above Legacy local grading and reuse single-PC vision"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
