@echo off
REM ============================================================
REM   Test launcher for PR #185 - Keep selected attacker when holding a target
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=185"
set "PR_BRANCH=codex/touch-quick-combat"
set "PR_TITLE=Keep selected attacker when holding a target"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
