#!/bin/bash
# Запуск Yandex SDK тестирования с моками (dev-режим)
# Без авто-открытия браузера — выводит ссылку для копирования

# ── NVM Path ──────────────────────────────────────────────
export NVM_DIR="$HOME/.var/app/com.vscodium.codium/config/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

cd "$(dirname "$0")/web-app"

echo "═══════════════════════════════════════════"
echo "  TinkerCraft — Yandex SDK (Dev-режим)"
echo "═══════════════════════════════════════════"
echo ""
echo "  Запускаю Vite..."

# Запускаю Vite в фоне
pnpm dev:yandex &
VITE_PID=$!

# Жду 3 секунды, пока Vite поднимется
sleep 3

echo "  Запускаю Yandex SDK Proxy..."

# Запускаю прокси, ловлю ссылку
PROXY_OUTPUT=$(npx @yandex-games/sdk-dev-proxy -h http://localhost:5173 --dev-mode=true 2>&1 &)
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
echo "  Нажмите Ctrl+C для остановки"
echo "═══════════════════════════════════════════"

# При Ctrl+C киллю оба процесса
trap "kill $VITE_PID 2>/dev/null; exit" SIGINT SIGTERM

# Жду нажатия Ctrl+C
wait
