@echo off
REM ============================================================
REM   Test launcher for PR #83 - Live physics dice, character trays, and battlefield feedback
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=83"
set "PR_BRANCH=codex/class-dice-art"
set "PR_TITLE=Live physics dice, character trays, and battlefield feedback"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
