@echo off
REM ============================================================
REM   Test launcher for PR #168 - Reduce redundant visibility work and measure assisted latency
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=168"
set "PR_BRANCH=codex/assist-latency-profiling"
set "PR_TITLE=Reduce redundant visibility work and measure assisted latency"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
