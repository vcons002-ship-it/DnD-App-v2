@echo off
REM ============================================================
REM   Test launcher for PR #9 - Polish batch: token sizing, panel UX, spawn/import control, rules and data fixes, player notes
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=9"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Polish batch: token sizing, panel UX, spawn/import control, rules and data fixes, player notes"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
