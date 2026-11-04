@echo off
REM ============================================================
REM   Test launcher for PR #205 - fixvision,toolbar: fix distant-torch 3D token lighting, separate Fog menu, and add 2D/3D toggles to View
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=205"
set "PR_BRANCH=fix/distant-torch-tokens-and-toolbar-fog"
set "PR_TITLE=fixvision,toolbar: fix distant-torch 3D token lighting, separate Fog menu, and add 2D/3D toggles to View"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
