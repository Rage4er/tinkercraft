# AGENTS.md — Контекст для AI-ассистентов

> Этот файл предназначен для AI-ассистентов (Koda, Cursor, Claude, Copilot).
> Он содержит архитектурный контекст, конвенции и ключевые паттерны проекта.

## Проект

**TinkerCraft Web** — браузерный 3D CAD-редактор. Вдохновлён CaDoodle, реализован с нуля на React + Three.js + manifold-3d.

## Стек

- **React 18** + **TypeScript 5.7** (strict mode)
- **Three.js r170** — 3D рендеринг
- **manifold-3d** (WASM) — CSG операции в Web Worker
- **Zustand 5** — стейт-менеджмент
- **Vite 6** — сборка
- **Vitest 4** — тесты
- **pnpm** — пакетный менеджер

## Команды

```bash
cd web-app
pnpm dev          # dev-сервер (порт 5000)
pnpm build        # production-сборка
pnpm test         # запуск тестов (205 тестов)
pnpm typecheck    # tsc --noEmit
pnpm verify       # полная проверка: typecheck + test + build + build:yandex
```

> **После любой правки** (экономика, сохранения, i18n, platform, действия) запускайте `pnpm verify` и проверяйте чек-лист в `docs/PRE_COMMIT_CHECKLIST.md`.

## Архитектура (data flow)

```
User Input → App.tsx (UI) → document-store.ts (Zustand) → worker-client.ts → worker.ts (WASM CSG)
                ↓                    ↓                                               ↓
           Viewport3D.tsx      history[] (undo/redo)                          manifold-3d
           (Three.js render)   IndexedDB autosave
```

### Ключевые файлы

| Файл | Ответственность |
|---|---|
| `src/App.tsx` | Layout, keyboard shortcuts, text modal form state, economy init |
| `src/constants.ts` | Общие константы (ALL_SHAPES, SNAP_VALUES, OP_FILTER_LABELS, spacing, epsilon, OBJECT_COLORS, WADS_OPTIMUM_16) |
| `src/store/document-store.ts` | Zustand store — действия (create), 500 строк |
| `src/store/ui-store.ts` | Zustand store — UI state (gizmo, theme, camera, modals, etc.) |
| `src/store/economy-store.ts` | Экономика: токены, подписки, аренда 24ч, квесты, кэшбэк |
| `src/store/economy-config.ts` | Конфиг экономики (тарифы, лимиты, кулдауны) |
| `src/store/economy-ui-config.ts` | Конфиг UI экономики (видимость элементов) |
| `src/store/helpers.ts` | Утилиты store (extractAndCenter, extractAndCenterGetAABB, computeAABB, makeObject, nextId, colorForIndex) |
| `src/store/types.ts` | DocumentStore interface |
| `src/store/rebuild.ts` | rebuildFromHistory — восстановление объектов из истории операций |
| `src/store/snapshots.ts` | Snapshot cache для мгновенного undo/redo (PERF-1) |
| `src/store/notifications.ts` | Toast-уведомления (замена alert) |
| `src/csg/worker.ts` | WASM worker — manifold-3d операции, типобезопасные интерфейсы |
| `src/csg/worker-client.ts` | Promise-обёртка над воркером |
| `src/csg/types.ts` | Типы операций, сцены, параметров |
| `src/components/Viewport3D.tsx` | Three.js вьюпорт, гизмо, raycaster, ruler, snap-to-geometry |
| `src/components/snap-utils.ts` | Привязка (snap) к геометрии: vertex, edge, face, circle |
| `src/components/Toolbar.tsx` | Тулбар (файл, undo, view, gizmo, CSG, тема) |
| `src/components/LeftPanel.tsx` | Палитра фигур + список объектов + история |
| `src/components/PropertiesPanel.tsx` | Панель свойств (трансформ, resize, fillet, extrude, CSG, палитра цветов) |
| `src/components/ColorPalette.tsx` | Палитра Wad's Optimum 16 — 16 цветов для быстрого выбора |
| `src/components/EconomyHUD.tsx` | HUD экономики (токены, ежедневный бонус, реклама) |
| `src/components/QuestPanel.tsx` | Панель ежедневных квестов с прогрессом |
| `src/components/TextModal.tsx` | Модалка 3D текста |
| `src/components/StatusBar.tsx` | Статус-бар |
| `src/components/NumInput.tsx` | Numeric input с draft-редактированием |
| `src/components/Section.tsx` | Collapsible section |
| `src/components/Timeline.tsx` | История операций + opIcon/opLabel |
| `src/io/stl-import.ts` | Импорт STL (бинарный + ASCII) |
| `src/io/stl-export.ts` | Экспорт в бинарный STL |
| `src/io/doodle-io.ts` | Формат .doodle (ZIP + JSON) |
| `src/io/autosave.ts` | Автосохранение в IndexedDB |

