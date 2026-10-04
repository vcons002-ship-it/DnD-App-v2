@echo off
REM ============================================================
REM   Test launcher for PR #102 - Improve cave wall conversion and simplify window masks
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=102"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Improve cave wall conversion and simplify window masks"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
