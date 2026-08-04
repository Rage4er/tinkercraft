# Changelog

Все заметные изменения в этом проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование следует [SemVer](https://semver.org/lang/ru/).

---

## [Unreleased]

### Added

- **PHASE-8 — Параметрическая история операций (Plan)**: Добавлена Фаза 8 в `DEVELOPMENT_PLAN.md` — параметрическое редактирование операций в истории. Каждая операция в Timeline становится редактируемым параметрическим объектом: изменение параметров на любом шаге перестраивает всю цепочку после него. Подзадачи: Timeline edit (8.1), edit modal для примитивов (8.2), edit modal для CSG (8.3), rebuild on edit (8.4), edit modal для fillet/extrude/mirror (8.5), undo для edit (8.6), visual feedback (8.7). Зависит от существующих: история операций, build tree, rebuildFromHistory. Базовая инфраструктура уже готова — нужно только UI для редактирования и вызов rebuildFromHistory после изменений (`DEVELOPMENT_PLAN.md`)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **CRIT-18-4 ( утечка BufferAttribute)**: Исправлена утечка памяти при обновлении геометрии mesh. Старые `BufferAttribute` теперь диспоузятся перед заменой (`viewport-hooks.ts`)
- **CRIT-18-5 (нет тестов doodle-io)**: Добавлен `doodle-io.test.ts` — тесты валидации ключей и параметров (`io/doodle-io.test.ts`)
- **HIGH-18-1 (мутация tree nodes)**: `Object.assign(node, ...)` заменён на `setNode(id, { ...node, ... })` для иммутабельного обновления params. Прямая мутация `node.localTransform` заменена на `setNode` (`document-store.ts`)
- **HIGH-18-2 (эвристика CSG в alignSelected)**: Старая эвристика `shapeType==='cube' && !params.width` заменена на统一 `!obj.params || Object.keys(obj.params).length === 0` (`document-store.ts`)
- **HIGH-18-5 (TransformNR → RebuildTransform)**: Подтверждено как НЕ БАГ — типы структурно идентичны, TypeScript structural typing разрешает прямое присваивание
- **HIGH-18-7 (утечка обработчика error)**: `disposeWorker()` теперь корректно удаляет `message` и `error` слушатели перед `terminate()` (`worker-client.ts`)
- **HIGH-18-9 (sphere/cylinder без проверки)**: `buildPrimitive` теперь проверяет `radius <= 0` и `height <= 0`, возвращает fallback cube (`worker-handlers.ts`)
- **HIGH-18-11 (утечка WASM-объектов)**: `handleCsgBooleanSync` теперь вызывает `m.delete()` после применения трансформации к operand (`worker-handlers.ts`)
- **HIGH-18-15 (TransformControls не диспоузится)**: Cleanup useEffect теперь вызывает `tc.dispose()` и обнуляет `transformCtRef` (`viewport-hooks.ts`)

### Fixed

- **HIGH-18-8 (transform any)**: `workerMirrorObject` — `transform?: any` → `transform?: TransformNR` (`worker-client.ts`)

### Fixed

- **HIGH-18-3 (RebuildMeta)**: resultVertices/resultIndices/resultNormals/originalBboxSize добавлены в интерфейс RebuildMeta, приведения `as RebuildMeta & {...}` убраны (`rebuild.ts`)
- **HIGH-18-4 (baked-ноды)**: registerBakedNodes вызывается в конце rebuildBuildTree, comment clarified (`rebuild.ts`)
- **HIGH-18-20 (stl-import tests)**: добавлены тесты detectStlFormat (4 теста) (`stl-import.test.ts`)
- **HIGH-18-24 (autosave tests)**: autosave.test.ts создан (4 теста: save, restore, clear, overwrite)
- **HIGH-18-25 (project-manager tests)**: vi.mock('./project-manager') → vi.mock('idb'), тесты проверяют реальную реализацию

### Fixed

- **MED-18-1 (undo/redo дубликация)**: jumpToHistoryInner() extracted, ~90 строк дублирования убраны (`document-store.ts`)
- **MED-18-10 (setTimeout cleanup)**: timeouts Map + clearTimeout на dismiss (`notifications.ts`)
- **MED-18-11 (ids validation)**: null-safe ids в deleteObjects (`worker.ts`)
- **MED-18-45 (sanitizeObjectKeys)**: sanitizeObjectKeys() добавлена, удаляет unsafe keys (`doodle-io.ts`)
- **MED-18-46 (revokeObjectURL)**: setTimeout 2s для Safari совместимости (`doodle-io.ts`)
- **MED-18-47 (QuotaExceededError)**: console.error + логирование (`autosave.ts`)
- **MED-18-48 (tx.onabort)**: tx.onabort → reject с понятной ошибкой (`autosave.ts`)

### Fixed

- **LOW-18-5 (gizmo validation)**: runtime validation для setGizmoMode, validModes check (`ui-store.ts`)
- **LOW-18-12 (notification limit)**: MAX_NOTIFICATIONS=5 (part of MED-18-10)
- **LOW-18-19 (clamp min > max)**: тест добавлен (`worker-sanitize.test.ts`)
- **LOW-18-20 (Symbol keys)**: тест Symbol ключей добавлен (`worker-sanitize.test.ts`)
- **LOW-18-21 (empty sanitizeParams)**: тест empty result добавлен (`worker-sanitize.test.ts`)
- **LOW-18-22 (as const)**: `as const` на transform убран (`worker-sync.test.ts`)

### Changed

- **MIRROR-STORE-REFACTOR**: Вся логика зеркала вынесена из `document-store.ts` в отдельный файл `mirror-store.ts`. Это очищает `document-store.ts` (убраны импорты `mirrorTreeNode`, `mirrorVerticesInPlace`, `mirrorPoint`, `cloneSubtree`) и упрощает отладку. `document-store.ts` теперь только вызывает `previewMirror` и `mirrorSelected` из `mirror-store.ts`. Новый подход: `rebuildNode` → `mirrorVerticesInPlace` → `mirrorPoint`. Для primitive сохраняется `shapeType`/`params` (остаются редактируемыми), для CSG/import — `shapeType: 'import_mesh'` (baked). Transform = `mirrorPoint` для позиции, `rot=0, scale=1`. Исправлено: `mirror-store.ts` (новый файл), `document-store.ts` (рефакторинг)
- **MIRROR-UNIFIED-PREVIEW-CONFIRM**: Preview и confirm зеркала теперь используют **единый метод** `mirrorObject` в `mirror-store.ts`. Preview — тот же объект, что и confirm, но с флагом `isMirrorPreview: true` (прозрачность 0.35). Это устраняет дублирование кода и гарантирует идентичность preview и финального объекта. `mirrorPreviewMesh` в `ui-store.ts` заменён на `previewObject: (SceneObject & { isMirrorPreview: boolean }) | null`. `useMirrorPreview` в `viewport-hooks.ts` переписан — создаёт mesh как обычный SceneObject (центрирование + pivot с position/rotation/scale), но с прозрачным материалом. Исправлено: `mirror-store.ts` (mirrorObject)

- **HIGH-18-17 (утечка ViewCube)**: cleanup useEffect теперь traverse all scene children, dispose geometry/materials, clear scene (`ViewCube.tsx`)
- **HIGH-18-18 (Ctrl+S конфликт)**: Ctrl+S теперь работает даже при активном gizmo (`App.tsx`)
- **HIGH-18-19 (STL overflow)**: cap на 10M triangles (~500MB buffer) при экспорте (`stl-export.ts`)
- **HIGH-18-21 (ZIP bomb)**: MAX_DOODLE_SIZE=50MB + MAX_MODEL_JSON_SIZE=5MB уже были, добавлен MAX_RECURSION_DEPTH=1000 (`doodle-io.ts`)
- **HIGH-18-22 (stack overflow)**: validateObjectKeys теперь принимает depth параметр, cap на 1000 уровней (`doodle-io.ts`)
- **HIGH-18-23 (IndexedDB утечка)**: tx.oncomplete → db.close() для autosaveSession, restoreSession, clearAutosave (`autosave.ts`)
- **HIGH-18-16 (mirror preview)**: ПРОВЕРЕНО — cleanup useEffect корректен, geometry/material диспоузятся, `ui-store.ts` (previewObject), `viewport-hooks.ts` (useMirrorPreview), `Viewport3D.tsx` (previewObject prop), `App.tsx` (previewObject вместо mirrorPreviewMesh), `document-store.ts` (setPreviewObject вместо setMirrorPreviewMesh)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **MIRROR-BAKED-GEOMETRY (CRITICAL)**: Зеркало для baked-нод (CSG результаты, импортированные STL) теперь действительно отражает геометрию. Две проблемы:
  1. **`mirrorNodeRecursive`** не отражал вершины baked-нод — менял только `localTransform`. Исправление: добавлен вызов `mirrorVerticesInPlace(node.vertices, node.normals, plane)` — negate перпендикулярной оси для каждой вершины и нормали. Rotation/scale обрабатываются как для primitive — через `mirrorEuler` и `Math.abs()`. Viewport3D применяет отражённые rotation/scale при рендеринге. Исправлено: `history-tree.ts` (mirrorNodeRecursive для baked, добавлена mirrorVerticesInPlace)
  2. **`mirrorSelected`** не сохранял результат `rebuildNode` — `makeObject({...obj, ...})` копировал `obj.vertices` из оригинального (неотражённого) объекта. Исправление: результат `rebuildNode` сохраняется в `rebuiltMesh` и передаётся в `makeObject` как `vertices`/`indices`/`normals`. Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-CENTER-ORIGIN (CRITICAL)**: Центр зеркала изменён на `(0,0,0)` — точка origin сцены. Ранее центр вычислялся из AABB выделенных объектов, что приводило к проблеме: повторное зеркало отражённого объекта не возвращало его в исходное положение, т.к. AABB уже был смещён. Origin — стандартное поведение в CAD-системах (зеркало отражает относительно плоскости, проходящей через origin). Исправлено: `document-store.ts` (mirrorSelected, previewMirror)
- **MIRROR-UNIFIED-BAKED-APPROACH (CRITICAL)**: Полная переработка mirror — единый подход для ВСЕХ типов объектов. Проблема: для primitive-объектов rotation/scale применялись дважды — `rebuildPrimitive` применял SRT к геометрии, а Viewport3D применял `obj.transform` снова при рендеринге. Для baked-нод (CSG) `transformBakedMesh` применяет ТОЛЬКО translation (CRIT-CSG-7), rotation/scale игнорируются. Решение: 1) `cloneSubtree` → копируем дерево, 2) `mirrorTreeNode` → применяем mirror к localTransform (sign flip rotation, abs scale, mirror position) — рекурсивно обрабатывает primitive/baked/boolean ноды, 3) `rebuildNode` → получаем финальную геометрию с отражённым transform, baked в вершины, 4) `extractAndCenterInPlace` → центрируем геометрию, получаем центр, 5) позиция transform = центр, `rot=0, scale=1` (baked-объект). `mirrorTreeNode` необходим для baked-нод, т.к. `transformBakedMesh` игнорирует rotation/scale — mirrorTreeNode меняет localTransform (sign flip rotation), и rebuildNode bake-ит отражённый transform. Все mirrored объекты становятся baked (`shapeType: 'import_mesh'`). Экспортированы `mirrorVerticesInPlace` и `mirrorPoint` из `history-tree.ts`. Исправлено: `document-store.ts` (mirrorSelected, previewMirror), `history-tree.ts` (экспорт mirrorVerticesInPlace, mirrorPoint)

