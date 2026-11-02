@echo off
REM ============================================================
REM   Test launcher for PR #195 - Add per-map party vision controls and fix Legacy darkvision
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=195"
set "PR_BRANCH=codex/vision-and-orb-controls"
set "PR_TITLE=Add per-map party vision controls and fix Legacy darkvision"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
