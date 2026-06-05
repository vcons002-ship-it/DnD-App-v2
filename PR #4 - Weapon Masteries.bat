@echo off
REM ============================================================
REM   Test launcher for PR #4 - Weapon Masteries
REM   "Weapon masteries: searchable, toggleable, auto-adjusting attacks"
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=4"
set "PR_BRANCH=claude/weapon-masteries"
set "PR_TITLE=Weapon masteries: searchable, toggleable, auto-adjusting attacks"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
