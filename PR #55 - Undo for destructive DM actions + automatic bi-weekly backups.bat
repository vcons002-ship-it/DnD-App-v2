@echo off
REM ============================================================
REM   Test launcher for PR #55 - Undo for destructive DM actions + automatic bi-weekly backups
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=55"
set "PR_BRANCH=claude/app-state-analysis-odi72f"
set "PR_TITLE=Undo for destructive DM actions + automatic bi-weekly backups"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
