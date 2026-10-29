@echo off
REM ============================================================
REM   Test launcher for PR #166 - Keep DM door controls available in player view
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=166"
set "PR_BRANCH=codex/clarify-wall-concealment"
set "PR_TITLE=Keep DM door controls available in player view"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
