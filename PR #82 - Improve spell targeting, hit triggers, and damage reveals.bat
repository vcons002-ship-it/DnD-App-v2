@echo off
REM ============================================================
REM   Test launcher for PR #82 - Improve spell targeting, hit triggers, and damage reveals
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=82"
set "PR_BRANCH=codex/chromatic-orb-leaps"
set "PR_TITLE=Improve spell targeting, hit triggers, and damage reveals"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
