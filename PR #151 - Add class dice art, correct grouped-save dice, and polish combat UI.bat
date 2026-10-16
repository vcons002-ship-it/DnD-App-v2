@echo off
REM ============================================================
REM   Test launcher for PR #151 - Add class dice art, correct grouped-save dice, and polish combat UI
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=151"
set "PR_BRANCH=codex/class-dice-combat-polish-20261016"
set "PR_TITLE=Add class dice art, correct grouped-save dice, and polish combat UI"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
