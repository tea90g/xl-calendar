@echo off
cd /d %~dp0
echo Installing packages...
call npm install
if errorlevel 1 pause && exit /b 1
echo Building Windows installer...
call npm run build:win
if errorlevel 1 pause && exit /b 1
echo Done. Check the release folder.
pause