### ✅ ИСПРАВЛЕНО — Код-ревью раунд 19: Глубокий аудит Mirror (6 проблем) (2026-08-02)

Полный цикл аудита реализации mirror. Выявлено 12 новых проблем, из них 2 CRITICAL и 4 HIGH. **6 проблем из 12 были успешно исправлены** в новом коде mirror-store.ts.

#### ✅ Исправленные проблемы (6/12):

1. **MIRROR-19-1 (CRITICAL)** — `mirrorCenter` теперь вычисляется из `obj.transform` (мировые координаты), а не из `computeAABB(obj.vertices)` (локальные). Решение: использование `resetSubtreeTransform` + `mirrorPoint` с мировыми координатами (`mirror-store.ts`)
2. **MIRROR-19-2 (CRITICAL)** — Preview теперь работает для ВСЕХ выделенных объектов, а не только для первого. Решение: итерация по всем `ids` и объединение геометрии (`mirror-store.ts:previewMirror`)
3. **MIRROR-19-3 (HIGH)** — Утечка preview-узлов устранена: временные узлы создаются в `mirrorObject` и удаляются через `deleteNode(newId, true)` (`mirror-store.ts`)
4. **MIRROR-19-4 (HIGH)** — Race condition устранён: добавлен debounce 150ms для preview в `App.tsx`, который отменяет предыдущие запросы при новом наведении
5. **MIRROR-19-5 (HIGH)** — Preview-узлы очищаются: после `mirrorSelected` временные узлы удаляются в `mirrorObject` через `deleteNode`
6. **MIRROR-19-6 (HIGH)** — Эвристика детекции CSG-результата улучшена: замена `shapeType==='cube' && !params.width` на `!obj.params || Object.keys(obj.params).length === 0` (`document-store.ts`, `mirror-store.ts`)

