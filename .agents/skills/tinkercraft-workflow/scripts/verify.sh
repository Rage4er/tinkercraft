#!/usr/bin/env bash
# TinkerCraft: typecheck + test + build. Запуск из любой точки репозитория.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT/web-app"

echo "== pnpm install =="
pnpm install --frozen-lockfile

echo "== pnpm typecheck =="
pnpm typecheck

echo "== pnpm test =="
pnpm test

echo "== pnpm build =="
pnpm build

echo "OK: typecheck + test + build"
