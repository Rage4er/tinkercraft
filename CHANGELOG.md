# Changelog

Все заметные изменения в этом проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование следует [SemVer](https://semver.org/lang/ru/).

---

## [Unreleased]

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
  - План действий: 9 задач от 15 мин до 4 часов
- Общий балл раунда 3: 4.5 / 5

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