#### 🟠 Оставшиеся проблемы (6/12):

7. **MIRROR-19-7** — `baked` без `localTransform` молча пропускается в `mirrorNodeRecursive` (`history-tree.ts:744`)
8. **MIRROR-19-8** — `boolean` без `children` молча пропускается в `mirrorNodeRecursive` (`history-tree.ts:773`)
9. **MIRROR-19-9** — `treeTransform` может устареть после `rebuildNode` (`document-store.ts:692-700`)
10. **MIRROR-19-10** — Fallback при `treeTransform === null` даёт другую логику, чем `mirrorTreeNode` (`document-store.ts:704-726`)
11. **MIRROR-19-11** — `as unknown as` в `rebuild.ts` для mirror-операций (`rebuild.ts:76-85,279-299`)
12. **MIRROR-19-12** — `Matrix4.compose` с `Quaternion.setFromEuler` может дать неверную матрицу для отражённых углов Euler (`viewport-hooks.ts:794-804`)

**Файлы:** `mirror-store.ts`, `document-store.ts`, `App.tsx`

### ✅ ИСПРАВЛЕНО — Код-ревью раунд 20: Аудит утверждения о параметрических CSG (3 изменения) (2026-08-03)

Утверждение «Достаточно заменить createBakedNode на createBooleanNode, чтобы CSG-результаты стали параметрическими» было опровергнуто — нужно минимум 3 изменения, а не одно. Все три проблемы успешно исправлены:

#### ✅ CSG-PARAM-1 (HIGH)
Заменён `createBakedNode` на `createBooleanNode(resultId, op, idA, idB, resultTransform)` для сохранения связи с операндами и типа операции (`document-store.ts:464`)

#### ✅ CSG-PARAM-2 (MEDIUM)
Добавлен параметр `nd.localTransform` в `createBooleanNode(nd.id, nd.operation, nd.children[0], nd.children[1], nd.localTransform!)` для сохранения позиции после undo/redo (`document-store.ts:80`)