## Конвенции кода

### TypeScript
- `strict: true` — без `any` (кроме точки инициализации WASM: `as unknown as ManifoldAPI`)
- Экспортируйте функции для тестирования (не тестируйте через приватные)
- Интерфейсы для внешних API (WASM), типы для доменных сущностей

### React
- `useMemo` для производных значений из store (Set, reduce и т.п.)
- `useRef` для стабилизации `useEffect` (паттерн `kbRef` — см. keyboard shortcuts)
- Zustand store функции стабильны — можно использовать в deps без пересоздания

### Состояние (Zustand)
- Два store: `document-store.ts` (документ/сцена) и `ui-store.ts` (UI state)
- Actions возвращают Promise при вызове воркера
- История операций — массив `history[]` с фильтрацией
- Undo/redo через `rebuildFromHistory()` с snapshot cache (`snapshots.ts`) — мгновенный undo/redo при наличии кэша, fallback на WASM rebuild

### CSG Worker
- Воркер кэширует manifold-объекты по `id` (Map)
- `buildPrimitiveWithFillet` — только cube поддерживает fillet
- `extractAndCenter()` в store центрирует CSG-результаты (не воркер!)
- `sanitizeParams()` валидирует пользовательский ввод перед отправкой в воркер

### Тесты
- Type-level тесты: `src/csg/types.test.ts`
- Unit-тесты: `src/csg/*.test.ts`, `src/io/*.test.ts`, `src/store/*.test.ts`, `src/components/*.test.ts`
- Мок IndexedDB: `src/__mocks__/indexeddb.ts` (in-memory IDB для jsdom)
- Среда: jsdom (через vite.config.ts)
- Имена: `describe('FunctionName')` → `it('описание')`

### CSS
- Тёмная/светлая темы через CSS-переменные в `App.css`
- Инлайн-стили допустимы для динамических значений (position, color из объекта)

## Документирование изменений (обязательно)

**Любое изменение в коде должно быть задокументировано.** Без исключений.

### CHANGELOG.md
После каждого изменения добавьте запись в `CHANGELOG.md` в секцию `[Unreleased]`:
- `Added` — новые функции, файлы, возможности
- `Changed` — изменения в существующем поведении
- `Removed` — удалённый код, файлы, функции
- `Fixed` — исправленные баги

Формат записи: `- Краткое описание (ссылка на файл/модуль если нужно)`

### CODE_REVIEW.md
Если изменение исправляет проблему из код-ревью — отметьте статус:
- `✅ ИСПРАВЛЕНО` — проблема устранена
- `✅ НЕ БАГ` — проблема проверена, не требует исправления
- Обновите таблицу «Статус исправлений» и приоритеты действий

### DEVELOPMENT_PLAN.md
Если изменение затрагивает фазы разработки или известные проблемы:
- Обновите статус задачи (🔲 → 🔄 → ✅)
- Обновите таблицу «Известные проблемы и технический долг»

### Прочая документация
- `ARCHITECTURE.md` — при изменении потоков данных, слоёв, ключевых решений
- `AGENTS.md` — при изменении конвенций, паттернов, ключевых файлов
- `README.md` — при изменении возможностей, стека, команд

### Чек-лист перед завершением задачи
1. [ ] `CHANGELOG.md` обновлён
2. [ ] `CODE_REVIEW.md` обновлён (если затронуты проблемы из ревью)
3. [ ] `DEVELOPMENT_PLAN.md` обновлён (если затронуты фазы/проблемы)
4. [ ] `pnpm typecheck` — 0 ошибок
5. [ ] `pnpm test` — все тесты проходят

