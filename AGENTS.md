# AGENTS.md — Контекст для AI-ассистентов

> Этот файл предназначен для AI-ассистентов (Koda, Cursor, Claude, Copilot).
> Он содержит архитектурный контекст, конвенции и ключевые паттерны проекта.

## Проект

**TinkerCraft Web** — браузерный 3D CAD-редактор. Миграция десктопного Java-приложения CaDoodle на React + Three.js + manifold-3d.

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
pnpm test         # запуск тестов (35 тестов)
pnpm typecheck    # tsc --noEmit
```

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
| `src/App.tsx` | Главный компонент, тулбар, панель свойств, модалки (1809 строк) |
| `src/store/document-store.ts` | Zustand store — все действия, история, undo/redo (750 строк) |
| `src/store/notifications.ts` | Toast-уведомления (замена alert) |
| `src/csg/worker.ts` | WASM worker — manifold-3d операции, типобезопасные интерфейсы |
| `src/csg/worker-client.ts` | Promise-обёртка над воркером |
| `src/csg/types.ts` | Типы операций, сцены, параметров |
| `src/components/Viewport3D.tsx` | Three.js вьюпорт, гизмо, raycaster |
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
- Один store: `document-store.ts`
- Actions возвращают Promise при вызове воркера
- История операций — массив `history[]` с фильтрацией
- Undo/redo = полный rebuild через `rebuildFromHistory()`

### CSG Worker
- Воркер кэширует manifold-объекты по `id` (Map)
- `buildPrimitiveWithFillet` — только cube поддерживает fillet
- `extractAndCenter()` в store центрирует CSG-результаты (не воркер!)
- `sanitizeParams()` валидирует пользовательский ввод перед отправкой в воркер

### Тесты
- Type-level тесты: `src/csg/types.test.ts`
- Unit-тесты: `src/io/*.test.ts`, `src/store/*.test.ts`
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

### MIGRATION_PLAN.md
Если изменение затрагивает фазы миграции или известные проблемы:
- Обновите статус задачи (🔲 → 🔄 → ✅)
- Обновите таблицу «Известные проблемы и технический долг»

### Прочая документация
- `ARCHITECTURE.md` — при изменении потоков данных, слоёв, ключевых решений
- `AGENTS.md` — при изменении конвенций, паттернов, ключевых файлов
- `README.md` — при изменении возможностей, стека, команд

### Чек-лист перед завершением задачи
1. [ ] `CHANGELOG.md` обновлён
2. [ ] `CODE_REVIEW.md` обновлён (если затронуты проблемы из ревью)
3. [ ] `MIGRATION_PLAN.md` обновлён (если затронуты фазы/проблемы)
4. [ ] `pnpm typecheck` — 0 ошибок
5. [ ] `pnpm test` — все тесты проходят

## Важные паттерны

### Центрирование геометрии
Worker НЕ центрирует геометрию. Центрирование CSG-результатов выполняет store через `extractAndCenter()`. Viewport3D `centerGeometry()` центрирует обычные фигуры. Для CSG-результатов это безвредный no-op. `cachedRawVertices` предотвращает повторное центрирование при обновлениях.

### Toast вместо alert
Используйте `notify(message, type)` из `store/notifications.ts` для показа ошибок/предупреждений. Не используйте `alert()`.

### Валидация ввода
Используйте `clamp(v, min, max)` и `sanitizeParams(params)` из `worker.ts` для валидации пользовательских параметров перед отправкой в воркер.

## Известные ограничения (не баги)

- Fillet работает только для cube (требует специфичной математики для других форм)
- Undo/redo = полный rebuild (нет кэша snapshots — PERF-1)
- `App.tsx` и `document-store.ts` — крупные файлы (CRIT-1, CRIT-2 — отложенный рефакторинг)

## Документация

- `CODE_REVIEW.md` — результаты код-ревью с приоритетами
- `MIGRATION_PLAN.md` — план миграции (Фазы 0–7)
- `ARCHITECTURE.md` — описание архитектуры
- `CHANGELOG.md` — история изменений
