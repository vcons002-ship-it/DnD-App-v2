@echo off
REM ============================================================
REM   Test launcher for PR #14 - AI/free-text actions carry a save roll so trap triggers offer Apply d…
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=14"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=AI/free-text actions carry a save roll so trap triggers offer Apply d…"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
