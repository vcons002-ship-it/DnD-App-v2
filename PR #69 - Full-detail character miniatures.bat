@echo off
REM Test PR 69 in an isolated checkout; the main install and save remain untouched.
set "PR_NUMBER=69"
set "PR_BRANCH=claude/Dev"
set "PR_TITLE=Full-detail character miniatures"
set "MAIN_DIR=%~dp0"
call "%~dp0tools\pr-test-runner.bat"
