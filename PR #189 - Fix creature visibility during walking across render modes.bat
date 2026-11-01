@echo off
REM ============================================================
REM   Test launcher for PR #189 - Fix creature visibility during walking across render modes
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=189"
set "PR_BRANCH=codex/movement-visibility"
set "PR_TITLE=Fix creature visibility during walking across render modes"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
