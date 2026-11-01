@echo off
REM ============================================================
REM   Test launcher for PR #191 - perfvisibility: deduplicate motion data and stabilize playback
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=191"
set "PR_BRANCH=codex/visibility-plan-reuse"
set "PR_TITLE=perfvisibility: deduplicate motion data and stabilize playback"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
