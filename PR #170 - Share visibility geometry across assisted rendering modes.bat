@echo off
REM ============================================================
REM   Test launcher for PR #170 - Share visibility geometry across assisted rendering modes
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=170"
set "PR_BRANCH=codex/shared-visibility-masks"
set "PR_TITLE=Share visibility geometry across assisted rendering modes"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
