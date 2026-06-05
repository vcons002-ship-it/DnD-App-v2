@echo off
REM ============================================================
REM   Test launcher for PR #3 - Skill Checks
REM   "Automated skill checks: click-to-roll using sheet modifiers and proficiency"
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=3"
set "PR_BRANCH=claude/skill-check-rolls"
set "PR_TITLE=Automated skill checks: click-to-roll using sheet modifiers and proficiency"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
