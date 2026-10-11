@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 이상을 먼저 설치하세요.
  pause
  exit /b 1
)
node scripts\start-live.mjs
set "MOVE_EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %MOVE_EXIT_CODE%
