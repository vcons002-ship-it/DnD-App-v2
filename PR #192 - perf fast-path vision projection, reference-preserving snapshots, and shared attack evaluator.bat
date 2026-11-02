@echo off
REM ============================================================
REM   Test launcher for PR #192 - perf: fast-path vision projection, reference-preserving snapshots, and shared attack evaluator
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=192"
set "PR_BRANCH=perf/vision-state-combat-evaluator"
set "PR_TITLE=perf: fast-path vision projection, reference-preserving snapshots, and shared attack evaluator"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
