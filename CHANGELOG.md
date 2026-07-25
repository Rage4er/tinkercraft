# Changelog

### Added — Сравнительный вердикт CaDoodle vs TinkerCraft: Mirror (2026-07-25)
- Добавлена секция сравнительного вердикта в CODE_REVIEW.md: 14 критериев, таблица преимуществ, ранжирование проблем по severity
- Вердикт: CaDoodle имеет меньше дефектов в mirror (0 vs 10), но TinkerCraft решает более сложную задачу (Build Tree)
- 3 проблемы HIGH (MIRROR-3, MIRROR-5, MIRROR-8), 3 MEDIUM (MIRROR-1, MIRROR-6, MIRROR-10)
- Рекомендация: исправить HIGH в первую очередь, после чего TinkerCraft превзойдёт CaDoodle

## [Unreleased]

### Fixed — Сброс расположения фигур при трансформации объединенных фигур (BUG-CSG-POS-5/6) (2026-07-26)

Глубокий анализ выявил **три уровня проблем** в `moveObject` при трансформации CSG-результатов:

**Уровень 1 — Stale worker cache (BUG-CSG-POS, предыдущий фикс):**
`syncOperand` не синхронизировал регулярные примитивы → воркер использовал старые координаты.
Исправлено: `syncOperand` теперь синхронизирует все типы объектов.

**Уровень 2 — `moveTreeNode` рекурсирует в children (BUG-CSG-POS-5):**
`moveTreeNode` для boolean-нод рекурсировал в children (исходные операнды) и сдвигал их позиции,
а `localTransform` самой boolean-ноды **не обновлялся**. После `rebuildNode` воркер пересчитывал
центроид и применял **устаревший** `localTransform` → результат смещался.

**Уровень 3 — Двойное применение TRS (BUG-CSG-POS-6):**
`rebuildNode` (через `rebuildPrimitive`/`applyCSGMeshes`) запекает **полный TRS** в вершины через
`buildTransformMatrix`. Но `handleBuildShape` (воркер) применяет **только translation** — rotation/scale
обрабатываются через pivot в Viewport3D. Перестройка меша в `moveObject` приводила к двойному
применению rotation/scale (один раз в вершинах, второй раз через pivot).

**Решение:** `moveObject` больше **не перестраивает меш**. Вершин остаются центрированными в origin
(как при начальном создании), обновляется только `obj.transform`. Viewport3D применяет полный TRS
через pivot. Это согласуется с моделью `handleBuildShape` (translation only в меш, полный TRS в pivot).

Дополнительно:
- `syncNodeTransform` теперь всегда устанавливает `localTransform`, даже если он был `undefined`
- `applyNodeTransform` добавлен в `history-tree.ts` (используется в других операциях)

**Файлы:** `src/store/document-store.ts` (moveObject), `src/csg/history-tree.ts` (syncNodeTransform, applyNodeTransform)

### Fixed — Сброс расположения фигур при булевых операциях (BUG-CSG-POS) (2026-07-25)

Две причины сброса позиции CSG-результата исправлены в `document-store.ts` → `csgBoolean`:

1. **Неверная трансформация результата:** Результат CSG центрировался в origin, но позиция
   вычислялась как **среднее трансформаций** обоих операндов (включая rotation и scale).
   Это приводило к:
   - Неправильной позиции для subtract/intersect (среднее позиций ≠ центроид результата)
   - Двойному применению rotation/scale (они уже «запечены» в геометрию воркером)

   **Исправление:** позиция результата = центроид `(cx, cy, cz)`, rotation = 0, scale = 1
   (как уже делается в `extrudeSelected` и `rebuildFromHistory`).

2. **Stale worker cache для перемещённых примитивов:** `syncOperand` синхронизировал
   только CSG-результаты и импортированные меши. Обычные примитивы, перемещённые через
   `moveObject`, оставались в кэше воркера со **старой позицией** (т.к. `moveObject`
   использует `workerRebuildNode`, который не обновляет основной `cache` Map).
   `handleCsgBooleanSync` пропускал пересборку через `!cache.has`, и булева операция
   выполнялась с неверными координатами операндов.

   **Исправление:** `syncOperand` теперь синхронизирует ВСЕ типы объектов:
   - CSG results / imported meshes → `workerSyncMesh` (как раньше)
   - Regular primitives → `workerSyncObjects` (rebuild с актуальной трансформацией)

### Added — Глубокий анализ процесса Mirror в CaDoodle (2026-07-25)

Проведён пошаговый анализ всего процесса зеркала в референсном проекте CaDoodle (Java). Документировано 6 шагов, 8 наборов переносимых параметров.

**Ключевые особенности архитектуры CaDoodle:**
- Нет копирования объектов — хендлы хранят ссылки на оригинальные CSG
- Операция Mirror extends CaDoodleOperation — сохраняется в историю
- Предпросмотр через `op.process(ta)` — полупрозрачный меш
- Плоскость зеркала через bounding box выделения (не origin)
- Учитывается рабочая плоскость (workplane)
- Нет разделения store/worker — CSG-объекты единый источник истины
- 3D стрелки как UI хендлы (конус + цилиндр)

**Файлы:**
- [`MirrorSessionManager.java`](reference/java-source/mirror/MirrorSessionManager.java)
- [`MirrorHandle.java`](reference/java-source/mirror/MirrorHandle.java)
- [`SelectionSession.java:2370`](reference/java-source/controls/SelectionSession.java:2370)
- [`ControlSprites.java:478`](reference/java-source/controls/ControlSprites.java:478)

### Added — Глубокий анализ процесса Mirror (2026-07-25)

