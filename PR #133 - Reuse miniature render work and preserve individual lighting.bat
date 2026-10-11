@echo off
REM ============================================================
REM   Test launcher for PR #133 - Reuse miniature render work and preserve individual lighting
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=133"
set "PR_BRANCH=codex/miniature-render-reuse"
set "PR_TITLE=Reuse miniature render work and preserve individual lighting"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
