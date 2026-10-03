@echo off
REM ============================================================
REM   Test launcher for PR #100 - Refine darkness, wall masks and arches with a mobile preview
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=100"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Refine darkness, wall masks and arches with a mobile preview"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
