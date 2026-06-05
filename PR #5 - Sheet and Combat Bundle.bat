@echo off
REM ============================================================
REM   Test launcher for PR #5 - Sheet and Combat Bundle
REM   "spell follow-ups, skill checks, and weapon masteries"
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=5"
set "PR_BRANCH=claude/combined-sheet-combat"
set "PR_TITLE=Character sheet and combat bundle - spell follow-ups, skill checks, weapon masteries"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
