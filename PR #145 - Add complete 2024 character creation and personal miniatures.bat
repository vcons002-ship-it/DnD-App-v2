@echo off
REM ============================================================
REM   Test launcher for PR #145 - Add complete 2024 character creation and personal miniatures
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=145"
set "PR_BRANCH=codex/guided-character-creator"
set "PR_TITLE=Add complete 2024 character creation and personal miniatures"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
