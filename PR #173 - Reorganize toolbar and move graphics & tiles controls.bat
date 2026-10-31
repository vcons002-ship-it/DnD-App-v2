@echo off
REM ============================================================
REM   Test launcher for PR #173 - Reorganize toolbar and move graphics and tiles controls
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=173"
set "PR_BRANCH=feat/toolbar-reorganization"
set "PR_TITLE=Reorganize toolbar and move graphics and tiles controls"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
