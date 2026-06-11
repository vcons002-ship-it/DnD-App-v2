@echo off
REM ============================================================
REM   Test launcher for PR #24 - 15-item batch: grid match/hide, paste images, objects and loot, combat visibility, spell counters, mobile UX
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=24"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=15-item batch: grid match/hide, paste images, objects and loot, combat visibility, spell counters, mobile UX"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
