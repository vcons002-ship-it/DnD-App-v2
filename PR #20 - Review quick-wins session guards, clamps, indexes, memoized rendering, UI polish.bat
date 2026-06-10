@echo off
REM ============================================================
REM   Test launcher for PR #20 - Review quick-wins: session guards, clamps, indexes, memoized rendering, UI polish
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=20"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Review quick-wins: session guards, clamps, indexes, memoized rendering, UI polish"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
