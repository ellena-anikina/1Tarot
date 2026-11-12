@echo off
chcp 65001 >nul
title Сайт Таро - локальный сервер
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Установите его с https://nodejs.org - версия 20 или новее - и запустите этот файл снова.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Первый запуск: устанавливаю зависимости, это займёт минуту-другую...
  call npm install
  if errorlevel 1 (
    echo Не получилось установить зависимости. Проверьте интернет и попробуйте ещё раз.
    pause
    exit /b 1
  )
)

echo.
echo Сайт откроется в браузере: http://localhost:3000
echo Если порт 3000 занят другим проектом, адрес будет указан ниже, например http://localhost:3001
echo Чтобы остановить сервер, закройте это окно или нажмите Ctrl+C.
echo.
start "" cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:3000"
call npm run dev
