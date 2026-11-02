@echo off
REM ============================================================
REM   Test launcher for PR #197 - Fix DM remembered-map persistence on active maps
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=197"
set "PR_BRANCH=codex/remembered-map-persistence"
set "PR_TITLE=Fix DM remembered-map persistence on active maps"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
