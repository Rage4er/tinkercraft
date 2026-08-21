#!/bin/bash
# Запуск Yandex SDK тестирования с моками (dev-режим)
# Двойной клик для запуска или: .\start-dev.bat

cd "%~dp0web-app"

echo "═══════════════════════════════════════════"
echo "  TinkerCraft — Yandex SDK (Dev-режим)"
echo "═══════════════════════════════════════════"
echo ""
echo "  1. Запускаю Vite (порт 5173)..."
echo "  2. Запускаю Yandex SDK Proxy (порт 8080)..."
echo ""
echo "  Браузер откроется автоматически."
echo "  Нажмите Ctrl+C для остановки."
echo "═══════════════════════════════════════════"
echo ""

concurrently ^
  -k ^
  -n "VITE,PROXY" ^
  -c "bgBlue.bold,bgMagenta.bold" ^
  "pnpm dev:yandex" ^
  "npx @yandex-games/sdk-dev-proxy -h http://localhost:5173 --dev-mode=true"