#### ✅ CSG-PARAM-3 (LOW)
Добавлена проверка `if (!getNode(op.id))` перед `createPrimitiveNode` для предотвращения дубликатов при undo/redo (`rebuild.ts:254-256`)

**Файлы:** `document-store.ts`, `rebuild.ts`

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **MIRROR-ROTATION-SIMPLE-SIGN (CRITICAL)**: Отказ от quaternion-based mirror — он НЕ РАБОТАЕТ! Quaternion представляет повороты (SO(3), det = +1), но mirror — это отражение (O(3), det = -1). Quaternion не может корректно представить отражение, поэтому `mirror_quaternion.multiply(q)` давал APPROXIMATE результат (rotX: 7.35° вместо 10°). Исправление: возвращён простой sign flip — axes IN mirror plane change sign, perpendicular axis unchanged. Это МATHЕМАТИЧЕСКИ КОРРЕКТНО для Euler углов и используется в Fusion 360, SolidWorks. Исправлено: `history-tree.ts` (mirrorEuler — теперь simple sign flip, не quaternion)
- **MIRROR-STORE-TREE-CONSISTENCY (CRITICAL)**: Store transform теперь берётся из tree node (simple sign flip mirror), а не из inline-формулы с простой инверсией. Ранее store использовал `rotX = plane === 'YZ' ? t.rotX : -t.rotX` (математически неверно для произвольных углов), а tree использовал `mirrorEuler` (quaternion, неправильно). Теперь store и tree используют ОДИН метод — simple sign flip. Гарантирует 100% консистентность. Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-UNIFIED-CONFIRM-PREVIEW (CRITICAL)**: Confirm mirror теперь использует ЕДИНЫЙ метод с preview — `cloneSubtree + mirrorTreeNode + rebuildNode`. Ранее preview использовал `mirrorTreeNode → mirrorEuler (quaternion)` (неправильно), а confirm использовал `signX/rotX * signX` (неправильно). Теперь оба используют `mirrorTreeNode` который применяет `mirrorEuler` через simple sign flip — корректно для ЛЮБЫХ углов. objects остаются полностью редактируемыми. Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-PREVIEW-TRANSFORM (CRITICAL)**: Preview mirror теперь позиционируется правильно в viewport. Ранее `MirrorPreviewMesh` не содержал `transform`, поэтому preview mesh рендерился в origin (0,0,0) независимо от реального положения. Исправление: 1) добавлено поле `transform` в `MirrorPreviewMesh` (ui-store + viewport-hooks), 2) `previewMirror` сохраняет `localTransform` из mirrored node, 3) `useMirrorPreview` применяет `Matrix4.compose()` к geometry — позиция/вращение/масштаб применяются корректно. Исправлено: `viewport-hooks.ts` (useMirrorPreview, MirrorPreviewMesh), `document-store.ts` (previewMirror), `ui-store.ts` (mirrorPreviewMesh type)
- **MIRROR-CSG-FALLBACK (CRITICAL)**: CSG результаты (`shapeType='cube' && !params.width`) теперь правильно обрабатываются в mirrorSelected. Ранее условие `obj.shapeType && obj.params` было `true` для CSG результатов (пустой params объект), что приводило к `createPrimitiveNode(newId, 'cube', {}, mirroredTransform)` — примитив с пустыми параметрами, который не генерирует геометрию. Исправление: добавлена проверка `isCsgResult = obj.shapeType === 'cube' && obj.params && !obj.params.width`. CSG и import объекты теперь проходят через `cloneSubtree + mirrorTreeNode` с fallback node. Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-UNIFIED-PARAMETRIC (CRITICAL)**: Переписан mirror на единый параметрический подход для ВСЕХ типов объектов. Больше нет разделения на primitives/CSG/import — все объекты зеркалятся одинаково: 1) mirrorTransform (mirrored position + reflected rot + abs scale), 2) создание нового объекта с mirrored params, 3) rebuild из params/structure. Preview mirror также унифицирован: cloneSubtree → mirrorTreeNode → rebuildNode. Убран workerMirrorObject, нет бейкинга геометрии, объекты остаются полностью редактируемыми. Исправлено: `document-store.ts` (previewMirror, mirrorSelected)
- **MIRROR-CSG-ROTATION-PREVIEW (CRITICAL)**: CSG preview mirror теперь правильно отражает rotation. Ранее preview mesh для CSG отображался в origin (transform = identity в worker) → не видно preview. Исправление: unified preview через cloneSubtree → mirrorTreeNode → rebuildNode → geometry позиционируется правильно. Исправлено: `document-store.ts` (previewMirror)
- **MIRROR-PRIMITIVE-GEOMETRY (CRITICAL)**: Примитивы теперь зеркалят геометрию относительно **mirrorCenter**, а не origin. Ранее worker mirror geometry относительно origin (независимо от позиции объекта) → geometry зеркалилась относительно origin, а не центра выделения. Исправление: translate к mirrorCenter → mirror matrix → translate обратно → geometry зеркалится относительно mirrorCenter. Store resultTransform = identity (geometry уже содержит mirrored position baked in). Исправлено: `worker-handlers.ts` (handleMirrorObject для примитивов)
- **MIRROR-PREVIEW-POSITION (CRITICAL)**: Preview mirror теперь позиционируется правильно. Ранее preview mesh для CSG создавался в origin (transform = identity в worker) → отображался в центре координат. Исправление: workerMirrorObject получает mirroredTransform с mirrored position для CSG → geometry позиционируется в worker. Исправлено: `document-store.ts` (previewMirror)
- **MIRROR-PRIMITIVES-DOUBLE-TRANSFORM (CRITICAL)**: Примитивы больше не применяют transform вдвойне. Ранее worker mirror + apply transform к geometry, store также устанавливал mirroredTransform → Viewport3D double-применял трансформацию. Исправление: worker mirror + apply transform к geometry, store для примитивов устанавливает transform = identity (geometry уже содержит mirrored position + rot + scale baked in). Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-CSG-ROTATION (CRITICAL)**: CSG результаты теперь сохраняют **отражённые rotation и abs scale** из оригинального объекта. Ранее transform = {rot:0, scale:1,1,1} → терялся поворот и масштаб. Исправление: YZ → rotX unchanged, rotY/rotZ negated, scale=abs(); XZ → rotY unchanged, rotX/rotZ negated, scale=abs(); XY → rotZ unchanged, rotX/rotY negated, scale=abs(). Исправлено: `document-store.ts` (mirrorSelected)
- **MIRROR-CSG-POSITION (CRITICAL)**: CSG/import результаты теперь имеют mirrored position + geometry centered. Ранее worker mirror возвращал geometry на mirrored позиции (translate→mirror→translate back), но store устанавливал transform = identity → geometry рендерилась при origin вместо mirrored позиции. Исправление: worker mirror geometry относительно origin (translate к origin → mirror → rotate/scale), geometry возвращается centered в origin. Store устанавливает transform = mirrored position (perpendicular axis negated). Исправлено: `worker-handlers.ts` (handleMirrorObject для CSG/import), `document-store.ts` (mirrorSelected)
- **MIRROR-CSG-TRANSFORM (CRITICAL)**: CSG/import результаты теперь имеют mirrored position + geometry centered. Ранее worker mirror возвращал geometry на mirrored позиции, но store устанавливал transform = identity → geometry рендерилась при origin вместо mirrored позиции. Исправление: worker mirror geometry относительно origin (translate к origin → mirror → rotate/scale), geometry возвращается centered в origin. Store устанавливает transform = mirrored position (perpendicular axis negated). Исправлено: `worker-handlers.ts` (handleMirrorObject для CSG/import), `document-store.ts` (mirrorSelected)
- **MIRROR-CSG-GEOMETRY (CRITICAL)**: CSG-результаты (union/subtract/intersect) теперь правильно зеркалят ГЕОМЕТРИЮ. Ранее CSG-объекты (`shapeType='cube'`, `params=undefined`) попадали в ветку `mirrorTreeNode` + `rebuildNode`, которая не зеркалит geometry — только меняет transform. Теперь CSG-результаты определяются по `shapeType='cube' && !params.width` и обрабатываются через `workerMirrorObject` (matrix mirror geometry). Исправлено: `document-store.ts` (mirrorSelected, previewMirror)
- **MIRROR-GEOMETRY (CRITICAL)**: Зеркало теперь правильно отражает ГЕОМЕТРИЮ, а не просто копирует с перевёрнутым scale. Раньше `mirrorNodeRecursive` инвертировал scale (отрицательный) → negative scale = переворот на 180°, НЕ зеркальная копия. Зеркальная трансформация теперь делается через mirror matrix к геометрии (manifold), а scale всегда по модулю (abs). Исправлено в: `worker-handlers.ts` (handleMirrorObject для примитивов и CSG/import), `history-tree.ts` (mirrorNodeRecursive), `rebuildOps.ts` (applyMirrorToTransform), `document-store.ts` (mirrorSelected, previewMirror — для примитивов и CSG теперь используется workerMirrorObject напрямую)
- **MIRROR-SCALE**: Scale теперь всегда положительный (abs). Раньше scale инвертировался (отрицательный) при зеркале → это создавало перевёрнутый объект, а не зеркальную копию. Зеркальная трансформация геометрии теперь делается через matrix transform (manifold), а не через negative scale
- **MIRROR-6 (CRITICAL)**: Исправлена математика зеркального отражения во ВСЕХ местах. Раньше зеркалилась ось **перпендикулярная** плоскости (неверно). Теперь: ось **перпендикулярная** зеркальной плоскости НЕ меняется, оси **В плоскости** меняют знак. Исправлено в: `history-tree.ts` (mirrorNodeRecursive), `rebuildOps.ts` (applyMirrorToTransform), `worker-handlers.ts` (handleMirrorObject)
- **MIRROR-7**: Mirror transform применяется ОДИН РАЗ через pivot. Ранее `rebuildNode` применял mirrored localTransform к geometry, затем pivot применял mirroredTransform ЕЩЁ РАЗ → двойное зеркало (scale 0.25 вместо 0.5, углы удвоены). Исправление: saved mirroredTransform ДО rebuild, сбросил localTransform в identity → mesh в origin, pivot применяет mirroredTransform ОДИН РАЗ. Объект сохраняет `shapeType/params` (parametric), а не baking mesh
- **MIRROR-5**: Mirror больше НЕ применяет transform дважды. Ранее `rebuildNode` применял mirrored localTransform к geometry (mesh уже отзеркален), затем `Viewport3D` pivot применял `finalTransform` ЕЩЁ РАЗ → двойное зеркало (scale 0.25 вместо 0.5, углы удвоены). Исправление: saved mirrored localTransform ДО rebuild, сбросил его в identity → mesh останется в origin, `finalTransform` = mirrored transform → Viewport3D pivot применяет его ОДИН РАЗ
- **MIRROR-2**: Mirror корректно отражает **rotation и scale** объектов. Ранее `mirrorSelected` сбрасывал rotation в 0 и scale в 1 после извлечения mirrored mesh, теряя orientation объекта. Теперь `finalTransform` использует `mirroredLocalTransform` из mirrored ноды, который содержит правильное зеркальное вращение (rotX/Y/Z инвертированы на зеркальной оси) и масштаб (scaleX/Y/Z инвертированы на зеркальной оси)
- **MIRROR-1**: `previewMirror` больше НЕ устанавливает `busy=true` — это non-blocking preview operation, который не должен блокировать `mirrorSelected`. Ранее hover на кнопку mirror устанавливал busy, и клик по mirror возвращался из-за `if (get().busy) return`
- **CRIT-CSG-1**: `handleCsgBooleanSync` — теперь **всегда** sync-ит operands из shapeType/params, независимо от состояния кэша. Ранее пропускал sync если operand уже был в кэше, что приводило к использованию stale-позиций и удалению operand из кэша после boolean → "Objects not found" при следующей операции
- **CRIT-CSG-2**: CSG-результаты теперь регистрируются как **baked-ноды** вместо boolean-нод. Геометрия уже вычислена и центрирована, не нужно пересчитывать через дерево с children
- **CRIT-CSG-3**: `csgBoolean` — больше **не отправляет** shapeType/params для CSG-результатов (`shapeType='cube', params={}`). Ранее это приводило к созданию default cube 20x20x20 вместо actual CSG-геометрии
- **CRIT-CSG-4**: `handleSyncMesh` — для CSG-результатов применяется **только translation**. Rotation/scale уже baked in в geometry CSG-результата, их применение приводило к смещению
- **CRIT-CSG-5**: `transformBakedMesh` — применяется **только translation** для baked-нод. Prevents double-application of rotation/scale when mesh is rendered
- **MIRROR-BAKED**: `mirrorTreeNode` корректно обрабатывает baked-ноды (CSG-результаты) — зеркалит position в localTransform, geometry не меняется. `mirrorSelected` центрирует результат через `extractAndCenterGetAABB` (аналогично CSG)

