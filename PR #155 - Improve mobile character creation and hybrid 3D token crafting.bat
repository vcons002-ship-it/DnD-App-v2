@echo off
REM ============================================================
REM   Test launcher for PR #155 - Improve mobile character creation and hybrid 3D token crafting
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=155"
set "PR_BRANCH=codex/mobile-ui-20261017"
set "PR_TITLE=Improve mobile character creation and hybrid 3D token crafting"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
