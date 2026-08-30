@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo [myshop] 關閉開發伺服器...

taskkill /FI "WINDOWTITLE eq myshop-server*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq myshop-client*" /T /F >nul 2>&1

call :killport 3001
call :killport 5173

echo [myshop] 已關閉（port 3001 / 5173）
pause
exit /b 0

:killport
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:":%~1 " ^| findstr LISTENING') do (
  taskkill /F /PID %%P >nul 2>&1
)
exit /b 0
