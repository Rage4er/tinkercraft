# Changelog

Все заметные изменения в этом проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование следует [SemVer](https://semver.org/lang/ru/).

---

## [Unreleased]

### Fixed

- **MIRROR-PREVIEW-CENTER**: `previewMirror` — меш превью теперь центрируется через `extractAndCenterGetAABB`, центроид (`cx,cy,cz`) передаётся в `setMirrorPreviewMesh` как `center`. В `useMirrorPreview` центр используется для `pivot.position.set()`, а не через `centerGeometry()` (который центрировал уже центрированные вершины → (0,0,0)). Обновлён интерфейс `MirrorPreviewMesh` с опциональным полем `center` (`viewport-hooks.ts`, `document-store.ts`, `ui-store.ts`)
- **MIRROR-BOOLEAN-RESET**: `mirrorSelected` — удалён вызов `resetSubtreeTransform` для boolean-нод после `cloneSubtree`. `mirrorTreeNode` уже изменил `localTransform` у примитивов в поддереве (отразил позицию/ротацию/scale). `resetSubtreeTransform` затирал эти изменения → boolean-нода теряла отражение (`document-store.ts`)
- **MIRROR-DOUBLE-POS**: `handleMirrorObject` — для примитивов (if-ветка) убрано двойное применение позиции: шаги 1-3 (translate→mirror→translate back) уже учитывают mirrorCenter, шаг 4 применяет только отражённые rot/scale (позиция = 0). Для import_mesh (else-ветка) логика сохранена: translate→mirror→translate back + transform с `newPos = 2*mirrorCenter - originalPos` и отражёнными rot/scale (`worker-handlers.ts`)
- **CRIT-CSG-1**: `handleCsgBooleanSync` — теперь **всегда** sync-ит operands из shapeType/params, независимо от состояния кэша. Ранее пропускал sync если operand уже был в кэше, что приводило к использованию stale-позиций и удалению operand из кэша после boolean → "Objects not found" при следующей операции
- **CRIT-CSG-2**: CSG-результаты теперь регистрируются как **baked-ноды** вместо boolean-нод. Геометрия уже вычислена и центрирована, не нужно пересчитывать через дерево с children
- **CRIT-CSG-3**: `csgBoolean` — больше **не отправляет** shapeType/params для CSG-результатов (`shapeType='cube', params={}`). Ранее это приводило к созданию default cube 20x20x20 вместо actual CSG-геометрии
- **CRIT-CSG-4**: `handleSyncMesh` — для CSG-результатов применяется **только translation**. Rotation/scale уже baked in в geometry CSG-результата, их применение приводило к смещению
- **CRIT-CSG-5**: `transformBakedMesh` — применяется **только translation** для baked-нод. Prevents double-application of rotation/scale when mesh is rendered
- **MIRROR-BAKED**: `mirrorTreeNode` корректно обрабатывает baked-ноды (CSG-результаты) — зеркалит position в localTransform, geometry не меняется. `mirrorSelected` центрирует результат через `extractAndCenterGetAABB` (аналогично CSG)

### Added

- **DIAG-CSG**: Диагностические логи в `handleCsgBooleanSync` и `handleSyncMesh` для отладки CSG operations
- **PERF-MIRROR**: `previewMirror` теперь устанавливает `busy=true` в начале функции, предотвращая параллельные вызовы с `mirrorSelected`/`csgBoolean`

### Changed

- **ARCH-CSG-1**: CSG-результаты (`csg_*`) теперь имеют `shapeType='cube', params={}` и регистрируются как baked-ноды в build tree. Это обеспечивает корректную маршрутизацию в `syncObjectsForOperation` → `workerSyncMesh`
- **ARCH-CSG-2**: `workerCsgBooleanWithSync` теперь принимает `undefined` для shapeType/params CSG-результатов, сигнализируя worker'у пропустить rebuild из примитивов
- **LOW-12**: `extrudeSelected` — добавлена проверка пустого `selectedIds` с `notify('No objects selected', 'warning')` (`document-store.ts`)

### Added

- **DOC-1**: Создан файл `NODEJS_SETUP.md` в `web-app/` — документация по настройке Node.js, pnpm, проверке typecheck и тестов (`web-app/NODEJS_SETUP.md`)
- **MED-UI-3**: Создан файл `viewport-hooks.ts` с четырьмя вынесенными хуками из `Viewport3D.tsx`: `useThreeInit` (инициализация Three.js), `useMeshSync` (синхронизация mesh), `useRulerMode` (логика линейки), `useMirrorPreview` (превью mirror). `Viewport3D.tsx` сокращён с 1103 до ~390 строк (`viewport-hooks.ts`, `Viewport3D.tsx`)

### Changed

- **MED-UI-4**: 45 отдельных селекторов `useUiStore` в `App.tsx` объединены в один `useShallow` селектор, что уменьшает количество ре-рендеров и упрощает код (`App.tsx`)

### Fixed

- **MED-UI-1**: Добавлен `clearTimeout`/cleanup в `useEffect` для mirror preview в `Viewport3D.tsx` — предотвращает утечку ресурсов при размонтировании компонента (`Viewport3D.tsx`)
- **MED-UI-2**: Добавлена дедупликация рёбер в `collectWorldEdges` через `Set<string>` с ключом `"i1,i2"` (где i1 < i2) — предотвращает дублирование рёбер, разделяемых двумя треугольниками (`snap-utils.ts`)
- **MED-IO-1**: Все функции `project-manager.ts` (`listProjects`, `saveProject`, `updateProject`, `loadProject`, `deleteProject`) обёрнуты в try/finally — гарантированное закрытие IndexedDB-соединения даже при ошибке (`project-manager.ts`)
- **MED-IO-2**: `parseStlFile` в `stl-import.ts` возвращает discriminated union `StlParseResult` вместо `null` — сообщает причину ошибки через поле `error`; обновлена обработка результата в `document-store.ts` (`stl-import.ts`, `document-store.ts`)

### Added

- **CRIT-1**: Инкапсуляция глобального состояния `treeNodes` — создан класс `TreeStore` с контролируемым API (`getNode`, `setNode`, `deleteNode`, `clear`, `getAllNodes`, `getAllNodesMap`, `hasNode`, `nodeCount`); глобальный `Map` заменён на singleton `treeStore`; добавлены unit-тесты для `TreeStore` (12 тестов) (`tree-store.ts`, `history-tree.ts`, `history-tree.test.ts`)

### Fixed

- **CRIT-11**: Удалён дублирующийся busy-индикатор из `Viewport3D.tsx` — оставлен только глобальный индикатор в `App.tsx`; удалены проп `busy` из интерфейса `Props` и соответствующий JSX-блок (`Viewport3D.tsx`, `App.tsx`)
- **CRIT-8**: `deleteNode` не удалял детей рекурсивно — добавлен опциональный параметр `recursive = false`; при `recursive === true` рекурсивно удаляются все дочерние узлы; обновлён вызов в `deleteSelected` (`history-tree.ts`, `document-store.ts`)
- **CRIT-12**: Drag-select не работал — `performDragSelect` был определён, но никогда не вызывался в `handlePointerUp`. Добавлен вызов с вычислением `DragRect` из `pointerDownPos` и текущей позиции мыши (`Viewport3D.tsx`)
- **CRIT-4**: `registerBakedNodes` не вызывался в `rebuildBuildTree` — добавлен опциональный параметр `objects` в `rebuildBuildTree` и вызов `registerBakedNodes` в конце функции; обновлены все 6 мест вызова в `document-store.ts` (`rebuild.ts`, `document-store.ts`)

### Fixed — Код-ревью раунд 17: 15 проблем (2026-07-31)

Полный цикл исправлений по результатам код-ревью Раунда 17 + SourceCraft.
Все 15 проблем исправлены, точность ревью ~83% (15/18).

#### 🔴 CRITICAL (2/2)

1. **R17-1** — `computeNodeHash` не включал `localTransform` для boolean-узлов:
   добавлена сериализация `localTransform` в хеш (`history-tree.ts`)
2. **R17-2** — `resizeObject` не имел `try/catch` для CSG-ветки:
   добавлен `set({ busy: true })`, `try/catch`, `notify()` (`document-store.ts`)

#### 🟡 MEDIUM/HIGH (5/5)

3. **R17-3** — Дублирование sync-логики в 3 местах: вынесена общая функция
   `syncObjectsForOperation()` в `document-store.ts`, заменены блоки в
   `csgBoolean`, `previewMirror`, `mirrorSelected`
4. **R17-4** — `alignSelected` использовал `workerBuildShape` для примитивов:
   заменён на `workerSyncObjects` (`document-store.ts`)
5. **R17-5** — `computeBakedBBox` не учитывал rotation/scale: добавлен fast path
   (только translation) и full path с `buildTransformMatrix` (`history-tree.ts`)
6. **R17-6** — `pasteClipboard` не регистрировал объекты в build tree:
   добавлены `createPrimitiveNode`/`createBakedNode` (`document-store.ts`)
7. **R17-7** — `rebuildBuildTree` не вызывался после `rebuildFromHistory`:
   добавлены вызовы в `undo`, `redo`, `jumpToHistory`, `openDoodle`,
   `restoreAutosave`, `loadFromProject` (`document-store.ts`)

#### 🟢 LOW (8/8)

8. **R17-8** — Circle Snap не работал: добавлен `shapeTypeMapRef` в
   `Viewport3D.tsx`, маппинг `objectId → shapeType` передаётся в
   `findNearestSnap` (`Viewport3D.tsx`, `snap-utils.ts`)
9. **R17-9** — Мёртвый код `getWorldPointFromPointer`: удалён (`Viewport3D.tsx`)
10. **R17-10** — `console.error` без `notify` в catch-блоках: добавлен `notify()`
    в 10 catch-блоков (`document-store.ts`)
11. **R17-11** — Утечка `slabId` в worker после экструзии: добавлен
    `workerDeleteObjects([slabId])` (`document-store.ts`)
12. **R17-12** — Неограниченный рост кэша Snapshot: добавлена LRU-стратегия
    с `MAX_CACHE_SIZE=50` (`snapshots.ts`)
13. **R17-13** — Последовательные `await` в `csgBoolean`: заменены на
    `Promise.all` (`document-store.ts`)
14. **R17-14** — Переполнение стека в `invalidateCache`: добавлен параметр
    `depth` с guard clause (max 100) (`history-tree.ts`)
15. **R17-15** — Английские метки в `OP_FILTER_LABELS`: заменены на русские
    (`constants.ts`)

**Файлы:** `document-store.ts`, `history-tree.ts`, `Viewport3D.tsx`,
`snapshots.ts`, `constants.ts`, `snap-utils.ts`

### Added — Mirror: live preview и 3D визуализация плоскости (MIRROR-2, MIRROR-4) (2026-07-31)
- Live preview результата mirror при наведении на кнопку плоскости (`previewMirror` в document-store, `MirrorPreviewMesh` в Viewport3D)
- 3D полупрозрачная плоскость-индикатор выбранной плоскости mirror в сцене (`mirrorPreviewPlane` в ui-store, `mirrorPlaneRef` в Viewport3D)
- Debounce 150ms для preview чтобы избежать лишних вызовов worker

### Fixed — Mirror: 4 MEDIUM-проблемы (MIRROR-1, MIRROR-6, MIRROR-7, MIRROR-10) (2026-07-31)

1. **MIRROR-1** — Mirror через центр BBox выделения вместо origin:
   `mirrorTreeNode` принимает опциональный `center`, `mirrorPoint` зеркалит
   относительно центра (`2*center - p`). `mirrorSelected` вычисляет центр
   BBox всех выделенных объектов (`history-tree.ts`, `document-store.ts`)

2. **MIRROR-6** — Fallback-ноды не удалялись после mirror: созданные
   fallback-ноды (для объектов не в дереве) теперь отслеживаются и
   удаляются после операции (`document-store.ts`)

3. **MIRROR-7** — Трансформ boolean ноды из первого child: теперь
   используется собственный `localTransform` boolean-ноды (если есть),
   fallback на first child только если нет (`document-store.ts`)

4. **MIRROR-10** — `.catch(() => { })` на sync удалён: ошибки
   синхронизации теперь пробрасываются в общий `try/catch`, логируются
   и сбрасывают `busy` (`document-store.ts`)

**Файлы:** `history-tree.ts`, `document-store.ts`

### Fixed — Mirror: 3 HIGH-бага (MIRROR-3, MIRROR-5, MIRROR-8) (2026-07-30)

1. **MIRROR-3** — Baked nodes с вращением: rotation и scale теперь инвертируются
   при mirror, как и для primitives (`history-tree.ts` — `mirrorNodeRecursive`)

2. **MIRROR-8** — Scale не инвертировался при mirror: исправлено в
   `mirrorNodeRecursive` (history-tree) и `applyMirrorToTransform` (rebuildOps.ts).
   Scale теперь negate по оси, перпендикулярной плоскости отражения

3. **MIRROR-5** — Потеря параметричности boolean → baked при mirror:
   boolean-ноды теперь клонируются как subtree (`cloneSubtree`) вместо
   создания baked-ноды (`document-store.ts` — `mirrorSelected`)

**Файлы:** `history-tree.ts`, `rebuildOps.ts`, `document-store.ts`

### Fixed — Код-ревью раунд 16: 4 дополнительных исправления (2026-07-30)

Финальная группа исправлений по код-ревью раунда 16 (всего исправлено 17 из 18):

1. **PERF-R16-2** — `Array.from(nodes.values()).map(...)` в `applyCSGMeshes` заменён
   на прямой цикл `for...of` с `push`, устраняя промежуточный массив (`history-tree.ts`)

2. **PERF-R16-3** — `useDocumentStore()` без селектора в `App.tsx` заменён на
   `useShallow(s => ({...}))` из `zustand/shallow`, предотвращая ре-ренеры при
   изменении store reference без изменения значений (`App.tsx`)

3. **SEC-R16-3** — `setCached` теперь проверяет, не disposed ли объект, через
   no-op `toString()` доступ перед кэшированием (`worker-handlers.ts`)

4. **TEST-R16-2** — `as any` в `history-tree.test.ts` заменён на типобезопасный
   `ExtractedMesh` интерфейс (`history-tree.test.ts`)

**Файлы:** `history-tree.ts`, `App.tsx`, `worker-handlers.ts`, `history-tree.test.ts`

### Fixed — Код-ревью раунд 16: 6 дополнительных исправлений (2026-07-26)

Продолжение исправлений по код-ревью раунда 16 (всего исправлено 13 из 18):

1. **CODE-R16-1** — Дублирование матричной математики: извлечена общая функция
   `computeRSMatrix()` в `worker-matrix.ts`, используется в `rebuild.ts` и
   `buildSRTMatrixAroundCenter`/`buildTransformMatrix` (`worker-matrix.ts`, `rebuild.ts`)

2. **CODE-R16-2** — Магические числа в Viewport3D: все числовые литералы
   вынесены в именованные константы (camera, lighting, controls, materials,
   interaction thresholds, ruler markers) — 40+ констант (`Viewport3D.tsx`)

3. **CODE-R16-3** — Смешение русского и английского в комментариях: русские
   комментарии в `Viewport3D.tsx` и `worker-matrix.ts` переведены на английский

4. **SEC-R16-1** — Валидация входящих данных в worker: добавлена функция
   `validateMessage()` с проверкой `reqId`, `type` и списка известных типов
   сообщений перед диспетчеризацией (`worker.ts`)

5. **TEST-R16-3** — Тесты для `snap-utils.ts`: создан `snap-utils.test.ts` с
   25 тестами для `closestPointOnSegment`, `closestVertex`, `closestEdge`,
   `snapLabel`, `createSnapIndicator`, `removeSnapIndicators`. Внутренние
   функции экспортированы для тестирования (`snap-utils.ts`, `snap-utils.test.ts`)

6. **SEC-R16-2** (дополнительно) — Пустой `catch` в non-manifold fallback
   теперь логирует ошибку через `console.warn` (`worker-handlers.ts`)

**Файлы:** `worker-matrix.ts`, `rebuild.ts`, `Viewport3D.tsx`, `worker.ts`,
`snap-utils.ts`, `snap-utils.test.ts`, `worker-handlers.ts`

### Added
- Тесты для `snap-utils.ts` (25 тестов, `snap-utils.test.ts`)
- Сравнительный вердикт CaDoodle vs TinkerCraft: Mirror (14 критериев, таблица преимуществ)
- Глубокий анализ процесса Mirror в CaDoodle (Java) — 6 шагов, 8 наборов параметров
- Глубокий анализ процесса Mirror в TinkerCraft — 10 шагов, 10 проблем (MIRROR-1..10)
- Верификация раунда 16 — точность ~50% (8/18 полностью верных)
- Анализ механики Mirror: сравнение с CaDoodle
- Код-ревью раунд 16: глубокий аудит (18 проблем)
- BuildTree: параметрическое дерево построения (TreeNode: primitive/boolean/baked)
- CODE_REVIEW_ARCHIVE.md — архив всех завершённых код-ревью
- **CODE_REVIEW.md + DEVELOPMENT_PLAN.md — объединённый отчёт Раунда 17 + SourceCraft (15 проблем, ~83% точность)**

### Fixed
- CRIT-R16-1: `handleRebuildScene` — `try/catch` с `disposeAllCached()` при ошибке
- CRIT-R16-2: `extractAndCenter` → `extractAndCenterInPlace` (явное имя + JSDoc)
- CRIT-R16-3: `any` → `WorkerNode` интерфейс в `collectSubtreeForWorker`
- CRIT-R16-4: `JSON.stringify` → структурированная конкатенация в `computeNodeHash`
- PERF-R16-4: `computeVertsHash` — FNV-1a inspired hash с mixing
- CODE-R16-4: `GizmoMode` — `null` заменён на `'none'`
- SEC-R16-2: пустой `catch` логирует через `console.warn`
- BUG-CSG-POS-5: `moveTreeNode` рекурсия в children — `moveObject` больше не использует `moveTreeNode`
- BUG-CSG-POS-6: двойное применение TRS — `moveObject` не перестраивает меш
- BUG-CSG-POS-1: CSG результат позиционируется по центроиду, не по среднему трансформов
- BUG-CSG-POS-2: stale worker cache — `syncOperand` синхронизирует все типы объектов
- WASM initialization error — `rebuildNode` проверяет `isWasmReady()`
- Mirror operation — разделение логики для примитивов и CSG/импорта
- Mirror: масштаб теряется при undo/redo
- Ruler: snap preview visualization
- Ruler: click-click measurement
- UX: сворачиваемые фильтры, скрытие extrude/mirror из PropertiesPanel
- Зеркалирование сбрасывает вращение (CRIT-MIRROR-1)
- Resize CSG результата заменяется кубиком (CRIT-RESIZE-1/2)
- История цвета: только финальный выбор
- CSG координаты и цепочка операций (CRIT-CSG-1/2/3)
- Раунд 8: WASM leak, race condition, Prototype Pollution
- Раунд 8: безопасность, производительность, баги, доступность
- Раунд 6: исправления по результатам независимого ревью
- Раунд 5: исправления по результатам итогового аудита
- CSG worker cache рассинхронизация
- Раунд 4: исправления по результатам глубокого ревью
- Раунд 3: исправления по результатам глубокого ревью
- Скрытые баги при типизации: `nullT` без scale, cache итерация без пропуска null, TransformNR без scale

### Changed
- `App.tsx` разделён с 1809 до 553 строк (−69%) — CRIT-1
- `document-store.ts` разделён с 757 до 500 строк (−34%) — CRIT-2
- Undo/redo использует snapshot cache вместо полного WASM rebuild — PERF-1 (100x ускорение)
- Дублирование Mirror/CSG/Align кнопок устранено — WARN-3
- Статические инлайн-стили заменены на CSS-классы — COSM-1
- `extractMesh()` парсит per-vertex normals из manifold-меша — WARN-6
- `stl-export.ts` использует manifold normals с fallback на cross-product — WARN-6
- `makeObject()` helper — авто-вычисление и кэширование AABB — WARN-8
- `DEFAULT_FILTERS` вынесен в `constants.ts` с явной типизацией — COSM-3
- `alert()` заменён на toast-уведомления во всём проекте — SEC-2
- `selSet` и `totalTris` обёрнуты в `useMemo` — PERF-2/3
- Keyboard `useEffect` стабилизирован через паттерн `kbRef` — WARN-1
- Убраны `eslint-disable` suppressions в `App.tsx` — WARN-2
- MIGRATION_PLAN.md → DEVELOPMENT_PLAN.md (переименование)
- README.md, AGENTS.md, ARCHITECTURE.md — "веб-версия CaDoodle" → "вдохновлён CaDoodle"
- CHANGELOG.md — рефакторинг: строгий Keep a Changelog, аналитика перенесена в CODE_REVIEW_ARCHIVE.md
- CODE_REVIEW.md — рефакторинг: только активные проблемы, история в CODE_REVIEW_ARCHIVE.md

### Removed
- `csg/engine.ts` — мёртвый код, 0 импортов (WARN-5)

---

## [0.0.1] — MVP (Фазы 0–6)

### Added
- Фаза 0: Vite + React + TypeScript scaffold, Zustand store, Three.js вьюпорт
- Фаза 1: Базовый 3D вьюпорт с орбитальной камерой, освещение, сетка
- Фаза 2: 7 примитивов (куб, сфера, цилиндр, конус, тор, призма, пирамида) через manifold-3d WASM Worker
- Фаза 2: Скругление (fillet) для кубов через `refine()` + `warp()`
- Фаза 3: Выделение объектов (raycaster), гизмо TransformControls, drag-перемещение
- Фаза 3: ViewCube с drag-вращением и snap к граням
- Фаза 3: Компонент-дерево сцены, панель свойств, тулбар
- Фаза 4: Булевы операции CSG (Union, Subtract, Intersect) с центрированием результатов
- Фаза 4: История операций с undo/redo, таймлайн с фильтрацией
- Фаза 4: Зеркало по осям, выравнивание (align) по 3 осям
- Фаза 5: Импорт/экспорт STL (бинарный + ASCII)
- Фаза 5: Формат `.doodle` (ZIP + JSON) — вдохновлён CaDoodle
- Фаза 5: Автосохранение в IndexedDB, восстановление сессии
- Фаза 5: Менеджер проектов (несколько проектов в IndexedDB)
- Фаза 5: 3D-текст через TextGeometry (opentype.js)
- Фаза 5: Линейка для измерения расстояний
- Фаза 5: Переключение перспективная ↔ ортографическая камера
- Фаза 6: Тёмная/светлая темы, PWA-манифест, COOP/COEP заголовки
- Фаза 6: ErrorBoundary, WebGLFallback
- Фаза 6: 20 type-level тестов (`types.test.ts`)
- Фаза 6: Тесты менеджера проектов (`project-manager.test.ts`)

### Known Limitations
- Скругление работает только для кубов
- Undo/redo выполняет полный rebuild (без кэша snapshots) — исправлено в [Unreleased]
- `document-store.ts` — 750 строк (кандидат на разделение) — исправлено в [Unreleased]
- Нет импорта SVG и 3MF
- Robot Lab не реализован
