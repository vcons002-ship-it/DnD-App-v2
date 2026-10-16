@echo off
REM ============================================================
REM   Test launcher for PR #149 - Fix miniature movement, Lightning Bolt lighting, and area spell cover
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=149"
set "PR_BRANCH=codex/latest-pr-video-20261015"
set "PR_TITLE=Fix miniature movement, Lightning Bolt lighting, and area spell cover"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
