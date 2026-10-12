@echo off
REM ============================================================
REM   Test launcher for PR #138 - Refresh character dice effects and add a 3D roller inspector
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=138"
set "PR_BRANCH=codex/dice-roller-refresh"
set "PR_TITLE=Refresh character dice effects and add a 3D roller inspector"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