## Важные паттерны

### Центрирование геометрии
Worker НЕ центрирует геометрию. Центрирование CSG-результатов выполняет store через `extractAndCenter()`. Viewport3D `centerGeometry()` центрирует обычные фигуры. Для CSG-результатов это безвредный no-op. `cachedRawVertices` предотвращает повторное центрирование при обновлениях.

### Toast вместо alert
Используйте `notify(message, type)` из `store/notifications.ts` для показа ошибок/предупреждений. Не используйте `alert()`.

### Валидация ввода
Используйте `clamp(v, min, max)` и `sanitizeParams(params)` из `worker.ts` для валидации пользовательских параметров перед отправкой в воркер.

### Привязка линейки к геометрии (snap-to-geometry)
При включённой `rulerMode` точки клика линейки привязываются к геометрии фигур через `findNearestSnap()` (`snap-utils.ts`):
- Raycast → поиск вершин/рёбер/граней/центров → выбор лучшего кандидата
- Приоритет: vertex > edge > circle > face
- Fallback (если raycast не попал) — проекция на рабочую плоскость Z=0
- Визуальный индикатор — цветная сфера (`createSnapIndicator`)
- Цвета: vertex=красный, edge=зелёный, circle=синий, face=жёлтый
- Константы радиусов: `SNAP_VERTEX_RADIUS=2.0`, `SNAP_EDGE_RADIUS=2.0`, `SNAP_FACE_RADIUS=2.0`, `SNAP_CIRCLE_RADIUS=3.0`

### Палитра цветов (Wad's Optimum 16)
По умолчанию в `PropertiesPanel.tsx` отображается палитра `ColorPalette.tsx` с 16 цветами из `WADS_OPTIMUM_16` (`constants.ts`):
- Нативный `<input type="color">` скрыт за кнопкой-переключателем "Расширенный выбор"
- Выбор цвета в палитре работает через draft-режим (preview без history, commit при blur/object switch)
- Цвета: Amethyst, Blue, Caramel, Damson, Ebony, Forest, Green, Honeydew, Iron, Jade, Khaki, Lime, Magenta, Navy, Orange, Pink

### Экономика (токены, квесты, подписки)
- `economy-store.ts` — Zustand store с persist (localStorage) + syncToCloud (Yandex SDK)
- Доход: ежедневный бонус +50, реклама +50 (≤3/день), квесты +20/+30/+50, действия +1 (≤30/день), кэшбэк 5–25
- Траты: экспорт 50, импорт 100, аренда 24ч (текст 75, палитра 75), подписки 700/неделя, 2000/месяц
- Квесты: 3/день (1 лёгкое + 1 среднее + 1 сложное), сброс в полночь, прогресс по триггерам
- Аренда 24ч: отсчёт от момента покупки (не до полуночи)
- Clean-версия: вся экономика отключена, всё бесплатно

## Известные ограничения (не баги)

- Fillet работает только для cube (требует специфичной математики для других форм)

## Node.js — Настройка и проверка

Перед работой с проектом убедитесь, что Node.js настроен корректно.

- **Документация:** `web-app/NODEJS_SETUP.md` — полное руководство по настройке Node.js, pnpm, проверке typecheck и тестов
- **Фактическое состояние:** Node.js v24.11.0, pnpm 11.13.1
- **node_modules:** 203 MB (pnpm symlink-based, не коммитится)
- **Проверка:** `cd web-app && pnpm typecheck && pnpm test`

Если возникают вопросы по Node.js, зависимостям или запуску тестов — **сначала прочитайте `web-app/NODEJS_SETUP.md`**.

## Документация

- `CODE_REVIEW.md` — результаты код-ревью с приоритетами
- `DEVELOPMENT_PLAN.md` — план разработки (Фазы 0–7)
- `ARCHITECTURE.md` — описание архитектуры
- `CHANGELOG.md` — история изменений
- `web-app/NODEJS_SETUP.md` — настройка Node.js, pnpm, проверка typecheck и тестов
- `docs/PRE_COMMIT_CHECKLIST.md` — чек-лист пост-рефакторинга (обязателен перед коммитом)
