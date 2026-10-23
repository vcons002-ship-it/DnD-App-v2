@echo off
REM ============================================================
REM   Test launcher for PR #162 - Use Druk's Battlefield model at every graphics level
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=162"
set "PR_BRANCH=codex/druk-battlefield-default-20261023"
set "PR_TITLE=Use Druk's Battlefield model at every graphics level"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
