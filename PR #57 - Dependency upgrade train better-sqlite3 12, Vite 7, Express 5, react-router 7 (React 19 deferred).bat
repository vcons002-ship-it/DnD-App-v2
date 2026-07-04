@echo off
REM ============================================================
REM   Test launcher for PR #57 - Dependency upgrade train: better-sqlite3 12, Vite 7, Express 5, react-router 7 React 19 deferred
REM
REM   Double-click to spin up this PR's branch in an isolated folder/port
REM   for testing. Your main install (run by start.bat) is untouched.
REM   Auto-removes itself + its test folder once the PR is merged/closed.
REM ============================================================
set "PR_NUMBER=57"
set "PR_BRANCH=claude/app-state-analysis-odi72f"
set "PR_TITLE=Dependency upgrade train: better-sqlite3 12, Vite 7, Express 5, react-router 7 React 19 deferred"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
