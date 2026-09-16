@echo off
REM ============================================================
REM   Test launcher for PR #66 - Default dark fantasy player HUD and spell workflow fixes
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=66"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Default dark fantasy player HUD and spell workflow fixes"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
