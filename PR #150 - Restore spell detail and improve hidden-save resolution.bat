@echo off
REM ============================================================
REM   Test launcher for PR #150 - Restore spell detail and improve hidden-save resolution
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=150"
set "PR_BRANCH=codex/spell-shaders-hidden-saves-20261016"
set "PR_TITLE=Restore spell detail and improve hidden-save resolution"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
