@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [myshop] 找不到 Node.js，請先安裝後再啟動。
  pause
  exit /b 1
)

if not exist "%~dp0server\node_modules\" (
  echo [myshop] 尚未安裝後端依賴，請先在 server 目錄執行 npm install
  pause
  exit /b 1
)

if not exist "%~dp0client\node_modules\" (
  echo [myshop] 尚未安裝前端依賴，請先在 client 目錄執行 npm install
  pause
  exit /b 1
)

set "PORT_IN_USE=0"
call :port_in_use 3001
if "%PORT_IN_USE%"=="1" (
  echo [myshop] 後端已在 port 3001 運行，略過啟動。
  goto :after_server
)
echo [myshop] 啟動後端 http://localhost:3001
call :start_dev "myshop-server" "%~dp0server"
:after_server

set "PORT_IN_USE=0"
call :port_in_use 5173
if "%PORT_IN_USE%"=="1" (
  echo [myshop] 前端已在 port 5173 運行，略過啟動。
  goto :after_client
)
echo [myshop] 啟動前端 http://localhost:5173
call :start_dev "myshop-client" "%~dp0client"
:after_client

echo.
echo [myshop] 已啟動。關閉請執行 stop.bat
echo [myshop] 前台  http://localhost:5173
echo [myshop] 後端  http://localhost:3001
echo [myshop] 後台  http://localhost:5173/admin
pause
exit /b 0

:port_in_use
set "PORT_IN_USE=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /C:":%~1 " ^| findstr LISTENING') do set "PORT_IN_USE=1"
exit /b 0

:start_dev
rem Avoid START inside parenthesized IF blocks — cmd.exe drops later commands.
start "%~1" /D "%~2" cmd /k npm run dev
exit /b 0
