@echo off
REM ============================================================
REM   Test launcher for PR #165 - Explain when to use server-managed rendering
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=165"
set "PR_BRANCH=codex/server-assist-guidance"
set "PR_TITLE=Explain when to use server-managed rendering"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
