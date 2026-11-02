@echo off
REM ============================================================
REM   Test launcher for PR #198 - Add DM teleport controls and honor blindness in vision and exploration
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=198"
set "PR_BRANCH=codex/dm-teleport-blind-vision"
set "PR_TITLE=Add DM teleport controls and honor blindness in vision and exploration"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
