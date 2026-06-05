@echo off
REM ============================================================
REM   Test launcher for PR #2 - Spell Follow-Ups
REM   "Spell follow-ups: auto-spend slots, adv/dis on attacks, fix flaky test"
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=2"
set "PR_BRANCH=claude/spell-cast-followups"
set "PR_TITLE=Spell follow-ups: auto-spend slots, adv/dis on attacks, fix flaky test"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
