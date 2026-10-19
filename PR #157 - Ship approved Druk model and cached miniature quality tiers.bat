@echo off
REM ============================================================
REM   Test launcher for PR #157 - Ship approved Druk model and cached miniature quality tiers
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=157"
set "PR_BRANCH=codex/druk-approved-model-20261019"
set "PR_TITLE=Ship approved Druk model and cached miniature quality tiers"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
