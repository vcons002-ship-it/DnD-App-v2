@echo off
REM ============================================================
REM   Test launcher for PR #94 - Refresh live-dice regressions and separate optional video captures
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=94"
set "PR_BRANCH=codex/current-workflow-tests"
set "PR_TITLE=Refresh live-dice regressions and separate optional video captures"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
