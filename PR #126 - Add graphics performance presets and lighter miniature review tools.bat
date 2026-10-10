@echo off
REM ============================================================
REM   Test launcher for PR #126 - Add graphics performance presets and lighter miniature review tools
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=126"
set "PR_BRANCH=codex/graphics-performance-presets"
set "PR_TITLE=Add graphics performance presets and lighter miniature review tools"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
