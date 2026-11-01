@echo off
REM ============================================================
REM   Test launcher for PR #190 - Fix initial map load-in zoom/clarity, add token death-save pips, corner d20 loader, auto-advantage explanations, and dismissable damage prompt
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=190"
set "PR_BRANCH=fix/map-loadin-ux-and-combat-prompts"
set "PR_TITLE=Fix initial map load-in zoom/clarity, add token death-save pips, corner d20 loader, auto-advantage explanations, and dismissable damage prompt"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