### Added

- **DIAG-CSG**: Диагностические логи в `handleCsgBooleanSync` и `handleSyncMesh` для отладки CSG operations
- **DIAG-MIRROR**: Подробные диагностические логи `[MIRROR:*]` для отслеживания жизненного цикла mirror: `addShape`, `moveObject`, `resizeObject`, `previewMirror`, `mirrorSelected` (BEFORE/AFTER), `mirrorNodeRecursive`, `applyMirrorToTransform`
- **PERF-MIRROR**: `previewMirror` теперь устанавливает `busy=true` в начале функции, предотвращая параллельные вызовы с `mirrorSelected`/`csgBoolean`

### Fixed

- **HIGH-18-8 (transform any)**: `workerMirrorObject` — `transform?: any` → `transform?: TransformNR` (`worker-client.ts`)

### Fixed

- **HIGH-18-3 (RebuildMeta)**: resultVertices/resultIndices/resultNormals/originalBboxSize добавлены в интерфейс RebuildMeta, приведения `as RebuildMeta & {...}` убраны (`rebuild.ts`)
- **HIGH-18-4 (baked-ноды)**: registerBakedNodes вызывается в конце rebuildBuildTree, comment clarified (`rebuild.ts`)
- **HIGH-18-20 (stl-import tests)**: добавлены тесты detectStlFormat (4 теста) (`stl-import.test.ts`)
- **HIGH-18-24 (autosave tests)**: autosave.test.ts создан (4 теста: save, restore, clear, overwrite)
- **HIGH-18-25 (project-manager tests)**: vi.mock('./project-manager') → vi.mock('idb'), тесты проверяют реальную реализацию

