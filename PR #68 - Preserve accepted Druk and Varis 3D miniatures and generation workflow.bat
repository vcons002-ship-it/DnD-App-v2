@echo off
REM ============================================================
REM   Test launcher for PR #68 - Preserve accepted Druk and Varis 3D miniatures and generation workflow
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=68"
set "PR_BRANCH=codex/accepted-3d-tokens-workflow"
set "PR_TITLE=Preserve accepted Druk and Varis 3D miniatures and generation workflow"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
