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
- **Vitest 4** — тесты (614 тестов, 50 файлов — ветка `phase-9.5.4`)
- **pnpm** — пакетный менеджер

## Команды

```bash
cd web-app
pnpm dev          # dev-сервер (порт 5000)
pnpm build        # production-сборка
pnpm test         # запуск тестов (614 тестов, 50 файлов)
pnpm typecheck    # tsc --noEmit
pnpm e2e:smoke    # дымовой тест в браузере (Playwright; нужен запущенный pnpm dev; см. web-app/e2e/helpers.mjs)
pnpm e2e:tree     # Фаза 9.1: раскрытие CSG в дереве, выбор ребёнка
pnpm e2e:edit-child  # Фаза 9.2/9.3: правка параметра ребёнка CSG, undo
pnpm e2e:edit-step-move  # Фаза 9.5.2: ✎ у шага move → ΔX → CSG пересчитан, undo/redo
pnpm e2e:edit-step-mirror  # Фаза 9.5.3: ✎ у шага mirror → плоскость XZ → CSG пересчитан, undo/redo
pnpm e2e:edit-step-extrude  # Фаза 9.5.4: проект из e2e/fixtures/extrude-union.3dtc → ✎ у extrude → глубина 10, undo/redo
```

## Текущий статус

| Фаза | Описание | Статус |
|------|----------|--------|
| 0–7.6 | Ядро CAD, CSG, UI, Mirror, Timeline | ✅ Завершены |
| **8** | **Единая модель трансформов** | ✅ Завершена (v1.1.0) |
| **8.5** | **Унификация отрисовки и данных** | ✅ Завершена (v1.2.3) |
| **9** | **Параметрическая история** — 9.1–9.4, 9.6–9.9 ✅; 9.5.0 (эффективная история) ✅; 9.5.1 (fillet) ❌ отменена; 9.5.2 move ✅; 9.5.3 mirror ✅; 9.5.4 extrude ✅ — 9.5 закрыта | 🔄 Идёт (ветка `phase-9`) |
| 10 | Яндекс.Игры — монетизация (ветка `yandex-games`) | 🔄 Отдельная ветка (Y.1–Y.5 ✅) |
| 11 | Будущее (SVG, 3MF, STEP, B-Rep fillet, Rapier) | 🔲 Запланирована |

**Фаза 8 в деталях:** `web-app/ARCHITECTURE_TRANSFORMS.md`
**Фаза 8.5 в деталях:** `web-app/ARCHITECTURE_RENDER.md`
**Фаза 9 в деталях:** `docs/PHASE_9_DESIGN.md` (9.1–9.9), `docs/PHASE_9_5_DESIGN.md` (9.5: правка прошлых шагов, каскад CSG)

## Ветки