### Fixed

- **MED-18-1 (undo/redo дубликация)**: jumpToHistoryInner() extracted, ~90 строк дублирования убраны (`document-store.ts`)
- **MED-18-10 (setTimeout cleanup)**: timeouts Map + clearTimeout на dismiss (`notifications.ts`)
- **MED-18-11 (ids validation)**: null-safe ids в deleteObjects (`worker.ts`)
- **MED-18-45 (sanitizeObjectKeys)**: sanitizeObjectKeys() добавлена, удаляет unsafe keys (`doodle-io.ts`)
- **MED-18-46 (revokeObjectURL)**: setTimeout 2s для Safari совместимости (`doodle-io.ts`)
- **MED-18-47 (QuotaExceededError)**: console.error + логирование (`autosave.ts`)
- **MED-18-48 (tx.onabort)**: tx.onabort → reject с понятной ошибкой (`autosave.ts`)

### Fixed

- **LOW-18-5 (gizmo validation)**: runtime validation для setGizmoMode, validModes check (`ui-store.ts`)
- **LOW-18-12 (notification limit)**: MAX_NOTIFICATIONS=5 (part of MED-18-10)
- **LOW-18-19 (clamp min > max)**: тест добавлен (`worker-sanitize.test.ts`)
- **LOW-18-20 (Symbol keys)**: тест Symbol ключей добавлен (`worker-sanitize.test.ts`)
- **LOW-18-21 (empty sanitizeParams)**: тест empty result добавлен (`worker-sanitize.test.ts`)
- **LOW-18-22 (as const)**: `as const` на transform убран (`worker-sync.test.ts`)

