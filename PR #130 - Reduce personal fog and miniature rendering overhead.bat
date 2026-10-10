@echo off
REM ============================================================
REM   Test launcher for PR #130 - Reduce personal fog and miniature rendering overhead
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=130"
set "PR_BRANCH=codex/fog-token-composite"
set "PR_TITLE=Reduce personal fog and miniature rendering overhead"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
