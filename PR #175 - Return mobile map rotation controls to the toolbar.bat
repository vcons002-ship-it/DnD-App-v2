@echo off
REM ============================================================
REM   Test launcher for PR #175 - Return mobile map rotation controls to the toolbar
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=175"
set "PR_BRANCH=codex/mobile-rotation-toolbar"
set "PR_TITLE=Return mobile map rotation controls to the toolbar"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