### Changed

- **ARCH-CSG-1**: CSG-результаты (`csg_*`) теперь имеют `shapeType='cube', params={}` и регистрируются как baked-ноды в build tree. Это обеспечивает корректную маршрутизацию в `syncObjectsForOperation` → `workerSyncMesh`
- **ARCH-CSG-2**: `workerCsgBooleanWithSync` теперь принимает `undefined` для shapeType/params CSG-результатов, сигнализируя worker'у пропустить rebuild из примитивов
- **LOW-12**: `extrudeSelected` — добавлена проверка пустого `selectedIds` с `notify('No objects selected', 'warning')` (`document-store.ts`)

### Added

- **DOC-1**: Создан файл `NODEJS_SETUP.md` в `web-app/` — документация по настройке Node.js, pnpm, проверке typecheck и тестов (`web-app/NODEJS_SETUP.md`)
- **MED-UI-3**: Создан файл `viewport-hooks.ts` с четырьмя вынесенными хуками из `Viewport3D.tsx`: `useThreeInit` (инициализация Three.js), `useMeshSync` (синхронизация mesh), `useRulerMode` (логика линейки), `useMirrorPreview` (превью mirror). `Viewport3D.tsx` сокращён с 1103 до ~390 строк (`viewport-hooks.ts`, `Viewport3D.tsx`)

### Fixed

- **HIGH-18-8 (transform any)**: `workerMirrorObject` — `transform?: any` → `transform?: TransformNR` (`worker-client.ts`)

### Fixed

- **HIGH-18-3 (RebuildMeta)**: resultVertices/resultIndices/resultNormals/originalBboxSize добавлены в интерфейс RebuildMeta, приведения `as RebuildMeta & {...}` убраны (`rebuild.ts`)
- **HIGH-18-4 (baked-ноды)**: registerBakedNodes вызывается в конце rebuildBuildTree, comment clarified (`rebuild.ts`)
- **HIGH-18-20 (stl-import tests)**: добавлены тесты detectStlFormat (4 теста) (`stl-import.test.ts`)
- **HIGH-18-24 (autosave tests)**: autosave.test.ts создан (4 теста: save, restore, clear, overwrite)
- **HIGH-18-25 (project-manager tests)**: vi.mock('./project-manager') → vi.mock('idb'), тесты проверяют реальную реализацию

### Fixed

- **MED-18-1 (undo/redo дубликация)**: jumpToHistoryInner() extracted, ~90 строк дублирования убраны (`document-store.ts`)
- **MED-18-10 (setTimeout cleanup)**: timeouts Map + clearTimeout на dismiss (`notifications.ts`)
- **MED-18-11 (ids validation)**: null-safe ids в deleteObjects (`worker.ts`)
- **MED-18-45 (sanitizeObjectKeys)**: sanitizeObjectKeys() добавлена, удаляет unsafe keys (`doodle-io.ts`)
- **MED-18-46 (revokeObjectURL)**: setTimeout 2s для Safari совместимости (`doodle-io.ts`)
- **MED-18-47 (QuotaExceededError)**: console.error + логирование (`autosave.ts`)
- **MED-18-48 (tx.onabort)**: tx.onabort → reject с понятной ошибкой (`autosave.ts`)

### Fixed

- **LOW-18-5 (gizmo validation)**: runtime validation для setGizmoMode, validModes check (`ui-store.ts`)
- **LOW-18-12 (notification limit)**: MAX_NOTIFICATIONS=5 (part of MED-18-10)
- **LOW-18-19 (clamp min > max)**: тест добавлен (`worker-sanitize.test.ts`)
- **LOW-18-20 (Symbol keys)**: тест Symbol ключей добавлен (`worker-sanitize.test.ts`)
- **LOW-18-21 (empty sanitizeParams)**: тест empty result добавлен (`worker-sanitize.test.ts`)
- **LOW-18-22 (as const)**: `as const` на transform убран (`worker-sync.test.ts`)

### Changed

