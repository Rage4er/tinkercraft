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
| 2026-08-24 | Добавлена секция «Сборка для Яндекс Игр» — создание ZIP-архива |

---

## 🎮 Сборка для Яндекс Игр

> **Требования SDK:** `/sdk.js` (относительный путь), иконки 192/512, manifest.json, purchases-catalog.json

### Шаг 1: Сборка yandex-версии

```bash
cd /home/small-room/GitHub/tinkercraft/web-app
export PATH="/home/small-room/.var/app/com.vscodium.codium/config/nvm/versions/node/v24.11.0/bin:$PATH"
pnpm build:yandex
```

**Результат:** `dist-yandex/` (~3.2 MB)

### Шаг 2: Проверка SDK (ОФИЦИАЛЬНЫЙ)

```bash
ls -lh dist-yandex/sdk.js
head -1 dist-yandex/sdk.js
```

**Ожидаемый результат:**
- Размер: ~3.7 KB (официальный SDK Яндекс Игр)
- Начало: `var YaGamesLoader;` (не `import`/`export`)

> **SDK_Yandex.md (п. 1.1):** SDK загружается с `sdk.games.s3.yandex.net/sdk.js`
> Подключается в index.html как `<script src="/sdk.js"></script>` ДО app code

### Шаг 3: Проверка подключения в index.html

```bash
grep "sdk.js" dist-yandex/index.html
```

**Должно быть:**
```html
<script src="/sdk.js"></script>
```

✅ SDK подключён **ДО** `<script type="module">` (app code)

### Шаг 4: Чек-лист корректной интеграции SDK

> **Требование платформы (п. 1.1):** SDK встроен корректно, реклама вызывается через SDK

| Проверка | Статус |
|----------|--------|
| SDK загружен синхронно через `<script src="/sdk.js">` | ✅ |
| SDK подключён ДО app code | ✅ |
| `YaGames.init()` вызывается в `sdk.ts` | ✅ |
| `LoadingAPI.ready()` вызывается после init | ✅ |
| `GameplayAPI.start()` вызывается после init | ✅ |
| Реклама вызывается ТОЛЬКО через `ysdk.adv.*` | ✅ |
| `stopGameplay()` при открытии рекламы | ✅ |
| `startGameplay()` при закрытии рекламы | ✅ |
| Обработка ошибок для всех вызовов SDK | ✅ |
| `getBannerAdvStatus()` для sticky banner | ✅ |

### Шаг 5: Проверка содержимого

```bash
ls -la dist-yandex/
```

**Обязательные файлы:**
- ✅ `index.html` — с `<script src="/sdk.js">` (до app code)
- ✅ `sdk.js` — SDK Яндекс Игр (копируется из `public/`)
- ✅ `icon-192.png` / `icon-512.png` / `icon.svg` — иконки
- ✅ `manifest.json` — PWA манифест
- ✅ `purchases-catalog.json` — каталог покупок (IAP)
- ✅ `assets/` — JS/CSS/WASM бандлы

### Шаг 5: Создание ZIP-архива

```bash
cd /home/small-room/GitHub/tinkercraft/web-app/dist-yandex
zip -r /home/small-room/GitHub/tinkercraft/tinkercraft-yandex.zip .
```

**Результат:** `/home/small-room/GitHub/tinkercraft/tinkercraft-yandex.zip` (~1.1 MB сжатый)

**Содержимое архива (17 файлов):**
```
sdk.js                              # SDK Яндекс Игр (п. 1.1)
index.html                          # Главная страница
manifest.json                       # PWA
purchases-catalog.json              # IAP
icon-192.png / icon-512.png / icon.svg
assets/worker-Oe8JwiBX.js
assets/index-DTgBuWnW.js          # ~1 MB (app bundle)
assets/index-DHvC04F5.css          # ~22 KB (стили)
assets/manifold-BE4c7gO-.wasm      # ~541 KB (CSG WASM)
assets/manifold-Dl_iq_qe.js
assets/helvetiker_regular.typeface-Dygzy7Mx.js
assets/FontLoader-B45xTpp6.js
assets/TextGeometry-02H9yQKw.js
assets/clean-CkZowF5v.js
assets/worker-Oe8JwiBX.js
```

### Шаг 5: Загрузка в консоль разработчика

1. Перейти в [Консоль разработчика Яндекс Игр](https://games.yandex.ru/console/)
2. Выбрать приложение TinkerCraft
3. Раздел **«Черновики»** → **«Загрузить архив»**
4. Загрузить `tinkercraft-yandex.zip`
5. Проверить валидацию и опубликовать

### ⚠️ Важные замечания

- **SDK подключён как `/sdk.js`** — требование SDK_Yandex.md (п. 1.1)
- **ZIP содержит файлы на верхнем уровне** — без папки `dist-yandex/`
- **SDK загружается ДО app code** — `<script src="/sdk.js">` в `<head>` перед `<script type="module">`
- **Иконки:** `icon-192.png` (192×192), `icon-512.png` (512×512), `icon.svg` (векторная)
- **purchases-catalog.json** — необходим для инап-покупок (IAP)
- **COEP/COOP** — не нужны для yandex-версии (блокируют SDK)

### 📊 Размер сборки

| Файл | Размер | Сжатый |
|------|--------|--------|
| `index-DTgBuWnW.js` | 1.06 MB | 300 KB |
| `manifold-BE4c7gO-.wasm` | 541 KB | 206 KB |
| `index-DHvC04F5.css` | 23 KB | 5 KB |
| `helvetiker_regular.typeface.js` | 63 KB | 22 KB |
| **Итого ZIP** | **3.2 MB** | **1.1 MB** |
