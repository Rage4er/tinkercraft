#!/bin/bash
# Запуск Yandex SDK тестирования с реальным SDK (prod-режим)
# Без авто-открытия браузера — выводит ссылку для копирования
# Требует: черновик игры в консоли разработчика

# ── NVM Path ──────────────────────────────────────────────
export NVM_DIR="$HOME/.var/app/com.vscodium.codium/config/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")/web-app"

echo "═══════════════════════════════════════════"
echo "  TinkerCraft — Yandex SDK (Prod-режим)"
echo "═══════════════════════════════════════════"
echo ""
echo "  Запускаю Vite..."

# Запускаю Vite в фоне
pnpm dev:yandex &
VITE_PID=$!

# Жду 3 секунды, пока Vite поднимется
sleep 3

echo "  Запускаю Yandex SDK Proxy..."

# Запускаю прокси в фоне
npx @yandex-games/sdk-dev-proxy -h http://localhost:5173 --app-id=572445 2>&1 &

sleep 2

echo ""
echo "═══════════════════════════════════════════"
echo "  ✅ Серверы запущены!"
echo ""
echo "  📋 Откройте в режиме инкогнито:"
echo ""
echo "  👉  https://localhost:8080"
echo ""
echo "═══════════════════════════════════════════"
echo ""
echo "  Vite PID:  $VITE_PID"
echo "  ⚠️  app-id: 572445"
echo "  Нажмите Ctrl+C для остановки"
echo "═══════════════════════════════════════════"

# При Ctrl+C киллю процесс
trap "kill $VITE_PID 2>/dev/null; exit" SIGINT SIGTERM

# Жду нажатия Ctrl+C
wait
