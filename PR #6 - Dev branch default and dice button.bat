@echo off
REM ============================================================
REM   Test launcher for PR #6 - Dev branch default and dice button
REM   "Set claude/Dev as the default development branch in CLAUDE.md"
REM   (branch also adds the bottom-right quick-roll D20 dice button)
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=6"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Set claude/Dev as the default development branch in CLAUDE.md"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