| Ветка | Назначение |
|-------|------------|
| `main` | Чистый CAD (Open Source, GPL-3.0) |
| `phase-9` | Фаза 9 (от `main`); `phase-9.5.0` и `remove-fillet` в неё смержены (PR #1–#3) |
| `phase-9.5.4` | Правка шага extrude (от `phase-9`), PR в `phase-9`; `phase-9.5.2`/`phase-9.5.3` смержены (PR #4, #5) |
| `yandex-games` | Версия для Яндекс.Игр (экономика, реклама, токены); Фазу 9 ещё не содержит |

Цепочка: `main` → `phase-9` → `phase-9.5.4`; после — merge `phase-9 → main`.

## Архитектура (data flow)

```
User Input → App.tsx (UI) → document-store.ts (Zustand) → worker-client.ts → worker.ts (WASM CSG)
                ↓                    ↓                                               ↓
           Viewport3D.tsx      history[] (undo/redo)                          manifold-3d
           (Three.js render)   IndexedDB autosave
                                     ↓
                            history-tree.ts (Build Tree)
                            (primitive / boolean / baked)
```

### Ключевые файлы

| Файл | Ответственность |
|---|---|
| `src/App.tsx` | Layout, keyboard shortcuts, text modal form state |
| `src/constants.ts` | Общие константы (ALL_SHAPES, SNAP_VALUES, OP_FILTER_LABELS, spacing, epsilon) |
| **Store** | |
| `src/store/document-store.ts` | Zustand store — действия (create), 500 строк |
| `src/store/ui-store.ts` | Zustand store — UI state (gizmo, theme, camera, modals, etc.) |
| `src/store/helpers.ts` | Утилиты store (extractAndCenter, extractAndCenterGetAABB, computeAABB, makeObject, nextId, colorForIndex; `computeWorldAABB`/`worldVerticesAABB` — мировая рамка, `solveAlignDeltas` — решатель выравнивания, общий для `alignSelected` и re-solve 9.5.2; `extrudeSlab` — плита extrude по мировой рамке базы, 9.5.4) |
| `src/store/types.ts` | DocumentStore interface |
| `src/store/rebuild.ts` | rebuildFromHistory — восстановление объектов из истории операций |
| `src/store/snapshots.ts` | Snapshot cache для мгновенного undo/redo (PERF-1) |
| `src/store/notifications.ts` | Toast-уведомления (замена alert) |
| `src/store/mirror-store.ts` | Store для зеркальных операций |
| **CSG / Build Tree** | |
| `src/csg/history-tree.ts` | **Build Tree** — параметрическое дерево (primitive/boolean/baked), `rebuildNode`, `mirrorNodeRecursive`, `cloneSubtree` |
| `src/csg/tree-store.ts` | Zustand-стор для Build Tree |
| `src/csg/tree-view.ts` | Read-модель Build Tree для UI (`getTreeView`, `findViewNode`, `formatParams`) и единая проверка редактируемости `isChildEditable` — Фаза 9.1/9.9 |
| `src/hooks/useRootConsistency.ts` | Согласованность дерева CSG-корня с мешем (замки в дереве) — Фаза 9.9 |
| `src/csg/child-params.ts` | Поля параметров примитива для формы правки ребёнка CSG (`getParamFields`, `clampFieldValue`) — Фаза 9.2 |
| `src/store/edit-child.ts` | Пересчёт CSG после смены params ребёнка: калибровка дерева ↔ меш, un-bake в локальную систему корня (`computeEditedChild`, `unbakeToLocal`, `findCreationTransform`) — Фаза 9.3 |
| `src/store/project-history.ts` | **Эффективная история** (Фаза 9.5.0): `projectHistory` подставляет `edit_step` (патч шага N + `replacements` замороженных шагов) и выбрасывает их; идемпотентна, вызывается на входе `rebuild.ts` и `findCreationTransform`. `computeCascade` — замыкание зависимостей правки |
| `src/store/csg-result.ts` | Общее ядро CSG `computeCsgResult` (sync → boolean → pivot = transformA → un-bake RS) для `csgBoolean` и каскада 9.5; `syncObjectsForOperation`, `groupOperationFromResult`, `groupReplacementFromResult` |
| `src/store/edit-step.ts` | **Правка прошлого шага** (Фаза 9.5.2): `computeStepEdit` — гипотетическая проекция + каскад (`group` через `computeCsgResult`, `edit_child_params` путём 9.3, `align` re-solve); атомарный отказ; `isStepEditable` / `SUPPORTED_KINDS` — какие шаги правятся (move, mirror, extrude — группа с `source`); плита extrude пересчитывается по рамке базы (`extrudeSlab`) |
| `src/components/StepPanel.tsx` | Панель «Шаг N» (вместо `PropertiesPanel`, пока `ui-store.selectedStep` задан): ΔX/ΔY/ΔZ шага move (коммит по Enter/blur), плоскость шага mirror (сразу по выбору), глубина шага extrude (ось — просмотр) → `editStepParams` — Фаза 9.5.2–9.5.4 |
| `src/hooks/useSelectedStepGuard.ts` | Сброс выбора шага (undo до шага, выделение в сцене, выбор ребёнка CSG) — Фаза 9.5.2 |
| `src/components/ChildPropertiesPanel.tsx` | Панель свойств выбранного ребёнка CSG (вместо `PropertiesPanel`, пока `ui-store.selectedChild` задан) — Фаза 9.2 |
| `src/components/ComponentTree.tsx` | Дерево объектов сцены; CSG-результат раскрывается в детей из Build Tree, выбор ребёнка → `ui-store.selectedChild` — Фаза 9.1 |
| `src/csg/rebuildOps.ts` | `applyMoveDelta`, `applyMirrorToTransform`, `applyAlignToTransform` |
| `src/csg/worker.ts` | WASM worker — manifold-3d операции, типобезопасные интерфейсы |
| `src/csg/worker-client.ts` | Promise-обёртка над воркером |
| `src/csg/worker-handlers.ts` | Индивидуальные handlers для каждой операции |
| `src/csg/worker-matrix.ts` | Чистая матричная математика (SRT, RS, transform) |
| `src/csg/types.ts` | Типы операций, сцены, параметров, `TreeNode` |
| `src/csg/BUILD_TREE_SPEC.md` | Спецификация Build Tree (1410 строк) |
| **Components** | |
| `src/components/Viewport3D.tsx` | Three.js вьюпорт, гизмо, raycaster, ruler, snap-to-geometry |
| `src/components/snap-utils.ts` | Привязка (snap) к геометрии: vertex, edge, face, circle |
| `src/components/Toolbar.tsx` | Тулбар (файл, undo, view, gizmo, CSG, тема) |
| `src/components/LeftPanel.tsx` | Палитра фигур + список объектов + история |
| `src/components/PropertiesPanel.tsx` | Панель свойств (трансформ, resize, extrude, CSG) |
| `src/components/TextModal.tsx` | Модалка 3D текста |
| `src/components/StatusBar.tsx` | Статус-бар |
| `src/components/NumInput.tsx` | Numeric input с draft-редактированием |
| `src/components/Section.tsx` | Collapsible section |
| `src/components/Timeline.tsx` | История операций + opIcon/opLabel |
| **IO** | |
| `src/io/stl-import.ts` | Импорт STL (бинарный + ASCII) |
| `src/io/stl-export.ts` | Экспорт в бинарный STL |
| `src/io/doodle-io.ts` | **УСТАРЕЛО**: формат .doodle (legacy, не поддерживается) |
| `src/io/3dtc-io.ts` | Формат .3dtc (ZIP + JSON) — основной формат проекта (v1.2.0+) |
| `src/io/autosave.ts` | Автосохранение в IndexedDB |
| `src/io/legacy-fillet.ts` | Миграция старых проектов со скруглением: вырезает шаги `fillet`, снимает `filletRadius`, перенумеровывает `edit_step` (вызывается при всех загрузках в сторе) |
| **Platform (yandex-games ветка)** | |
| `src/platform/index.ts` | Абстракция платформы (clean / yandex) |

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
- **Эффективная история (Фаза 9.5):** потребители истории читают `projectHistory(ops)`, а не сырые `operations` — новые функции, разбирающие историю, проецируют её на входе (`edit_step` не должна доходить до воспроизведения)
- Undo/redo через `rebuildFromHistory()` с snapshot cache (`snapshots.ts`) — мгновенный undo/redo при наличии кэша, fallback на WASM rebuild

### CSG Worker
- Воркер кэширует manifold-объекты по `id` (Map)
- `sanitizeParams()` валидирует пользовательский ввод перед отправкой в воркер

### Build Tree (Фаза 8)
- **`relativeToParent`** — единственный источник истины для трансформов
- **`localTransform`** — вычисляемый (для UI)
- **`vertices`** — всегда в origin (центрированы по центру масс)
- Transform применяется **один раз** (в `rebuildNode` или worker)
- См. `web-app/ARCHITECTURE_TRANSFORMS.md`

### Единый источник (Фаза 8.5 + 8.5.9)
- **`vertices`** — всегда в origin (центр масс). Для CSG: вершины un-baked'ятся от RS операнда A (`v = S⁻¹Rᵀ·(v_world − posA)`)
- **`transform`** — мировой pivot (spawn + user). Для CSG: полный TRS операнда A (`resultTransform = transformA`)
- **Отрисовка** = `mesh.position = transform`, `geometry = vertices`
- **`centerGeometry` — НЕТ** (удалён)
- **`isPivotCenteredGeometry` — НЕТ** (удалён)
- **Render = data** — CI-тест `render-data-invariant.test.ts`
- **`GroupOperation.resultRotation`/`resultScale`** — история CSG с rot/scale, `rebuild.ts` восстанавливает полный TRS
- См. `web-app/ARCHITECTURE_RENDER.md`

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

### ARCHITECTURE_TRANSFORMS.md
При изменении модели трансформов (Фаза 8):
- Обновите схему `TreeNode` / `SceneObject`
- Обновите таблицу «Решаемые проблемы»
- Обновите статус этапов Фазы 8

### Прочая документация
- `ARCHITECTURE.md` — при изменении потоков данных, слоёв, ключевых решений
- `AGENTS.md` — при изменении конвенций, паттернов, ключевых файлов
- `README.md` — при изменении возможностей, стека, команд

### Чек-лист перед завершением задачи
1. [ ] `CHANGELOG.md` обновлён
2. [ ] `CODE_REVIEW.md` обновлён (если затронуты проблемы из ревью)
3. [ ] `DEVELOPMENT_PLAN.md` обновлён (если затронуты фазы/проблемы)
4. [ ] `ARCHITECTURE_TRANSFORMS.md` обновлён (если затронута Фаза 8)
5. [ ] `pnpm typecheck` — 0 ошибок
6. [ ] `pnpm test` — все тесты проходят

## Важные паттерны

### Центрирование геометрии
- **Все примитивы** центрируются в origin через `Manifold.cube(..., true)`, `Manifold.cylinder(..., true)` и т.д.
- **CSG-результаты** центрируются по **центру масс** (не BBox!) в origin
- **Worker кэширует в origin** — transform применяется **один раз** при использовании
- **`vertices` в `SceneObject` всегда в origin** — transform живёт в `SceneObject.transform`
- **`relativeToParent` в `TreeNode`** — источник истины для rebuild (Фаза 8)

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

## Известные ограничения (не баги)

- Импортированные меши (STL) не параметризуются (IMPORT-MESH-PARAMETRIC: не требуется); трансформации работают, CSG с `import_mesh` сейчас отклоняется по типу объекта — включение для замкнутых STL запланировано (IMPORT-MESH-CSG); старые extrude без `group.source` не редактируются как extrude (EXTRUDE-LEGACY: не мигрируем)
- Скругления (fillet) нет: прежний параметр куба удалён (remove-fillet) до инструмента на B-Rep; старые шаги `fillet` вырезаются при загрузке (`io/legacy-fillet.ts`) — новых не создавать

## Node.js — Настройка и проверка

Перед работой с проектом убедитесь, что Node.js настроен корректно.

- **Документация:** `web-app/NODEJS_SETUP.md` — полное руководство по настройке Node.js, pnpm, проверке typecheck и тестов
- **Фактическое состояние:** Node.js v24.11.0, pnpm 11.13.1
- **node_modules:** 203 MB (pnpm symlink-based, не коммитится)
- **Проверка:** `cd web-app && pnpm typecheck && pnpm test`

Если возникают вопросы по Node.js, зависимостям или запуску тестов — **сначала прочитайте `web-app/NODEJS_SETUP.md`**.

## Документация

- `ARCHITECTURE_TRANSFORMS.md` — единая модель трансформов (Фаза 8)
- `ARCHITECTURE_RENDER.md` — единый источник данных и отрисовки (Фаза 8.5)
- `docs/PHASE_9_5_DESIGN.md` — Фаза 9.5: дизайн правки прошлых шагов (move/mirror/extrude; fillet отменён), каскад CSG
- `docs/PHASE_9_DESIGN.md` — Фаза 9: решения (операция с результатом, вложенные CSG), риски, статус подзадач
- `CODE_REVIEW.md` — результаты код-ревью с приоритетами
- `DEVELOPMENT_PLAN.md` — план разработки (Фазы 0–7)
- `ARCHITECTURE.md` — описание архитектуры
- `CHANGELOG.md` — история изменений
- `web-app/BUILD_TREE_SPEC.md` — спецификация Build Tree
- `web-app/NODEJS_SETUP.md` — настройка Node.js, pnpm, проверка typecheck и тестов
- `ECONOMY.md` — экономика Яндекс.Игр (ветка `yandex-games`)
- `PLAN_YANDEX.md` — план интеграции Яндекс.Игр
