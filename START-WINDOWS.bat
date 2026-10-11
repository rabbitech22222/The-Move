@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 or newer from https://nodejs.org/en/download
  pause
  exit /b 1
)
node scripts\start-local.mjs
set "MOVE_EXIT_CODE=%errorlevel%"
if not "%MOVE_EXIT_CODE%"=="0" (
  echo.
  echo Setup failed. Log: .move-runtime\setup.log
  pause
)
exit /b %MOVE_EXIT_CODE%