Проведён пошаговый анализ всего процесса зеркала в TinkerCraft — от UI до финального объекта в store. Документировано 10 шагов, 10 наборов переносимых параметров.

**Выявлены 6 новых проблем:**
- MIRROR-5: Потеря параметричности boolean → baked при mirror
- MIRROR-6: Fallback-ноды не удаляются после mirror
- MIRROR-7: Трансформ boolean ноды из первого child (некорректный)
- MIRROR-8: Scale не инвертируется при mirror
- MIRROR-9: Двойная синхронизация для import_mesh
- MIRROR-10: Нет проверки успешности sync перед mirror

**Файлы:**
- [`document-store.ts:536-654`](web-app/src/store/document-store.ts:536) — `mirrorSelected`
- [`history-tree.ts:566-623`](web-app/src/csg/history-tree.ts:566) — `mirrorTreeNode` / `mirrorNodeRecursive`
- [`history-tree.ts:747-808`](web-app/src/csg/history-tree.ts:747) — `cloneSubtree`
- [`history-tree.ts:320-360`](web-app/src/csg/history-tree.ts:320) — `rebuildNode`
- [`helpers.ts:77-79`](web-app/src/store/helpers.ts:77) — `makeObject`

### Added — Верификация раунда 16 (2026-07-25)

Проведена верификация всех 18 утверждений код-ревью раунда 16. Точность ~50% — 8 полностью верных из 18.

**Результаты:**
- ✅ Полностью верно: 8 (CRIT-R16-3, CRIT-R16-4, PERF-R16-4, CODE-R16-1/2/3/4, SEC-R16-1, SEC-R16-3, TEST-R16-3)
- ⚠️ Частично верно / преувеличено: 7 (CRIT-R16-1, CRIT-R16-2, PERF-R16-2, PERF-R16-3, SEC-R16-2, TEST-R16-1, TEST-R16-2)
- ❌ Неверно: 1 (PERF-R16-1)

**Ключевые ошибки ревьюера:**
- PERF-R16-1 — фактическая ошибка: функция не вызывает `computeAABB`, два прохода неизбежны
- PERF-R16-2 — `Array.from` только в одной из двух указанных функций
- PERF-R16-3 — 32 из 33 вызовов уже используют селекторы Zustand
- SEC-R16-2 — `document-store.ts` не содержит пустых `catch`
- TEST-R16-2 — `rebuild-integration.test.ts` уже исправлен, `as any` почти нет
- Четыре «критические» проблемы в реальности имеют средний/низкий приоритет

