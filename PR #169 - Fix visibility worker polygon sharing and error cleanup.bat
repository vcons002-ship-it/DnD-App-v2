@echo off
REM ============================================================
REM   Test launcher for PR #169 - Fix visibility worker polygon sharing and error cleanup
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=169"
set "PR_BRANCH=codex/fix-visibility-worker-sharing"
set "PR_TITLE=Fix visibility worker polygon sharing and error cleanup"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
