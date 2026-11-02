@echo off
REM ============================================================
REM   Test launcher for PR #193 - refactorcanvas: decompose MapStage into focused sub-modules and hooks
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=193"
set "PR_BRANCH=refactor/mapstage-modules"
set "PR_TITLE=refactorcanvas: decompose MapStage into focused sub-modules and hooks"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
