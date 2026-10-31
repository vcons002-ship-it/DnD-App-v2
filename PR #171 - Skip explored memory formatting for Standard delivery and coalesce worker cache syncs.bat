@echo off
REM ============================================================
REM   Test launcher for PR #171 - Skip explored memory formatting for Standard delivery and coalesce worker cache syncs
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=171"
set "PR_BRANCH=fix/post-pr170-dedup"
set "PR_TITLE=Skip explored memory formatting for Standard delivery and coalesce worker cache syncs"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
