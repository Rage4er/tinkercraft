#!/usr/bin/env bash
# TinkerCraft: e2e-регресс. Запускает dev-сервер, если он ещё не поднят.
# Использование:
#   scripts/e2e-regression.sh                # базовый набор
#   scripts/e2e-regression.sh smoke tree     # только указанные
# Не редактируй файлы во время прогона (HMR ломает e2e).
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT/web-app"

DEFAULT="smoke tree plug-and-play dimensions ux-viewport selection-outline ux-polish ortho-raycast ux-formats-settings modeling-tools view-modes clean-wireframe fix-curved-wireframe child-view-copy csg-child-view fix-view-modes-child"
SCRIPTS=("$@")
if [ ${#SCRIPTS[@]} -eq 0 ]; then
  # shellcheck disable=SC2206
  SCRIPTS=($DEFAULT)
fi

# Минимальный корректный вариант pnpm-скрипта не нужен: зовём vite напрямую,
# чтобы PID соответствовал процессу и его можно было аккуратно погасить.
start_server=0
if ! curl -sf -o /dev/null "http://127.0.0.1:5000/tinkercraft/"; then
  echo "== dev server =="
  ( cd "$ROOT/web-app" && exec ./node_modules/.bin/vite --host 127.0.0.1 --port 5000 --strictPort >/tmp/tc-e2e-dev.log 2>&1 ) &
  DEV_PID=$!
  start_server=1
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "http://127.0.0.1:5000/tinkercraft/"; then break; fi
    sleep 0.5
  done
  if ! curl -sf -o /dev/null "http://127.0.0.1:5000/tinkercraft/"; then
    echo "dev server не поднялся, см. /tmp/tc-e2e-dev.log"
    kill "$DEV_PID" 2>/dev/null || true
    exit 1
  fi
fi

cleanup() {
  if [ "$start_server" = "1" ]; then
    kill "$DEV_PID" 2>/dev/null || true
    wait "$DEV_PID" 2>/dev/null || true
    echo "dev server остановлен"
  fi
}
trap cleanup EXIT

export APP_URL="${APP_URL:-http://127.0.0.1:5000/tinkercraft/}"

failed=()
for s in "${SCRIPTS[@]}"; do
  echo "== e2e:$s =="
  if pnpm "e2e:$s" >"/tmp/tc-e2e-$s.log" 2>&1; then
    echo "  ✅ $s"
  else
    echo "  ❌ $s"
    tail -25 "/tmp/tc-e2e-$s.log" || true
    failed+=("$s")
  fi
done

echo
if [ ${#failed[@]} -gt 0 ]; then
  echo "FAIL: ${failed[*]}"
  exit 1
fi
echo "OK: e2e ${SCRIPTS[*]}"
