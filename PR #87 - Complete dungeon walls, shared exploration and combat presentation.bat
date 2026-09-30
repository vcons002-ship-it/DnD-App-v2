@echo off
REM ============================================================
REM   Test launcher for PR #87 - Complete dungeon walls, shared exploration and combat presentation
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=87"
set "PR_BRANCH=codex/footstep-quality"
set "PR_TITLE=Complete dungeon walls, shared exploration and combat presentation"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
