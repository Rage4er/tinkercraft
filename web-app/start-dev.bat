@echo off

rem --------------------------------------------------------------

rem  Запуск dev‑сервера Vite для TinkerCraft Web

rem  Требуется: Node.js (≥18) и pnpm (≥8) установлены глобально

rem --------------------------------------------------------------



:: Переходим в папку web-app (если скрипт запущен из другого места)

cd /d "%~dp0"



:: Проверяем, установлен ли pnpm

where pnpm >nul 2>&1

if errorlevel 1 (

    echo [ОШИБКА] pnpm не найден в PATH.

    echo Установите pnpm:  npm i -g pnpm

    pause

    exit /b 1

)



:: Устанавливаем зависимости (если ещё не установлены)

if not exist node_modules (

    echo [ИНФО] Устанавливаю зависимости через pnpm…

    pnpm install --frozen-lockfile

) else (

    echo [ИНФО] Папка node_modules уже существует – пропускаю установку.

)



:: Запускаем Vite dev server

echo [ИНФО] Запускаю Vite dev server…

pnpm dev



:: Если сервер завершился с ошибкой – держим окно открытым, чтобы увидеть вывод

if errorlevel 1 (

    echo.

    echo [ОШИБКА] Vite dev server завершился с кодом %errorlevel%.

    pause

)
