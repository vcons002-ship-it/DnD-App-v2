@echo off
REM ============================================================
REM   Test launcher for PR #71 - Add per-player token views and animated Vanec spell energy
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=71"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Add per-player token views and animated Vanec spell energy"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
