@echo off
REM ============================================================
REM   Test launcher for PR #90 - Add separate AI door-mask drafting and connected doors
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=90"
set "PR_BRANCH=codex/dm-map-authoring"
set "PR_TITLE=Add separate AI door-mask drafting and connected doors"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
