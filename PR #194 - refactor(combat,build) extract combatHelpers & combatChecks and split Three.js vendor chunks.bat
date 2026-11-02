@echo off
REM ============================================================
REM   Test launcher for PR #194 - refactorcombat,build: extract combatHelpers and combatChecks and split Three.js vendor chunks
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=194"
set "PR_BRANCH=refactor/combat-modules-and-chunking"
set "PR_TITLE=refactorcombat,build: extract combatHelpers and combatChecks and split Three.js vendor chunks"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
