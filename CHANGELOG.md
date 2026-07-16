# Changelog

Все заметные изменения в этом проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование следует [SemVer](https://semver.org/lang/ru/).

---

## [Unreleased]

### Added — Раунд 6: Независимое код-ревью (2026-07-16)

- **CODE_REVIEW.md:** Добавлен Раунд 6 — независимый аудит, не основанный на выводах предыдущих раундов
  - Оценка проекта: **4.9/5** (траектория: 2.4 → 3.8 → 4.4 → 4.9)
  - Выявлены 3 критические, 6 важных, 2 перфоманс, 3 качество кода, 1 безопасность
  - План действий: 9 задач, 6 исправлены в этом коммите

### Fixed — исправления раунда 6 (2026-07-16)

- **CRIT-R6-1:** Удалён мёртвый баннер восстановления сессии и связанные `useState`/`useEffect` (`App.tsx`)
- **CRIT-R6-2:** `deleteSelected` обёрнут в try/catch с `notify()` при ошибке worker (`document-store.ts`)
- **CRIT-R6-3:** `applyFillet` использует `makeObject()` для пересчёта AABB и сохранения normals (`document-store.ts`)
- **WARN-R6-3:** `handleAddText` — модалка закрывается после успешного создания, не до (`App.tsx`)
- **WARN-R6-4:** `pasteClipboard` — `pastedIds` вынесен из try, catch очищает worker cache от частичных объектов (`document-store.ts`)
- **WARN-R6-5:** `renameObject` — guard `if (objects[id].name === name) return` для пропуска неизменённых имён (`document-store.ts`)
- **Q-R6-2:** Magic numbers вынесены в `constants.ts`: `OBJECT_SPACING`, `PASTE_OFFSET`, `AUTOSAVE_DELAY_MS`, `MOVE_DELTA_EPSILON`, `FILLET_EPSILON`, `FILLET_MIN_RADIUS`, `VERTEX_MERGE_PRECISION`
- **Q-R6-3:** `as TinkerCraftOperation` заменён на правильные типы (MoveOperation, GroupOperation, ColorOperation, HideShowOperation, RenameOperation, DeleteOperation) в `document-store.ts`
- **PERF-R6-1:** `extractAndCenterGetAABB()` — один проход O(n) вместо двух (extractAndCenter + computeAABB) для CSG-результатов (`helpers.ts`, `document-store.ts`)
- **WARN-R6-1:** `buildRebuildMeta()` теперь обрабатывает `resize_dims`, `visibility`, `rename` — ранее потеря состояния при undo/redo (`rebuild.ts`)
- **WARN-R6-2:** `moveObject` синхронизирует worker cache через `workerSyncObjects()` — устраняет stale cache (`document-store.ts`)
- **WARN-R6-6:** `handleRebuildScene` — visibility/color/rename теперь восстанавливаются корректно при undo/redo (`rebuild.ts`)
- **PERF-R6-2:** `workerCsgBooleanWithSync()` — объединённый sync+CSG в один round-trip вместо двух postMessage (`worker-client.ts`, `worker-handlers.ts`, `worker.ts`)
- **SEC-R6-1:** `detectStlFormat()` — проверка magic bytes для STL-импорта (бинарный vs ASCII) перед парсингом (`stl-import.ts`)
- **Q-R6-1:** Создан `ui-store.ts` (Zustand) — 16 useState из App.tsx вынесены в отдельный store (`store/ui-store.ts`, `App.tsx`)

### Added — Раунд 5: Итоговый аудит (2026-07-16)

- **CODE_REVIEW.md:** Добавлен Раунд 5 — полный аудит кодовой базы после закрытия раундов 1–4
  - Проверка всех 13 исправлений: 11 корректны, 2 подтверждены как «не баг», 0 регрессий
  - Оценка проекта: **4.4/5** (траектория: 2.4 → 3.8 → 4.4)
  - Выявлены 2 критичные проблемы тестирования, 3 важных замечания, 3 низких
  - План действий: 8 задач, приоритет на unit-тесты worker-логики
  - **Добавлена секция про critical bug: worker cache рассинхронизация**

### Fixed — исправления раунда 5 (2026-07-16)

- **CRIT-R5-1:** `worker-sanitize.test.ts` теперь импортирует `clamp`/`sanitizeParams` из `worker-handlers.ts` вместо тестирования локальных копий
- **CRIT-R5-2 (частично):** Добавлены unit-тесты на `rebuildOps.ts` — `applyMoveDelta`, `applyMirrorToTransform`, `applyAlignToTransform`, `makeDefaultTransform` (20 тестов)
- **WARN-R5-1:** `NumInput.tsx` — защита от `step <= 0` в `Math.log10` (добавлена проверка `step > 0`)
- **WARN-R5-3:** `rebuild-integration.test.ts` переписан — тестирует `buildRebuildMeta()` (чистая функция из `rebuild.ts`) вместо проверки структуры операций (17 тестов)
- **LOW-R5-1:** `rebuild-integration.test.ts` — убраны `as any`/`as unknown as`, используются type-safe фабрики
- **LOW-R5-2:** `constants.ts` — убран избыточный `as Record<string, boolean>`
- **LOW-R5-3:** `ViewCube.tsx` — `animateTo()` отменяет предыдущую анимацию через `cancelAnimationFrame` при повторных кликах
- **Rebuild:** Извлечена чистая функция `buildRebuildMeta()` из `rebuildFromHistory()` для тестирования без WASM-зависимости
- **IDEAS.md:** Создан банк идей — 17 инструментов TinkerCAD, 6 генераторов форм, приоритетный roadmap, технические заметки

### Fixed — CSG worker cache рассинхронизация (2026-07-16)

- **Критический баг: «Objects not found» при CSG после undo/redo:** Snapshot-кэш восстанавливал объекты в store, но не обновлял кэш воркера. Добавлен `workerSyncObjects` — перестроение кэша воркера перед CSG-операциями (`document-store.ts`, `worker-client.ts`, `worker.ts`, `worker-handlers.ts`)
- **Сбой координат при вычитании:** `moveObject` обновлял позицию только в store, но не в кэше воркера — геометрия оставалась на старых координатах. `handleSyncObjects` перестраивает примитивы с полным SRT (position + rotation + scale) вокруг центра, аналогично `handleRebuildScene`
- **Двойное применение SRT:** `hasSR`/`applySRAroundCenter` в `handleCsgBoolean` дублировал трансформации, уже применённые в `handleSyncObjects`. Удалено дублирование
- **MirrorObject также фиксирован:** `mirrorSelected` теперь вызывает `workerSyncObjects` перед зеркалением
- **worker-sync.test.ts:** Добавлены 2 unit-теста для проверки типов sync-сообщений

### Fixed — исправления раунда 4 (2026-07-16)

- **CRITICAL FIX (CSG):** Исправлена ошибка "Objects not found" при CSG-операциях
  - `worker-handlers.ts`: инлайн-реализация построения примитивов в `handleBuildShape`, `handleApplyFillet`, `handleBuildImportedMesh`
  - Убраны функции `buildPrimitive()` / `buildPrimitiveWithFillet()` — теперь каждый handler явно использует `getWasm()` и конструкторы Manifold
  - `worker.ts`: исправлен `deleteObjects` — `safePostMessage` вызывается один раз после цикла
  - `handleMirrorObject` использует `getMirrorMatrix()` (встроенная логика матриц)
  - `handleCsgBoolean` использует `applySRAroundCenter()` + `hasSR()` для корректного применения трансформов перед CSG
- **WARN-R4-3:** Унификация `centerGeometry` / `extractAndCenter` — вынесена общая логика bbox в `computeAABB` и `computeCenter`
  - `helpers.ts`: добавлены `computeAABB` и `computeCenter` (общая функция)
  - `helpers.ts`: `extractAndCenter` использует `computeCenter` вместо дублирования кода
  - `Viewport3D.tsx`: `centerGeometry` использует `computeAABB` вместо THREE.js `computeBoundingBox`
  - Удалено дублирование ~20 строк bbox-логики
- **WARN-R4-1:** Рефакторинг worker.ts — вынесение switch (800+ строк) в отдельные handlers (`worker-handlers.ts`)
  - Создан модуль `csg/worker-handlers.ts` с изолированными функциями: `handleBuildShape`, `handleApplyFillet`, `handleBuildImportedMesh`, `handleCsgBoolean`, `handleMirrorObject`
  - Утилиты: `buildPrimitive`, `buildPrimitiveWithFillet`, `applyTransform`, `extractMesh`, `safePostMessage`
  - `worker.ts` сокращён до ~100 строк (dispatch + rebuildScene)
  - Циклические зависимости решены через `await import()` в rebuildScene
  - **Результат:** cyclomatic complexity снижена с ~25 до ~5 в основных модулях
- **CRIT-R4-2:** Валидация `JSON.parse` в `parseDoodle` — проверка размера (5МБ лимит), prototype pollution (`doodle-io.ts`)
- **CRIT-R4-3:** DRY rebuild — вынесена общая логика transform в `csg/rebuildOps.ts`: `applyMoveDelta`, `applyMirrorToTransform`, `applyAlignToTransform`, `makeDefaultTransform`
  - `rebuild.ts` использует общие функции вместо дублированной логики
  - `worker.ts` использует `RebuildTransform` вместо локального `FullTransform`
  - Удалено дублирование ~60 строк логики transform
- **WARN-R4-2:** `computeVertsHash` — шаг 4 → 3 (выровнен по границам вершин 3 float/vertex)
- **WARN-R4-5:** Runtime-валидация manifold API — проверка `setup`, `Manifold`, `CrossSection` (`worker.ts`)
- **LOW-R4-3:** `URL.createObjectURL` в `try/finally` — гарантированное освобождение памяти (`doodle-io.ts`)
- **Добавлено:** 18 новых тестов для `clamp()` и `sanitizeParams()` (`worker-sanitize.test.ts`)
- **Добавлено:** 14 интеграционных тестов для operation chains (`rebuild-integration.test.ts`)
- **Добавлено:** `computeCenter()` helper для извлечения bbox center из vertex buffer
- **FIX:** Унификация языка комментариев — все русские комментарии переведены на английский (12 файлов)
- **Итого:** 65 тестов (все проходят), 0 ошибок typecheck

### Added — код-ревью раунд 4 (2026-07-16)

- Документация глубокого код-ревью (раунд 4) в `CODE_REVIEW.md`:
  - CRIT-R4-1: `scaleDelta` применяется аддитивно — ✅ ПРОВЕРЕНО, НЕ БАГ (delta = newScale - oldScale, применяется как oldScale + delta = newScale, корректно)
  - CRIT-R4-2: `JSON.parse` без валидации в `parseDoodle` — риск DoS / Prototype Pollution (`doodle-io.ts`)
  - CRIT-R4-3: Дублирование логики rebuild между `rebuild.ts` и `worker.ts` (180+ строк продублировано)
  - WARN-R4-1: Worker переусложнён — 813 строк, switch на 460+ строк, cyclomatic complexity ~25
  - WARN-R4-2: `computeVertsHash` — шаг 4 не выровнен по границам вершин (3 float/vertex), ~25% данных пропущено
  - WARN-R4-3: Дублирование логики `centerGeometry()` / `extractAndCenter()` — общий алгоритм, разные интерфейсы
  - WARN-R4-4: `FullSRT` и `FullTransform` — дублирование типов внутри `worker.ts` (не между файлами, как было указано изначально)
  - WARN-R4-5: `as unknown as ManifoldAPI` без runtime-валидации
  - WARN-R4-6: `sceneReady` race condition — ✅ ПРОВЕРЕНО, НЕ БАГ (guard `if (!scene) return` уже на строке 662)
  - WARN-R4-7: Смешение русского и английского в комментариях
  - Низкие: `requestAnimationFrame` работает непрерывно, `URL.createObjectURL` без try/finally, хрупкий multi-select код
  - Тестирование: helpers.ts покрыт (7 тестов), но worker.ts (813 строк), Viewport3D.tsx, rebuild.ts, snapshots.ts — 0 тестов
  - План действий: 11 актуальных задач (2 отозваны после перепроверки)
- Общий балл раунда 4: 3.8 / 5 (повышен с 3.3 после перепроверки)

### Added — код-ревью раунд 3 (2025-07-16)

- Документация глубокого код-ревью (раунд 3) в `CODE_REVIEW.md`:
  - CRIT-R3-1: утечка BoxHelper при удалении объектов
  - CRIT-R3-2: race condition при инициализации WASM Worker
  - CRIT-R3-3: потенциальная утечка WASM-памяти при частых rebuild
  - WARN-R3-1: дублирование логики rebuild между store и worker
  - WARN-R3-2: `sanitizeParams` непредсказуемо обрабатывает import_mesh
  - WARN-R3-3: `applySRAroundCenter` не покрыт тестами
  - WARN-R3-4: postMessage без try/catch
  - WARN-R3-5: emissive highlight в animate loop (6000 итераций/сек)
  - WARN-R3-6: нет валидации размера STL при импорте
  - WARN-R3-7: IndexedDB без версионирования
  - WARN-R3-8: STL экспорт игнорирует трансформации (position, rotation, scale) — объекты экспортируются в (0,0,0) без поворота и масштаба
  - PERF-R3-1: O(n) сравнение вершин через `cachedRaw.some()`
  - PERF-R3-2: emissive highlight в animate loop
  - PERF-R3-3: `fitView` — пересчёт bbox всех мешей
  - COSM-R3-1: `worker.ts` — 811 строк, глубокая вложенность
  - COSM-R3-2: `PropertiesPanel.tsx` — 434 строки, дублирование NumInput
  - COSM-R3-3: `Object.fromEntries` + `as` assertion в constants.ts
  - План действий: 11 задач от 15 мин до 4 часов
- Общий балл раунда 3: 4.5 / 5

### Fixed — код-ревью раунд 3 (исправления, 2025-07-16)

- **CRIT-R3-1:** Утечка BoxHelper при удалении объектов — теперь helper dispose'ится (`Viewport3D.tsx`)
- **WARN-R3-4:** postMessage обернут в safePostMessage() с try/catch — защита от DataCloneError для больших мешей (`worker.ts`)
- **WARN-R3-5 / PERF-R3-2:** Emissive highlight вынесен из animate() в useEffect — больше не 6000 итераций/сек (`Viewport3D.tsx`)
- **WARN-R3-6:** Валидация размера STL при импорте — лимиты 100МБ и 5M треугольников (`stl-import.ts`)
- **WARN-R3-7:** IndexedDB версионирование — версия bumped до 2, добавлена миграция через onupgradeneeded (`autosave.ts`)
- **WARN-R3-8:** STL экспорт теперь применяет трансформации (position, rotation, scale) к вершинам (`stl-export.ts`)
  - Добавлена функция `applyTransformToVertices()` с оптимизацией для identity transform
  - 3 новых теста: translation, scale, identity
- **CRIT-R3-2:** Race condition WASM Worker — заменён паттерн _readyResolve на handler pattern (`worker-client.ts`)
- **WARN-R3-3:** applySRAroundCenter покрыт тестами — извлечена математика матрицы в `worker-matrix.ts` (7 тестов)
- **PERF-R3-1:** Кэширование хеша вершин — замена O(n) сравнения на O(1) хеш-сравнение (`Viewport3D.tsx`)

### Added — код-ревью раунд 2 (2025-07-16)

- `store/helpers.ts` — утилиты store (extractAndCenter, computeAABB, makeObject, nextId, colorForIndex, PALETTE, ClipEntry)
- `store/types.ts` — DocumentStore interface
- `store/rebuild.ts` — rebuildFromHistory (восстановление объектов из истории операций)
- `store/snapshots.ts` — кэш snapshot'ов для мгновенного undo/redo (PERF-1)
- `components/MirrorButtons.tsx` — переиспользуемые кнопки зеркала (compact/full variants)
- `components/CsgButtons.tsx` — переиспользуемые кнопки CSG (compact/full variants)
- `components/AlignButtons.tsx` — переиспользуемые кнопки выравнивания (compact/full variants)
- `components/NumInput.tsx` — numeric input с draft-редактированием
- `components/Section.tsx` — collapsible section
- `components/Timeline.tsx` — история операций + opIcon/opLabel
- `components/Toolbar.tsx` — тулбар (файл, undo, view, gizmo, CSG, тема)
- `components/TextModal.tsx` — модалка 3D текста
- `components/StatusBar.tsx` — статус-бар
- `components/LeftPanel.tsx` — палитра фигур + список объектов + история
- `components/PropertiesPanel.tsx` — панель свойств (трансформ, resize, fillet, extrude, CSG)
- `constants.ts` — общие константы (ALL_SHAPES, SNAP_VALUES, OP_FILTER_LABELS, DEFAULT_FILTERS)
- Поле `normals: Float32Array | null` в `SceneObject` и `MeshResult` — per-vertex normals из manifold
- Поле `aabb?: { min: Vec3; max: Vec3 }` в `SceneObject` — кэшированный AABB

### Added — код-ревью раунд 1 (2025-07-15)

- Toast-уведомления: `store/notifications.ts`, `components/ToastContainer.tsx`
- 15 unit-тестов: `stl-import.test.ts`, `stl-export.test.ts`, `document-store.test.ts`
- Валидация входных данных в воркере: `clamp()`, `sanitizeParams()`
- Типобезопасные WASM-интерфейсы в `worker.ts` (`ManifoldAPI`, `ManifoldObject`, `ManifoldMesh`)

### Changed

- `App.tsx` разделён с 1809 до 553 строк (−69%) — CRIT-1
- `document-store.ts` разделён с 757 до 500 строк (−34%) — CRIT-2: утилиты, типы и rebuild вынесены в отдельные модули
- Undo/redo использует snapshot cache вместо полного WASM rebuild — PERF-1: мгновенный undo/redo после первой операции
- Дублирование Mirror/CSG/Align кнопок устранено — WARN-3: 3 переиспользуемых компонента с variant prop
- Статические инлайн-стили заменены на CSS-классы — COSM-1: utility-классы + компонентные классы в App.css
- `extractMesh()` в `worker.ts` парсит per-vertex normals из manifold-меша (WARN-6)
- `stl-export.ts` использует manifold normals с fallback на cross-product (WARN-6)
- `makeObject()` helper в `document-store.ts` — авто-вычисление и кэширование AABB (WARN-8)
- `alignSelected` и `extrudeSelected` используют кэшированный `obj.aabb` (WARN-8)
- `DEFAULT_FILTERS` вынесен в `constants.ts` с явной типизацией (COSM-3)
- `alert()` заменён на toast-уведомления во всём проекте
- `selSet` и `totalTris` обёрнуты в `useMemo` (PERF-2, PERF-3)
- Keyboard `useEffect` стабилизирован через паттерн `kbRef` (WARN-1)
- Убраны `eslint-disable` suppressions в `App.tsx` (WARN-2)

### Removed

- `csg/engine.ts` — мёртвый код, 0 импортов (WARN-5)

### Fixed — скрытые баги, обнаруженные при типизации

- `nullT` в `rebuildScene` — отсутствовали `scaleX/scaleY/scaleZ`
- Итерация кэша в `rebuildScene` — не пропускала `null` (non-manifold) записи
- `TransformNR` литералы в `types.test.ts` и `stl-import.ts` — без полей scale

---

## [0.0.1] — MVP (Фазы 0–6)

### Added

- **Фаза 0:** Vite + React + TypeScript scaffold, Zustand store, Three.js вьюпорт
- **Фаза 1:** Базовый 3D вьюпорт с орбитальной камерой, освещение, сетка
- **Фаза 2:** 7 примитивов (куб, сфера, цилиндр, конус, тор, призма, пирамида) через manifold-3d WASM Worker
- **Фаза 2:** Скругление (fillet) для кубов через `refine()` + `warp()`
- **Фаза 3:** Выделение объектов (raycaster), гизмо TransformControls, drag-перемещение
- **Фаза 3:** ViewCube с drag-вращением и snap к граням
- **Фаза 3:** Компонент-дерево сцены, панель свойств, тулбар
- **Фаза 4:** Булевы операции CSG (Union, Subtract, Intersect) с центрированием результатов
- **Фаза 4:** История операций с undo/redo, таймлайн с фильтрацией
- **Фаза 4:** Зеркало по осям, выравнивание (align) по 3 осям
- **Фаза 5:** Импорт/экспорт STL (бинарный + ASCII)
- **Фаза 5:** Формат `.doodle` (ZIP + JSON) с совместимостью с Java-оригиналом
- **Фаза 5:** Автосохранение в IndexedDB, восстановление сессии
- **Фаза 5:** Менеджер проектов (несколько проектов в IndexedDB)
- **Фаза 5:** 3D-текст через TextGeometry (opentype.js)
- **Фаза 5:** Линейка для измерения расстояний
- **Фаза 5:** Переключение перспективная ↔ ортографическая камера
- **Фаза 6:** Тёмная/светлая темы, PWA-манифест, COOP/COEP заголовки
- **Фаза 6:** ErrorBoundary, WebGLFallback
- **Фаза 6:** 20 type-level тестов (`types.test.ts`)
- **Фаза 6:** Тесты менеджера проектов (`project-manager.test.ts`)

### Known Limitations

- Скругление работает только для кубов
- Undo/redo выполняет полный rebuild (без кэша snapshots)
- `document-store.ts` — 750 строк (кандидат на разделение, CRIT-2)
- Нет импорта SVG и 3MF
- Robot Lab не реализован