**Файл:** [`CODE_REVIEW.md`](CODE_REVIEW.md#-верификация-раунда-16-2026-07-25)

### Added — Анализ механики Mirror: сравнение с CaDoodle (2026-07-25)

Проведён анализ реализации зеркала (Mirror) в референсном проекте CaDoodle (Java) и сравнение с текущей реализацией в TinkerCraft.

**Архитектура CaDoodle:**
- [`MirrorSessionManager`](reference/java-source/mirror/MirrorSessionManager.java) — оркестратор трёх `MirrorHandle` (X/Y/Z)
- [`MirrorHandle`](reference/java-source/mirror/MirrorHandle.java) — 3D UI-хендл (двойная стрелка) на углу bounding box'а выделения
- Операция `Mirror` создаётся через `new Mirror().setNames(selected).setLocation(ax)` и добавляется в историю через `ap.addOp(op)`
- Предпросмотр: `op.process(ta)` возвращает CSG-результат, рендерится полупрозрачным при наведении

**Ключевые различия:**
- Плоскость зеркала: CaDoodle — через центр BBox выделения, TinkerCraft — через origin (0,0,0)
- UI: CaDoodle — 3D хендлы на BBox, TinkerCraft — выпадающий список
- Предпросмотр: CaDoodle — полупрозрачный меш, TinkerCraft — отсутствует
- Baked nodes с вращением: CaDoodle — `CSG.transform()` (корректно), TinkerCraft — только позиция (потенциальный баг)

**Рекомендации:**
- Рассмотреть зеркало относительно центра выделения (как в CaDoodle)
- Добавить предпросмотр результата
- Исправить mirror для baked nodes с ненулевым вращением
- Рассмотреть 3D-хендлы для выбора плоскости

**Файлы:**
- [`reference/java-source/mirror/MirrorSessionManager.java`](reference/java-source/mirror/MirrorSessionManager.java)
- [`reference/java-source/mirror/MirrorHandle.java`](reference/java-source/mirror/MirrorHandle.java)
- [`web-app/src/store/document-store.ts:530`](web-app/src/store/document-store.ts:530) — `mirrorSelected`
- [`web-app/src/csg/history-tree.ts:566`](web-app/src/csg/history-tree.ts:566) — `mirrorTreeNode`

### Added — Код-ревью раунд 16: Глубокий аудит (2026-07-25)

Полное код-ревью проекта после внедрения Build Tree. Проверены все ключевые модули: store, csg, components, io. Выявлено 20+ проблем.

**Критические:**
- Утечка WASM-памяти в [`handleRebuildScene`](web-app/src/csg/worker-handlers.ts:756) при ошибках — нет `try/finally` для освобождения `ManifoldObject`
- Мутация `vertices` в [`extractAndCenter`](web-app/src/store/helpers.ts:29) — неожиданный побочный эффект для вызывающего кода
- `any` в [`collectSubtreeForWorker`](web-app/src/csg/history-tree.ts:366) и [`applyCSGMeshes`](web-app/src/csg/history-tree.ts:426) — нарушение strict типизации
- [`JSON.stringify`](web-app/src/csg/history-tree.ts:254) в `computeNodeHash` — проблема производительности на больших деревьях

**Производительность:**
- Двойной проход по вершинам в [`extractAndCenterGetAABB`](web-app/src/store/helpers.ts:44)
- [`Array.from()`](web-app/src/csg/history-tree.ts:446) в hot path (`collectSubtreeForWorker`, `applyCSGMeshes`)
- Избыточные ререндеры через Zustand (деструктуризация всего store)
- [`computeVertsHash`](web-app/src/components/Viewport3D.tsx:68) — возможны коллизии

**Читаемость:**
- Дублирование матричной математики между [`rebuild.ts`](web-app/src/store/rebuild.ts:154) и [`worker-matrix.ts`](web-app/src/csg/worker-matrix.ts:15)
- Магические числа в [`Viewport3D.tsx`](web-app/src/components/Viewport3D.tsx:97)
- Смешение русского и английского в комментариях
- [`GizmoMode`](web-app/src/store/ui-store.ts:11) с `null` как значение

**Безопасность:**
- Отсутствие валидации входящих данных в worker
- `try/catch` с пустым `catch` в некоторых местах
- [`setCached`](web-app/src/csg/worker-handlers.ts:108) без проверки на disposed объекты

**Тестирование:**
- Нет тестов для `handleCsgBooleanSync`, `rebuildFromHistory`, `handleRebuildScene`
- Тесты используют `as any` для обхода типов
- Нет тестов для [`snap-utils.ts`](web-app/src/components/snap-utils.ts)

### Fixed — CSG позиционирование (BUG-CSG-POS-5) (2026-07-24)
- Исправлена проблема с разлетающимися фигурами после булевых операций (union/subtract/intersect)
- Правильное применение transform к результатам CSG операций в дереве
- Исправлено центрирование и позиционирование CSG результатов
- Исправлена проблема разлёта координат после булевых операций
- При rebuild boolean node mesh центрируется (как `extractAndCenter`)
- Применяется `localTransform` boolean node для правильного позиционирования
- Файлы:
  - `web-app/src/csg/worker-handlers.ts` — [`handleRebuildTreeNode()`](web-app/src/csg/worker-handlers.ts:676)
  - `web-app/src/csg/history-tree.ts` — [`applyCSGMeshes()`](web-app/src/csg/history-tree.ts:418)


Все заметные изменения в этом проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование следует [SemVer](https://semver.org/lang/ru/).

---

## [Unreleased]

### Fixed — WASM initialization error (2026-07-23)

- **FIXED:** rebuildNode теперь безопасна для вызова из главного потока — проверяет инициализацию WASM через `isWasmReady()`
- **FIXED:** При неинициализированном WASM rebuildNode автоматически вызывает воркер через `workerRebuildNode`
- **FIXED:** Добавлен `ms` свойство в `ExtractedMesh` интерфейс
- **FIXED:** Исправлен `collectSubtreeForWorker` — корректное преобразование TreeNode в формат воркера
- **FIXED:** Исправлен `Array.from(node.normals || [])` для избежания ошибки с null/undefined

### Added — BuildTree: Параметрическое дерево построения (2026-07-23)

- **BUILD_TREE_SPEC.md:** Полная переработка подхода к зеркалу и всем операциям над сложными объектами (`web-app/src/csg/BUILD_TREE_SPEC.md`)
  - **Новая архитектура:** Параметрическое дерево построения (TreeNode) вместо плоского списка объектов
  - **Три типа нод:** `primitive` (листья: cube, sphere, cylinder, ...) и `boolean` (узлы: union, subtract, intersect) и `baked` (STL, non-manifold)
  - **Baked-ноды:** STL-файлы теперь могут участвовать в дереве — `boolean(куб, STL)` валидная нода
  - **Lazy rebuild:** Меш пересобирается по запросу с кэшированием по хешу
  - **Worker rebuild:** `handleRebuildTreeNode` в worker.ts — rebuild из дерева в WASM, `workerRebuildNode` в client
  - **Каскадная инвалидация O(depth):** `parentId` обратные ссылки, `invalidateCache` рекурсия по parentId, 1000 нод → 10 операций вместо 10000
  - **isAncestor защита:** `createBooleanNode` проверяет циклы при создании — `isAncestor(childA, id)` + self-ref guard
  - **visited Set в cloneSubtree:** защита от циклов при рекурсивном клонировании, shared children не дублируются
  - **deleteNode сбрасывает parentId:** дети удаляемой ноды теряют связь с родителем
  - **Мемоизация BBox:** `cachedBBox` в TreeNode, инвалидируется вместе с `cachedMesh`, избегает O(n) прохода по вершинам
  - **Единый API:** `mirrorTreeNode`, `moveTreeNode`, `rotateTreeNode`, `cloneSubtree` — все операции через дерево
  - **Синхронизация:** Store хранит меш для рендеринга, дерево — источник параметричности
  - **Глубокое копирование TypedArray:** `cloneSubtree` делает `new Float32Array()` для избежания shared buffers
  - **Transform-ноды:** Отложены на future (групповые операции, иерархическая анимация)
- **history-tree.ts:** Ядро дерева (хранение, rebuild, mirror, move, rotate, clone, BBox, hash, cascade invalidation)
- **types.ts:** `TreeNode`, `Point3D`, `BoundingBox`, `ExtractedMesh` с полной типизацией
- **document-store.ts:** Интеграция дерева — `addShape` регистрирует primitive, `csgBoolean` создаёт boolean-ноду + `rebuildNode`, `mirrorSelected` клонирует + зеркалит поддерево с fallback-регистрацией, `moveObject` двигает всё поддерево, `deleteSelected` удаляет из дерева, `clearScene` очищает дерево
- **worker-handlers.ts:** `handleRebuildTreeNode` — rebuild subtree из дерева в WASM
- **worker-client.ts:** `workerRebuildNode` — вызов rebuild из дерева
- **worker.ts:** Кейс `rebuildTreeNode` в обработчике сообщений
- **rebuild.ts:** `rebuildBuildTree` и `registerBakedNodes` — sync дерева при undo/redo
- **history-tree.test.ts:** 29 unit-тестов — createPrimitiveNode, createBooleanNode (включая self-ref и cycle guards), createBakedNode, deleteNode, computeNodeBBox (с memoization), isAncestor, mirrorTreeNode, moveTreeNode, cloneSubtree (с deep copy TypedArrays), cascade invalidation, rebuildNode
- **types.ts:** `treeOperation` в GroupOperation — тип булевой операции для tree reconstruction при undo/redo
- **snapshots.ts:** `cacheTreeSnapshot`, `getCachedTreeSnapshot` — кэширование дерева alongside objects; `serializeTree` — сериализация в plain objects (без cachedMesh/BBox/hash)
- **document-store.ts:** `cacheSnapshotWithTree` — wrapper, заменяющий все cacheSnapshot; `restoreTreeFromSnapshot` — восстановление дерева при undo/redo/jumpToHistory
- **rebuild.ts:** `rebuildBuildTree` использует `treeOperation` из GroupOperation
- **FIXED:** `cacheSnapshotWithTree` — исправлена рекурсия (само-вызов на line 84 заменён на `cacheSnapshot`)
- **FIXED:** Order of tree registration — `createPrimitiveNode`/`createBooleanNode`/`createBakedNode` теперь вызываются ДО `cacheSnapshotWithTree` в `addShape`, `addRawMesh`, `importStl`, `csgBoolean`. Раньше boolean/primtive/baked узлы не попадали в снапшот, из-за чего undo/redo терял их, и следующая CSG операция падала с `Node csg_N not found`
- **FIXED:** `csgBoolean` — добавлена функция `ensureInTree`, которая гарантирует, что `idA` и `idB` зарегистрированы в `treeNodes` ДО вызова `createBooleanNode`. Это предотвращает ошибку "Node not found" в воркере, когда children boolean ноды отсутствуют в дереве
- **FIXED:** `applyCSGMeshes` — `collectSubtree(node.id)` вместо `collectSubtree(node.children[0])` + `collectSubtree(node.children[1])`, чтобы целевая boolean нода включалась в поддерево, отправляемое в воркер
- **Планируемые файлы:**
  - `history-tree.ts` — ядро дерева (хранение, rebuild, mirror, move, rotate, clone)
  - `types.ts` — `TreeNode`, `Point3D`, `BoundingBox`, `ExtractedMesh`
  - `worker-handlers.ts` — `handleApplyCsg` для CSG между двумя мешами
  - `worker-client.ts` — `workerRebuildNode` для пересборки из дерева
  - `document-store.ts` — интеграция: `createPrimitiveNode`, `createBooleanNode`, `mirrorTreeNode`, `moveTreeNode`
- **5 фаз внедрения:** A (базовая структура) → B (rebuild+CSG) → C (интеграция store) → D (mirror+transform) → E (undo/redo+polish)
- **7 тест-кейсов:** union, зеркало CSG, двойное зеркало, move CSG, каскадная инвалидация, параметрическое редактирование, undo/redo
- **Заменяет:** MIRROR_FIX_SPEC.md (гибридный подход зеркала) — архитектура дерева решает проблему зеркала как частный случай

### Fixed — Mirror operation (2026-07-22)

- **Комплексное исправление отзеркаливания с разделением логики для примитивов и CSG/импорта:**
  - **Для примитивов:** Worker строит свежий примитив без TRS, применяет чистую матрицу зеркала, store использует applyMirrorToTransform для инвертирования позиции и соответствующих углов поворота (rotX для YZ, rotY для XZ, rotZ для XY)
  - **Для CSG/импорта:** Worker сдвигает геометрию к origin, применяет матрицу зеркала, store сбрасывает scale/rotation до нейтральных значений, оставляя только зеркальную позицию
  - **Исключение двойного применения трансформов:** Полная отделение геометрии от трансформов объекта - геометрия содержит только зеркальную форму, трансформы содержат только позицию, масштаб и поворот
  - **Корректная обработка углов поворота:** Исправлена математика зеркального отражения углов - для каждой плоскости инвертируется соответствующий угол поворота
  - **Сохранение масштаба без дублирования:** Масштаб применяется только один раз через трансформы объекта, не затрагивается в геометрии
  - **Создание независимых копий:** `mirrorSelected` создает копии с уникальными ID, исходные объекты полностью сохраняются
  - **Поддержка move/resize для всех типов объектов:** Для примитивов используется workerSyncObjects, для CSG/импорта - workerSyncMesh, обе операции корректно работают с новой логикой

### Changed — Переименование документации (2026-07-22)

- **MIGRATION_PLAN.md → DEVELOPMENT_PLAN.md** — файл переименован: проект не является миграцией CaDoodle, а вдохновлён им как референс
- **README.md** — описание обновлено: TinkerCraft — независимый 3D CAD-редактор, вдохновлённый CaDoodle (не "веб-версия CaDoodle")
- **AGENTS.md** — описание проекта обновлено, ссылки на MIGRATION_PLAN.md заменены на DEVELOPMENT_PLAN.md
- **ARCHITECTURE.md** — упоминание "совместим с Java-оригиналом" заменено на "вдохновлён CaDoodle"
- **CHANGELOG.md** — упоминание "совместимость с Java-оригиналом" заменено на "вдохновлён CaDoodle"
- **CODE_REVIEW.md** — ссылки на MIGRATION_PLAN.md заменены на DEVELOPMENT_PLAN.md
- **package.json** — описание обновлено

### Fixed — Ruler: snap preview visualization (2026-07-22)

- **Snap preview visualization:** Точки привязки теперь отображаются при движении мыши в режиме линейки, а не только после клика
  - Заменены `snapPreviewPointRef` и `snapPreviewTypeRef` на `useState` для обеспечения перерисовки компонента
  - `handlePointerMove` теперь обновляет состояние привязки, вызывая визуализацию индикатора
  - Добавлен визуальный индикатор с правильной цветовой схемой: vertex=красный, edge=зелёный, circle=синий, face=жёлтый
  - Сохранена существующая логика поиска привязки `findNearestSnap` и создания индикаторов `createSnapIndicator`

### Fixed — Mirror: масштаб теряется при undo/redo (2026-07-22)

- **CRIT-MIRROR-SCALE:** При зеркальном отражении отмасштабированных фигур масштаб терялся при undo/redo (rebuild из истории)
  - `MirrorOperation` не хранил ссылку на оригинальный объект — `buildRebuildMeta` искал трансформ по `op.ids` (новые ID), которых не было в `transforms`
  - Исправлено: добавлено поле `originalIds: string[]` в `MirrorOperation` — хранит ID объектов ДО зеркалирования
  - `buildRebuildMeta` теперь ищет трансформ по `originalIds` и применяет зеркало к нему, создавая новый объект
  - `handleRebuildScene` в worker-handlers.ts обновлён аналогично
  - `mirrorSelected` в document-store.ts собирает массивы `originalIds` и `newIds`
  - Добавлен тест multi-select mirror (2 объекта одновременно)

### Fixed — Ruler: click-click measurement (2026-07-22)

- **Ruler click-click:** Линейка теперь работает по двум кликам (click-click), а не требует удержания кнопки
  - Вся логика измерения перенесена в `handlePointerDown` (`Viewport3D.tsx`)
  - Первый `pointerDown` — сохраняет начальную точку, рисует маркер
  - Второй `pointerDown` — сохраняет конечную точку, рисует линию, вызывает `onRulerMeasure`, сбрасывает состояние
  - `handlePointerUp` в ruler mode больше не обрабатывает точки — только `stopPropagation` для OrbitControls
  - `handlePointerMove` по-прежнему полностью игнорируется в ruler mode

### Added — Ruler: snap to geometry (2026-07-22)

- **Ruler snap:** Точки линейки привязываются к геометрии фигур при клике
  - Добавлен модуль `src/components/snap-utils.ts` с утилитами snap
  - Поддерживаемые типы привязок:
    - **Точка (vertex)** — вершина/угол фигуры (красный маркер)
    - **Ребро (edge)** — ближайшая точка на ребре (зелёный маркер)
    - **Грань (face)** — центр bounding box фигуры (жёлтый маркер)
    - **Центр (circle)** — центр окружности для сфер, цилиндров, торов (синий маркер)
  - Приоритет привязок: vertex > edge > circle > face
  - `Viewport3D.tsx`: `handlePointerDown` в ruler mode сначала ищет snap, fallback — проекция на Z=0
  - `Viewport3D.tsx`: `handlePointerMove` в ruler mode обновляет превью snap-индикатора при наведении
  - `Viewport3D.tsx`: `snapIndicatorRef` — визуальная сфера-индикатор привязки
  - `Viewport3D.tsx`: `useEffect` для создания/удаления snap-индикатора в сцене
  - `findNearestSnap()` — raycast → поиск вершин/рёбер/граней/центров → выбор лучшего кандидата
  - `collectWorldVertices()` / `collectWorldEdges()` — сбор геометрии в мировом пространстве
  - `closestPointOnSegment()` — ближайшая точка на отрезке (для edge snap)
  - Визуальные маркеры: цветные сферы с `userData.isSnapIndicator`, авто-удаление при cleanup
  - Константы радиусов привязки: `SNAP_VERTEX_RADIUS=2.0`, `SNAP_EDGE_RADIUS=2.0`, `SNAP_FACE_RADIUS=2.0`, `SNAP_CIRCLE_RADIUS=3.0`
  - `snapLabel()` — текстовая метка типа привязки на русском языке

### Fixed — UX: сворачиваемые фильтры, скрытие extrude/mirror (2026-07-21)

- **UX-2:** Фильтры истории занимали много места на панели — свёрнуты в dropdown
  - Чекбоксы фильтров заменены на кнопку "▼ Фильтр" с выпадающей панелью
  - Добавлен CSS для `.tl-filter-dropdown`, `.tl-filter-toggle`, `.tl-filter-panel` (`App.css`)
  - Добавлен state `filtersOpen` в LeftPanel (`LeftPanel.tsx`)
- **UX-3:** Extrude (выдавливание) в панели свойств — неясный UX, перенесено на панель инструментов
  - Убраны props: `canExtrude`, `extrudeAxis`, `extrudeDepth`, `onSetExtrudeAxis`, `onSetExtrudeDepth`, `onExtrude`
  - Секция Extrude удалена из PropertiesPanel (`PropertiesPanel.tsx`)
- **UX-4:** Mirror (зеркало) в панели свойств — дублирует панель инструментов
  - Убраны props: `canMirror`, `onMirror`
  - Секция Mirror удалена из PropertiesPanel (`PropertiesPanel.tsx`)
  - Удалён unused import `MirrorButtons` (`PropertiesPanel.tsx`)
- **UX-5:** Линейка — drag detection (4px) мешал второму клику для измерения
  - `handlePointerMove` теперь игнорирует движение мыши в ruler mode
  - `handlePointerUp` в ruler mode обрабатывает все клики независимо от drag flag
  - Рuler работает click-click (две точки), а не drag-измерение (`Viewport3D.tsx`)
  - `e.stopPropagation()` предотвращает обработку событий OrbitControls в ruler mode
- **UX-6:** Гизмо вращался с фигурой — теперь всегда ориентирован по осям вида
  - `tc.setSpace("world")` — гизмо всегда ориентирован по осям вида, не вращается с фигурой
  - Убран `change` event handler, который сбрасывал rotation pivot'а и ломал вращение

### Fixed — Зеркалирование сбрасывает вращение (2026-07-21)

- **CRIT-MIRROR-1:** При зеркальном отражении фигуры угол поворота сбрасывался визуально
  - `mirrorSelected` и `applyMirrorToTransform` инвертировали только позицию, но не вращение
  - При отражении по плоскости вращение вокруг перпендикулярной оси должно инвертироваться (зеркало меняет handedness)
  - `applyMirrorToTransform` теперь инвертирует `rotX` при YZ, `rotY` при XZ, `rotZ` при XY (`rebuildOps.ts`)
  - `mirrorSelected` в document-store также инвертирует вращение (`document-store.ts`)
  - Тест обновлён: `does not affect rotation or scale` → `mirrors rotation on the axis perpendicular to the plane` (`rebuildOps.test.ts`)
- **CRIT-MIRROR-2:** Pivot в Three.js применял вращение к geometry, которая была зеркалена с учётом старого вращения
  - `handleMirrorObject` зеркалит geometry, которая уже имеет transform (включая вращение) из кэша
  - Pivot в Three.js применяет инвертированное вращение к geometry, которая была зеркалена с учётом старого вращения — рассинхрон
  - `mirrorSelected` теперь sync'ит mesh С вращением (не БЕЗ вращения) перед зеркалением
  - Worker зеркалит geometry относительно origin с учётом вращения, pivot применяет вращение к geometry, которая была mirror — корректно (`document-store.ts`)

### Fixed — Resize CSG результата заменяется кубиком (2026-07-21)

- **CRIT-RESIZE-1:** В свойствах объединённой фигуры есть размеры, при их изменении фигура заменяется кубиком этих размеров
  - `resizeObject` rebuildит primitive из `shapeType/params`, но CSG результаты имеют `shapeType='cube' && !params.width`
  - Rebuild создаёт default cube вместо масштабирования CSG-геометрии
  - Для CSG результатов теперь используется сброс scale до 1 и задание размеров бондибокса в мм (`document-store.ts`)
  - В свойствах объединённой фигуры отображается реальный размер бондибокса в мм (`PropertiesPanel.tsx`)
  - `originalBboxSize` сохраняется в SceneObject и GroupOperation, используется для отображения размеров (`types.ts`)
  - `csgBoolean` сохраняет `originalBboxSize` при создании CSG результата (`document-store.ts`)
  - `rebuildFromHistory` восстанавливает `originalBboxSize` из GroupOperation (`rebuild.ts`)
  - `buildRebuildMeta` извлекает `originalBboxSize` из GroupOperation (`rebuild.ts`)
- **CRIT-MIRROR-2:** Pivot в Three.js применял вращение к geometry, которая была зеркалена с учётом старого вращения
  - `handleMirrorObject` зеркалит geometry, которая уже имеет transform (включая вращение) из кэша
  - Pivot в Three.js применяет инвертированное вращение к geometry, которая была зеркалена с учётом старого вращения — рассинхрон
  - `mirrorSelected` теперь sync'ит mesh БЕЗ вращения (только позицию) перед зеркалением
  - Pivot применяет инвертированное вращение к geometry, которая была зеркалена без вращения — корректно (`document-store.ts`)

### Fixed — Resize CSG результата заменяется кубиком (2026-07-21)

- **CRIT-RESIZE-1:** В свойствах объединённой фигуры есть размеры, при их изменении фигура заменяется кубиком этих размеров
  - `resizeObject` rebuildит primitive из `shapeType/params`, но CSG результаты имеют `shapeType='cube' && !params.width`
  - Rebuild создаёт default cube вместо масштабирования CSG-геометрии
  - Для CSG результатов теперь используется scale-трансформация вместо rebuild'а (`document-store.ts`)
  - Вычисляется bbox CSG-результата, scale = targetSize / currentSize
  - Transform обновляется с новым scale, worker sync'ится через `workerSyncMesh` с новым scale

### Fixed — История цвета: только финальный выбор (2026-07-21)

- **UX-1:** При выборе цвета фигуры в историю записывались все промежуточные движения мыши по палитре
  - input type="color" вызывал onChange при каждом движении мыши, каждый раз добавляя операцию color в историю
  - Пользователь не мог отменить "микродвижения" мышью по палитре
  - Добавлен draft color state в PropertiesPanel — промежуточные изменения хранятся локально
  - Реальный цвет сохраняется в историю только при onBlur (закрытие палитры) или при смене выбранного объекта
  - Добавлен optional параметр `skipHistory` в `setColor` — позволяет обновить цвет визуально без записи в историю
  - Color swatch показывает draft цвет для визуальной обратной связи (`PropertiesPanel.tsx`)

### Fixed — CSG координаты и цепочка операций (2026-07-21)

- **CRIT-CSG-1:** CSG-результат появлялся в (0,0,0) при прямой операции (без вращения/масштаба operand'ов)
  - `buildSRTMatrixAroundCenter` создавал identity-матрицу когда RS = identity (формула `tx = pos - RS·pos = 0`)
  - `handleCsgBooleanSync` и `handleSyncObjects` использовали эту матрицу для примитивов, центрированных в (0,0,0)
  - Результат: operand'ы не смещались в позицию, boolean выполнялся в (0,0,0), результат в (0,0,0)
  - Rebuild из истории работал корректно (`applyTransform` применял translate отдельно) — рассинхронизация
  - Добавлена `buildTransformMatrix()` — создаёт матрицу `[RS, 0; pos, 1]` (RS вокруг origin, затем translate)
  - `handleCsgBooleanSync` и `handleSyncObjects` теперь используют `buildTransformMatrix` (`worker-handlers.ts`)
  - `buildSRTMatrixAroundCenter` оставлен для `applySRAroundCenter` в `handleRebuildScene` (там геометрия уже смещена)
  - Добавлены unit-тесты для `buildTransformMatrix` (`worker-matrix.test.ts`, +5 тестов)
- **CRIT-CSG-2:** CSG-результат превращался в default cube при повторных CSG-операциях и при undo/redo
  - Результат CSG хранился как `shapeType: 'cube', params: {}` — при rebuild воркер создавал default cube
  - При цепочке CSG (A+B=C, затем C+D=E) operand C rebuildился как default cube вместо сложной CSG-геометрии
  - Добавлены `resultVertices`, `resultIndices`, `resultNormals` в `GroupOperation` (`types.ts`)
  - Добавлен `syncMesh` handler в воркер — кэширует произвольный mesh из vertices/indices (`worker-handlers.ts`)
  - `document-store.csgBoolean` теперь sync'ит operandы через `workerSyncMesh` + **transform** перед CSG (`document-store.ts`)
  - `handleSyncMesh` применяет полный TRS (buildSRAroundCenter) к sync'нутому mesh (`worker-handlers.ts`)
  - `handleCsgBooleanSync` пропускает sync для operandов уже в кэше (CSG results, imported meshes) (`worker-handlers.ts`)
  - `handleRebuildScene` применяет transform к resultVertices mesh'ам (`worker-handlers.ts`)
  - `rebuildFromHistory` применяет accumulated TRS к stored mesh для CSG-результатов (`rebuild.ts`)
  - **resultCenter:** `buildRebuildMeta` сбрасывал transform CSG results на {0,0,0}, теряя позицию центра. Добавлено поле `resultCenter` в GroupOperation, buildRebuildMeta использует его как начальную позицию (`types.ts`, `rebuild.ts`)
  - `handleRebuildScene` использует resultCenter как начальную позицию currentTransforms (`worker-handlers.ts`)
  - `extrudeSelected` также сохраняет resultVertices/resultIndices/resultCenter (`document-store.ts`)
- **CRIT-CSG-3:** CSG-результат терял геометрию при move/mirror/align после CSG-операции
  - `moveObject`, `mirrorSelected`, `alignSelected` sync'или worker кэш через `workerSyncObjects`/`workerBuildShape`, которые rebuildят primitive из `shapeType/params`
  - Для CSG-результата (`shapeType='cube'`, `params={}`) это создавало default cube вместо реального mesh
  - При цепочке CSG → move → CSG результат был неправильный
  - `moveObject` теперь использует `workerSyncMesh` для CSG results и imported_mesh (`document-store.ts`)
  - `mirrorSelected` теперь использует `workerSyncMesh` для CSG results и imported_mesh (`document-store.ts`)
  - `alignSelected` теперь использует `workerSyncMesh` для CSG results и imported_mesh (`document-store.ts`)

### Fixed — Раунд 8: Критические исправления (Фаза A) (2026-07-16)

- **CRIT-R8-1:** Утечка WASM-памяти — ManifoldObject теперь освобождается через `delete()` при удалении из кэша воркера
  - Добавлены `delete()` методы в интерфейсы `ManifoldObject` и `CrossSection` (`worker-handlers.ts`)
  - Созданы helper-функции `setCached()`, `disposeCached()`, `disposeAllCached()` для безопасной замены/удаления (`worker-handlers.ts`)
  - Все `cache.set/delete/clear` в handler-функциях заменены на безопасные аналоги (`worker-handlers.ts`, `worker.ts`)
  - Промежуточные объекты (cube→refine→warp, CrossSection в torus) освобождаются после использования
  - `applyTransform()` и `applySRAroundCenter()` освобождают исходный объект после трансформации
- **CRIT-R8-2:** Race condition — добавлен `busy` guard во все async actions (`document-store.ts`)
  - 18 async actions теперь проверяют `get().busy` перед началом и возвращают early, если воркер занят
  - Защищает от потери данных при быстрых повторных вызовах (горячие клавиши, double-click)
- **CRIT-R8-3:** Prototype Pollution — ложные срабатывания исправлены (`doodle-io.ts`)
  - Подстроковая проверка `json.includes('constructor')` заменена на рекурсивную валидацию ключей `validateObjectKeys()` после `JSON.parse`
  - Легитимные имена объектов (например, `my_constructor_block`) больше не блокируются
  - Функция проверяет ключи объектов рекурсивно, включая массивы
- **WARN-R8-2:** Stale closure в animation loop — добавлен `fpsUpdateRef` (`Viewport3D.tsx`)
  - `onFpsUpdate` стабилизируется через ref-паттерн, аналогично другим callback props
- **WARN-R8-4:** Удалён мёртвый код (`Viewport3D.tsx`)
  - Удалены неиспользуемые: интерфейс `DragRect`, state `dragRect`, ref `currentMeshRef`

### Fixed — Раунд 8: Безопасность, производительность, баги, доступность (2026-07-16)

- **SEC-R8-1:** Добавлен лимит размера .doodle файла 50 МБ для защиты от ZIP bomb (`doodle-io.ts`)
- **SEC-R8-2:** Задержка 1 секунда перед `URL.revokeObjectURL` для гарантии завершения скачивания (`stl-export.ts`)
- **PERF-R8-1:** Clipboard хранит `Float32Array`/`Uint32Array` вместо `number[]` — экономия памяти в 8× (`helpers.ts`, `document-store.ts`)
- **PERF-R8-2:** Добавлен таймаут 30 секунд для worker-запросов для предотвращения бесконечного ожидания (`worker-client.ts`)
- **PERF-R8-3:** Добавлена функция `disposeWorker()` для корректной очистки при HMR (`worker-client.ts`)
- **PERF-R8-4:** Вычисление `visible` в Timeline обёрнуто в `useMemo` для оптимизации рендеров (`Timeline.tsx`)
- **WARN-R8-7:** Добавлена валидация схемы операций при загрузке .doodle — проверка типа каждой операции (`doodle-io.ts`)
- **BUG-R8-1:** `importStl` теперь передаёт `normals` в `makeObject` для корректного рендеринга (`document-store.ts`)
- **BUG-R8-2:** `saveToProject` теперь сбрасывает `modified` flag после успешного сохранения (`document-store.ts`)
- **BUG-R8-3:** `moveObject` теперь делает early return если все delta ниже epsilon — не засоряет историю (`document-store.ts`)
- **A11Y-1:** `Section.tsx` — добавлены `role="button"`, `tabIndex={0}`, `aria-expanded`, keyboard support (Enter/Space)
- **A11Y-2:** `TextModal.tsx` — добавлены `role="dialog"`, `aria-modal="true"`, `aria-labelledby`
- **A11Y-3:** `Toolbar.tsx` — добавлены `role="toolbar"`, `aria-label="Панель инструментов"`
- **A11Y-4:** `StatusBar.tsx` — добавлены `role="status"`, `aria-live="polite"`
- **A11Y-5:** `NumInput.tsx` — `<span>` заменён на `<label htmlFor>` для правильной связи label-input

### Changed — Раунд 8: DRY рефакторинг (2026-07-16)

- `handleBuildShape` и `handleApplyFillet` используют `buildPrimitive()` / `buildPrimitiveWithFillet()` вместо дублирующих switch (WARN-R8-3, частично)

### Added — Раунд 8: Верификация код-ревью (2026-07-16)

- **CODE_REVIEW_ROUND8.md:** Верификация каждого утверждения Раунда 8 против исходного кода
  - Общая точность: **~93%** (41 точно, 2 частично, 1 ошибочно из 44 утверждений) — значительно выше Раунда 4 (78%)
  - **1 ошибочное утверждение** исправлено:
    - ERR-1: «35 тестов» → реально 104 (в 10 файлах, занижение в 3×)
    - ERR-1b: «~51 файл, ~6700 строк» → реально 50 файлов, 8106 строк
  - **2 частично точных** уточнены:
    - CRIT-R8-3: `json.includes('prototype')` — грубая проверка, но аргумент про `_proto_` невалиден (includes ловит подстроки)
    - BUG-R8-3: epsilon-проверка есть, но early return отсутствует
  - **41 точное утверждение** подтверждено:
    - CRIT-R8-1: нет `delete()`/`dispose()` для ManifoldObject ✅
    - CRIT-R8-2: `busy` flag не блокирует concurrent actions ✅
    - WARN-R8-1: нет `React.memo` ни на одном компоненте ✅
    - WARN-R8-2: `onFpsUpdate` без `fpsUpdateRef` ✅
    - WARN-R8-3: `buildPrimitive` switch ×3 ✅
    - WARN-R8-4: dead code: `DragRect`, `performDragSelect`, `currentMeshRef` ✅
    - WARN-R8-5..8, SEC-R8-1..2, PERF-R8-1..4, A11Y-1..5, BUG-R8-1,2,4,5, COSM-R8-1..7 — все подтверждены ✅
  - **Вывод:** Раунд 8 — качественное ревью, единственная систематическая ошибка — занижение метрик (унаследовано от предыдущих раундов). Выдуманных проблем — 0.

### Added — Раунд 7: Верификация код-ревью (2026-07-16)

- **CODE_REVIEW.md:** Добавлен Раунд 7 — верификация каждого утверждения Раунда 4 против исходного кода
  - Общая точность: **~78%** (16 точно, 6 частично, 5 ошибочно из 27 утверждений)
  - **5 ошибочных утверждений** отозваны:
    - ERR-1: «47 тестов» → реально ~104 (занижение в 2.2×)
    - ERR-2: «0 тестов для document-store» → реально 7 тестов для утилит
    - ERR-3: «18 useStore хуков» → реально 33 (занижение в 1.8×)
    - ERR-4: WARN-4.1 «утечка URL.createObjectURL» → не существует, `import()` не утечка
    - ERR-5: WARN-4.8 «hotkeys не видны» → уже в tooltip (9+ кнопок)
    - ERR-6: PERF-4.3 «Object.keys на каждый рендер» → event handler, не render
  - **6 частично точных** уточнены:
    - CRIT-4.1: дублирование паттерна итерации, не логики (rebuildOps.ts уже делит математику)
    - CRIT-4.2: ~22 async actions, не 24
    - CRIT-4.3: «утечка» — гипотеза, не верифицируемая статическим анализом
  - **16 точных утверждений** подтверждены (WARN-4.2..4.6, WARN-4.9..4.10, SEC-4.1, COSM-4.2..4.3 и др.)
  - Систематические ошибки: занижение метрик, выдуманные заголовки, преувеличение, дублирование замечаний

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
- **Фаза 5:** Формат `.doodle` (ZIP + JSON) — вдохновлён CaDoodle
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
