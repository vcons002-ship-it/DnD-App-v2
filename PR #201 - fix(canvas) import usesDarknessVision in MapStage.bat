@echo off
REM ============================================================
REM   Test launcher for PR #201 - fixcanvas: import usesDarknessVision in MapStage
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=201"
set "PR_BRANCH=fix/mapstage-uses-darkness-vision-import"
set "PR_TITLE=fixcanvas: import usesDarknessVision in MapStage"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
