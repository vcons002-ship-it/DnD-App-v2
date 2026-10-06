@echo off
REM ============================================================
REM   Test launcher for PR #107 - Ship approved dice and custom character roller
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=107"
set "PR_BRANCH=codex/approved-dice-release"
set "PR_TITLE=Ship approved dice and custom character roller"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
