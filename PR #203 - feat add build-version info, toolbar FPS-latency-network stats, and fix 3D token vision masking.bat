@echo off
REM ============================================================
REM   Test launcher for PR #203 - feat: add build/version info, toolbar FPS/latency/network stats, and fix 3D token vision masking
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=203"
set "PR_BRANCH=feat/v2-build-stats-and-vision-mask-fix"
set "PR_TITLE=feat: add build/version info, toolbar FPS/latency/network stats, and fix 3D token vision masking"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
