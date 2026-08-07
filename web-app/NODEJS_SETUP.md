# Node.js — Настройка и проверка

## 📋 Обзор

TinkerCraft Web — фронтенд-приложение на React + TypeScript + Vite. Node.js используется для разработки, сборки и тестирования.

---

## ✅ Фактическое состояние (проверено)

| Компонент | Версия | Статус |
|-----------|--------|--------|
| **Node.js** | v24.11.0 | ✅ Установлен |
| **pnpm** | 11.13.1 | ✅ Установлен |
| **npm** | 11.6.1 | ✅ Установлен (fallback) |
| **TypeScript** | 5.9.3 | ✅ Установлен |

---

## 📁 Структура зависимостей

```
web-app/
├── node_modules/           # 203 MB (pnpm store + symlinks)
│   ├── .pnpm/              # pnpm dependency tree
│   ├── .bin/               # Бинарники (tsc, vitest, vite)
│   ├── three               # ← symlink
│   ├── react               # ← symlink
│   └── ...
├── pnpm-lock.yaml          # Фиксация версий (коммитится)
└── package.json            # Описание зависимостей
```

**pnpm использует symbolic links** — `node_modules/three` указывает на `.pnpm/three@0.170.0/node_modules/three`.

---

## 🔧 Установка

### На чистом сервере

```bash
# 1. Установить Node.js (≥ 18.0)
# 2. Установить pnpm
npm install -g pnpm

# 3. Перейти в директорию проекта
cd /home/small-room/GitHub/tinkercraft/web-app

# 4. Установить зависимости
pnpm install
```

### Результат

- `node_modules/` — 203 MB (каталог с symlink'ами)
- `pnpm-lock.yaml` — фиксирует все версии
- `node_modules/.bin/` — бинарники (tsc, vitest, vite)

---

## 🧪 Проверка работоспособности

### 1. TypeScript type-check

```bash
cd /home/small-room/GitHub/tinkercraft/web-app
pnpm typecheck    # tsc --noEmit
```

**Результат:** 0 ошибок.

### 2. Тесты

```bash
cd /home/small-room/GitHub/tinkercraft/web-app
pnpm test         # vitest run
```

**Результат:** 205/205 тестов прошли (14 файлов).

### 3. Dev-сервер

```bash
cd /home/small-room/GitHub/tinkercraft/web-app
pnpm dev          # порт 5000
```

---

## 📌 Важные замечания

### node_modules в Git

- ✅ `pnpm-lock.yaml` — **коммитится** (фиксация версий)
- ❌ `node_modules/` — **НЕ коммитится** (исключён в `.gitignore`)
- ❌ `.pnpm/` внутри `node_modules/` — **НЕ коммитится**

### Почему pnpm?

- **Диск:** 203 MB вместо ~1 GB (symlink-based, не дублирование)
- **Определённость:** `pnpm-lock.yaml` гарантирует одинаковые версии
- **Скорость:** `pnpm install` быстрее `npm install`

### Node.js версии

- **Минимум:** ≥ 18.0 (LTS)
- **Фактическая:** v24.11.0 (текущая на сервере)
- **Рекомендация:** использовать `nvm` или `fnm` для переключения

---

## 🐛 Частые проблемы

| Проблема | Решение |
|----------|---------|
| `command not found: pnpm` | `npm install -g pnpm` |
| `command not found: node` | Node.js установлен через nvm: `/home/small-room/.var/app/com.vscodium.codium/config/nvm/versions/node/v24.11.0/bin/node`. Добавьте в PATH: `export PATH="/home/small-room/.var/app/com.vscodium.codium/config/nvm/versions/node/v24.11.0/bin:$PATH"` |
| `Module not found` | Удалить `node_modules/`, запустить `pnpm install` |
| Порт 5000 занят | Закрыть процесс: `lsof -ti:5000 | xargs kill` |
| Ошибки TypeScript | `pnpm typecheck` для детализации |
| Старый кэш Vite | Удалить `node_modules/.vite/` |

---

## 📊 Ресурсы

| Ресурс | Размер | Путь |
|--------|--------|------|
| `node_modules/` | 203 MB | `/home/small-room/GitHub/tinkercraft/web-app/node_modules/` |
| `node_modules/.pnpm/` | ~180 MB | pnpm store |
| `node_modules/.bin/` | ~2 MB | бинарники |

---

## ✅ Чек-лист для нового разработчика

1. [ ] Установить Node.js ≥ 18.0
2. [ ] Установить pnpm: `npm install -g pnpm`
3. [ ] Клонировать репозиторий
4. [ ] `cd web-app && pnpm install`
5. [ ] `pnpm typecheck` — 0 ошибок
6. [ ] `pnpm test` — 205/205 прошли
7. [ ] `pnpm dev` — сервер на порту 5000

---

## 📝 История изменений

| Дата | Изменение |
|------|-----------|
| 2025-08-01 | Документация создана — фактическое состояние проверено |
