@echo off
REM ============================================================
REM   Test launcher for PR #91 - Add combined map setup and improve wall-mask geometry
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=91"
set "PR_BRANCH=codex/dm-map-authoring"
set "PR_TITLE=Add combined map setup and improve wall-mask geometry"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