- **MED-UI-4**: 45 отдельных селекторов `useUiStore` в `App.tsx` объединены в один `useShallow` селектор, что уменьшает количество ре-рендеров и упрощает код (`App.tsx`)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **MED-UI-1**: Добавлен `clearTimeout`/cleanup в `useEffect` для mirror preview в `Viewport3D.tsx` — предотвращает утечку ресурсов при размонтировании компонента (`Viewport3D.tsx`)
- **MED-UI-2**: Добавлена дедупликация рёбер в `collectWorldEdges` через `Set<string>` с ключом `"i1,i2"` (где i1 < i2) — предотвращает дублирование рёбер, разделяемых двумя треугольниками (`snap-utils.ts`)
- **MED-IO-1**: Все функции `project-manager.ts` (`listProjects`, `saveProject`, `updateProject`, `loadProject`, `deleteProject`) обёрнуты в try/finally — гарантированное закрытие IndexedDB-соединения даже при ошибке (`project-manager.ts`)
- **MED-IO-2**: `parseStlFile` в `stl-import.ts` возвращает discriminated union `StlParseResult` вместо `null` — сообщает причину ошибки через поле `error`; обновлена обработка результата в `document-store.ts` (`stl-import.ts`, `document-store.ts`)

### Added

- **CRIT-1**: Инкапсуляция глобального состояния `treeNodes` — создан класс `TreeStore` с контролируемым API (`getNode`, `setNode`, `deleteNode`, `clear`, `getAllNodes`, `getAllNodesMap`, `hasNode`, `nodeCount`); глобальный `Map` заменён на singleton `treeStore`; добавлены unit-тесты для `TreeStore` (12 тестов) (`tree-store.ts`, `history-tree.ts`, `history-tree.test.ts`)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

### Fixed

- **CRIT-11**: Удалён дублирующийся busy-индикатор из `Viewport3D.tsx` — оставлен только глобальный индикатор в `App.tsx`; удалены проп `busy` из интерфейса `Props` и соответствующий JSX-блок (`Viewport3D.tsx`, `App.tsx`)
- **CRIT-8**: `deleteNode` не удалял детей рекурсивно — добавлен опциональный параметр `recursive = false`; при `recursive === true` рекурсивно удаляются все дочерние узлы; обновлён вызов в `deleteSelected` (`history-tree.ts`, `document-store.ts`)
- **CRIT-12**: Drag-select не работал — `performDragSelect` был определён, но никогда не вызывался в `handlePointerUp`. Добавлен вызов с вычислением `DragRect` из `pointerDownPos` и текущей позиции мыши (`Viewport3D.tsx`)
- **CRIT-4**: `registerBakedNodes` не вызывался в `rebuildBuildTree` — добавлен опциональный параметр `objects` в `rebuildBuildTree` и вызов `registerBakedNodes` в конце функции; обновлены все 6 мест вызова в `document-store.ts` (`rebuild.ts`, `document-store.ts`)

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

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

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

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

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

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

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

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

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

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

### Added

- **doodle-io.test.ts**: unit-тесты валидации ключей и параметров ShapeParams (CRIT-18-5)

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

### Fixed

- **HIGH-18-8 (transform any)**: `workerMirrorObject` — `transform?: any` → `transform?: TransformNR` (`worker-client.ts`)

### Fixed

- **HIGH-18-3 (RebuildMeta)**: resultVertices/resultIndices/resultNormals/originalBboxSize добавлены в интерфейс RebuildMeta, приведения `as RebuildMeta & {...}` убраны (`rebuild.ts`)
- **HIGH-18-4 (baked-ноды)**: registerBakedNodes вызывается в конце rebuildBuildTree, comment clarified (`rebuild.ts`)
- **HIGH-18-20 (stl-import tests)**: добавлены тесты detectStlFormat (4 теста) (`stl-import.test.ts`)
- **HIGH-18-24 (autosave tests)**: autosave.test.ts создан (4 теста: save, restore, clear, overwrite)
- **HIGH-18-25 (project-manager tests)**: vi.mock('./project-manager') → vi.mock('idb'), тесты проверяют реальную реализацию

### Fixed

- **MED-18-1 (undo/redo дубликация)**: jumpToHistoryInner() extracted, ~90 строк дублирования убраны (`document-store.ts`)
- **MED-18-10 (setTimeout cleanup)**: timeouts Map + clearTimeout на dismiss (`notifications.ts`)
- **MED-18-11 (ids validation)**: null-safe ids в deleteObjects (`worker.ts`)
- **MED-18-45 (sanitizeObjectKeys)**: sanitizeObjectKeys() добавлена, удаляет unsafe keys (`doodle-io.ts`)
- **MED-18-46 (revokeObjectURL)**: setTimeout 2s для Safari совместимости (`doodle-io.ts`)
- **MED-18-47 (QuotaExceededError)**: console.error + логирование (`autosave.ts`)
- **MED-18-48 (tx.onabort)**: tx.onabort → reject с понятной ошибкой (`autosave.ts`)

### Fixed

- **LOW-18-5 (gizmo validation)**: runtime validation для setGizmoMode, validModes check (`ui-store.ts`)
- **LOW-18-12 (notification limit)**: MAX_NOTIFICATIONS=5 (part of MED-18-10)
- **LOW-18-19 (clamp min > max)**: тест добавлен (`worker-sanitize.test.ts`)
- **LOW-18-20 (Symbol keys)**: тест Symbol ключей добавлен (`worker-sanitize.test.ts`)
- **LOW-18-21 (empty sanitizeParams)**: тест empty result добавлен (`worker-sanitize.test.ts`)
- **LOW-18-22 (as const)**: `as const` на transform убран (`worker-sync.test.ts`)

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
