@echo off
REM ============================================================
REM   Test launcher for PR #144 - Support animated battle maps and preload door reveal miniatures
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=144"
set "PR_BRANCH=codex/animated-map-study"
set "PR_TITLE=Support animated battle maps and preload door reveal miniatures"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
