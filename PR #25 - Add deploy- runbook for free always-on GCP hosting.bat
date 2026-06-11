@echo off
REM ============================================================
REM   Test launcher for PR #25 - Add deploy/ runbook for free always-on GCP hosting
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=25"
set "PR_BRANCH=claude/claude-md-review-uQzBK"
set "PR_TITLE=Add deploy/ runbook for free always-on GCP hosting"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
