@echo off
setlocal EnableDelayedExpansion

REM ============================================================
REM   DnD-App-v2  -  PR test runner (shared engine)
REM
REM   Do NOT run this directly. It is called by a test-pr-<N>.bat
REM   launcher (which sets PR_NUMBER / PR_BRANCH / PR_TITLE).
REM
REM   It checks out a PR branch into its OWN folder, on its OWN port,
REM   with its OWN game data, and runs it. Your main install
REM   (%USERPROFILE%\DnD-App-v2) and its save data are never touched,
REM   so start.bat always keeps running the approved claude/Main code.
REM   Close the "PR# TEST" window to stop the test.
REM ============================================================

if not defined PR_NUMBER goto helper_misuse
if not defined PR_BRANCH goto helper_misuse

set "REPO_URL=https://github.com/vcons002-ship-it/DnD-App-v2.git"
set "TEST_DIR=%USERPROFILE%\DnD-App-v2-pr-%PR_NUMBER%"
REM Each PR gets a distinct port (4100 + PR number) so several can run at once
REM and none collide with the main install's default port (4000).
set /a TEST_PORT=4100+%PR_NUMBER%

title DnD-App-v2 PR#%PR_NUMBER% test setup

REM Make node/npm/git visible even right after a fresh install.
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"`) do set "PATH=%%P"

where node >nul 2>nul || goto no_node
where git  >nul 2>nul || goto no_git

REM ----- If the PR is merged/closed, clean up instead of testing -----
REM A missing remote branch means the PR is done. We act ONLY on a definite
REM "branch is gone" answer; any network/other error skips this check so an
REM offline run never wrongly deletes a folder.
git ls-remote --heads "%REPO_URL%" "%PR_BRANCH%" > "%TEMP%\ddpr_%PR_NUMBER%.txt" 2>nul
if errorlevel 1 goto branch_checked
set "LSSIZE=1"
for %%A in ("%TEMP%\ddpr_%PR_NUMBER%.txt") do set "LSSIZE=%%~zA"
if "!LSSIZE!"=="0" goto pr_closed
:branch_checked
del "%TEMP%\ddpr_%PR_NUMBER%.txt" >nul 2>nul

echo ============================================================
echo   Testing PR #%PR_NUMBER%
REM Delayed expansion so any special chars in the title can't break echo.
echo   !PR_TITLE!
echo.
echo   branch : %PR_BRANCH%
echo   folder : %TEST_DIR%
echo   port   : %TEST_PORT%   (your main install is left untouched)
echo ============================================================
echo.

REM Trust the test folder for git, mirroring install.bat's safeguard.
set "GITDIR=%TEST_DIR:\=/%"
git config --global --add safe.directory "%GITDIR%" >nul 2>nul

REM ----- Get / refresh an isolated checkout of just the PR branch -----
if exist "%TEST_DIR%\.git" goto update

echo Cloning the PR branch into an isolated folder ...
git clone --branch "%PR_BRANCH%" --single-branch "%REPO_URL%" "%TEST_DIR%"
if errorlevel 1 goto clone_failed
goto setup

:update
echo Updating the PR test folder to the latest %PR_BRANCH% ...
pushd "%TEST_DIR%"
git fetch origin "%PR_BRANCH%"
git checkout -B pr-local "origin/%PR_BRANCH%"
git reset --hard "origin/%PR_BRANCH%"
popd

:setup
REM Carry over your API key / DM passphrase from the main install (if any) so the
REM PR behaves like your real setup. PORT/PUBLIC_URL are forced below regardless.
if defined MAIN_DIR if exist "%MAIN_DIR%.env" copy /Y "%MAIN_DIR%.env" "%TEST_DIR%\.env" >nul 2>nul

pushd "%TEST_DIR%"
echo.
echo Installing dependencies for the PR (separate from your main install) ...
call npm install
if !errorlevel! neq 0 goto npm_failed

echo.
echo Building the PR branch ...
call npm run build
if !errorlevel! neq 0 goto build_failed
popd

REM ----- Launch the PR in its own window. Force a local-only port and a
REM ----- localhost PUBLIC_URL so the server skips the Cloudflare tunnel. -----
set "PORT=%TEST_PORT%"
set "PUBLIC_URL=http://localhost:%TEST_PORT%"
echo.
echo Starting PR #%PR_NUMBER% on http://localhost:%TEST_PORT% ...
start "DnD PR#%PR_NUMBER% TEST  (port %TEST_PORT% - close to stop)" /d "%TEST_DIR%" cmd /k "npm run start -w server"

REM Give the server a moment to boot, then open the DM + player views.
timeout /t 8 /nobreak >nul
start "" "http://localhost:%TEST_PORT%/dm"
start "" "http://localhost:%TEST_PORT%/join"

echo.
echo ============================================================
echo   PR #%PR_NUMBER% is running in its own window.
echo     DM:      http://localhost:%TEST_PORT%/dm
echo     Players: http://localhost:%TEST_PORT%/join
echo.
echo   Close that "PR#%PR_NUMBER% TEST" window to stop it.
echo   Your main install and start.bat (claude/Main) are unaffected.
echo ============================================================
echo.
pause
exit /b 0

:pr_closed
del "%TEMP%\ddpr_%PR_NUMBER%.txt" >nul 2>nul
echo ============================================================
echo   PR #%PR_NUMBER% has been merged or closed.
echo   Its code (if merged) is already in your main install - run start.bat.
echo.
if exist "%TEST_DIR%" (
  echo   Removing throwaway test folder:
  echo     %TEST_DIR%
  rmdir /s /q "%TEST_DIR%"
)
echo.
echo   This launcher removes itself the next time you run install.bat.
echo ============================================================
echo.
pause
exit /b 0

:helper_misuse
echo This is a helper used by the PR test launchers.
echo Double-click a "PR #^<N^> - ^<title^>.bat" file instead.
pause
exit /b 1
:no_node
echo Node.js was not found. Run install.bat first.
pause
exit /b 1
:no_git
echo Git was not found. Run install.bat first.
pause
exit /b 1
:clone_failed
echo [ERROR] Could not clone branch "%PR_BRANCH%". Check the branch name and your network.
pause
exit /b 1
:npm_failed
echo [ERROR] npm install failed for the PR. See the messages above.
popd
pause
exit /b 1
:build_failed
echo [ERROR] Build failed for the PR. See the messages above.
popd
pause
exit /b 1
