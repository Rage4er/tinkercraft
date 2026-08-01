# 🔍 Код-ревью: TinkerCraft Web

**Дата:** 2025-07-15
**Ревьюер:** Koda AI
**Версия проекта:** 0.0.1
**Стек:** React 18 + TypeScript 5.7 + Three.js 0.170 + Zustand 5 + manifold-3d (WASM) + Vite 6 + pnpm

> **Формат:** Этот файл содержит только **активные** (неисправленные) проблемы. Исправленные проблемы перенесены в [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md).

---

## 📋 Активные проблемы

### 🔴 Раунд 17 + SourceCraft — Код-ревью (15 проблем, верифицированы)

**Дата ревью:** 2025-07-31
**Ревьюеры:** Koda AI, SourceCraft Code Assistant
**Точность:** ~83% (12.5/15 подтверждено, 1 ошибка, 2 переоценки)

#### 🔴 Критические (2)

| # | Проблема | Файл | Severity | Описание | Решение |
|---|----------|------|----------|----------|---------|
| | **CRIT-17-1** | [`history-tree.ts:275-282`](web-app/src/csg/history-tree.ts:275) | **CRITICAL** | `computeNodeHash` для boolean-узлов **не включает** `localTransform`. При изменении позиции/вращения/масштаба CSG-результата кэш не инвалидируется → stale данные. | Добавить `localTransform` в строку хеша boolean-узла: `return \`${node.operation}\|${tStr}\|${childHashes.join('|')}\`` |
| | **CRIT-17-2** | [`document-store.ts:983-1026`](web-app/src/store/document-store.ts:983) | **CRITICAL** | В `resizeObject` (else-ветка для CSG-результатов) отсутствует `try/catch` вокруг `await rebuildNode(id)`. При ошибке — молчаливая неудача, объект не обновляется, пользователь не видит ошибки. | Обернуть блок в `try/catch` и вызвать `notify` при ошибке. |

#### 🟡 Среднее и высокое (5)

| # | Проблема | Файл | Severity | Описание | Решение |
|---|----------|------|----------|----------|---------|
| | **HIGH-1** | [`document-store.ts:341-680`](web-app/src/store/document-store.ts:341) | **HIGH** | Дублирование логики синхронизации Worker cache в 3+ местах (`csgBoolean`, `previewMirror`, `mirrorSelected`). ~100 строк почти идентичного кода. | Вынести в функцию `syncObjectsForOperation(ids, objects)` |
| | **HIGH-2** | [`document-store.ts:820`](web-app/src/store/document-store.ts:820) | **HIGH** | `alignSelected` перестраивает меши примитивов через `workerBuildShape` вместо `workerSyncObjects`. Лишняя нагрузка на WASM (~5-10ms на объект). | Использовать `workerSyncObjects` для обновления только трансформации. |
| | **HIGH-3** | [`history-tree.ts:214-238`](web-app/src/csg/history-tree.ts:214) | **MEDIUM** | `computeBakedBBox` применяет только translation (`+ transform.x/y/z`), игнорируя `rot` и `scale`. BBox вращённых/масштабированных STL мешей неверен → ломает Box Selection. | Использовать `buildTransformMatrix` для проекции вершин при вычислении BBox. |
| | **HIGH-4** | [`document-store.ts:238-267`](web-app/src/store/document-store.ts:238) | **MEDIUM** | `pasteClipboard` не регистрирует вставленные объекты в Build Tree. Fallback-логика в `csgBoolean`/`mirrorSelected` создаёт `baked` ноду вместо `primitive` — потеря параметричности. | Добавить `createPrimitiveNode`/`createBakedNode` в `pasteClipboard`. |
| | **HIGH-5** | [`document-store.ts:844-845`](web-app/src/store/document-store.ts:844) | **HIGH** | `rebuildBuildTree` существует, но **нигде не вызывается**. После `openDoodle`/`restoreAutosave` дерево сборки пусто → CSG/Mirror работают через медленные fallback. | Вызвать `rebuildBuildTree(ops)` после `rebuildFromHistory` в `undo`, `redo`, `openDoodle`, `restoreAutosave`. |

#### 🟢 Низкое (8)

| # | Проблема | Файл | Severity | Описание | Решение |
|---|----------|------|----------|----------|---------|
| | **LOW-1** | [`Viewport3D.tsx:704`](web-app/src/components/Viewport3D.tsx:704) | **MEDIUM** | `findNearestSnap` вызывается без `shapeTypeForMesh` → `circleCenter` всегда `null`. Circle-snap (центр объекта) недоступен. | Собрать маппинг `id → shapeType` из `meshMapRef` и передать в `findNearestSnap`. |
| | **LOW-2** | [`Viewport3D.tsx:660-681`](web-app/src/components/Viewport3D.tsx:660) | **LOW** | `getWorldPointFromPointer` — мёртвый код (нигде не вызывается). Проецирует на Y=0, rulerMode на Z=0. | Удалить функцию. Рефакторить дублирование в ruler-коде. |
| | **LOW-3** | [`document-store.ts`](web-app/src/store/document-store.ts) | **LOW** | `console.error` вместо `notify` в `applyFillet`, `mirrorSelected`, `csgBoolean`, `resizeObject`. Нет обратной связи для пользователя. | Заменить `console.error` на `notify(message, 'error')`. |
| | **LOW-4** | [`document-store.ts:1068`](web-app/src/store/document-store.ts:1068) | **LOW** | `slabId` (временный куб для extrude) не удаляется из кэша воркера после CSG. Засорение кэша при многократной экструзии. | Вызвать `workerDeleteObjects([slabId])` после получения результата. |
| | **LOW-5** | [`snapshots.ts`](web-app/src/store/snapshots.ts) | **LOW** | `Map<number, SceneObject>` растёт бесконечно. `SceneObject` содержит `Float32Array`. При长线-сессии (200+ операций) — 50-100MB. | Добавить LRU-стратегию (удаление старых snapshot'ов при превышении лимита). |
| | **LOW-6** | [`document-store.ts:361-362`](web-app/src/store/document-store.ts:361) | **LOW** | `await syncOperand(idA)` / `await syncOperand(idB)` выполняются последовательно. | Заменить на `Promise.all([syncOperand(idA), syncOperand(idB)])`. |
| | **LOW-7** | [`history-tree.ts:312`](web-app/src/csg/history-tree.ts:312) | **LOW** | `invalidateCache` рекурсивна без защиты. При повреждённом дереве — `RangeError: Maximum call stack size exceeded`. | Добавить счётчик глубины (guard clause, `MAX_DEPTH = 100`). |
| | **LOW-8** | [`constants.ts:31-43`](web-app/src/constants.ts:31) | **LOW** | `OP_FILTER_LABELS` — смесь языков: "Добавить" (рус), "Move" (англ), "Resize" (англ). | Стандартизировать все метки на русский язык. |

### ❌ Отозванные проблемы (False Positives)

| # | Проблема | Причина отзыва |
|---|----------|----------------|
| | CRIT-NEW-2: `resizeObject` не обновляет snapshot | `cacheSnapshotWithTree` ЕСТЬ на строке 1025 — ошибка чтения кода |
| | HIGH-NEW-3: `extrudeSelected` slab в дереве | Slab — временный объект, undo/redo использует `resultVertices` из `GroupOperation` |
| | God Component (разделение файлов) | Zustand `create<DocumentStore>()` не поддерживает разделение без middleware |
| | `busy` не сбрасывается в `resizeObject` | `busy` не устанавливается в true для else-ветки — проблема в отсутствии `try/catch`, а не busy |

---

### ⚠️ Раунд 16 — Код-ревью (18 проблем, верифицированы)

#### 🔴 Критические (4)

| # | Проблема | Файл | Вердикт верификации | Скорректированный приоритет |
|---|----------|------|---------------------|---------------------------|
| | CRIT-R16-1 | `handleRebuildScene` без `try/finally` — утечка WASM-памяти при ошибках | [`worker-handlers.ts:756`](web-app/src/csg/worker-handlers.ts:756) | ⚠️ Частично верно — утечка временная, до следующего rebuild | ✅ Исправлено |
| | CRIT-R16-2 | Мутация `vertices` в `extractAndCenter` — неожиданный побочный эффект | [`helpers.ts:29`](web-app/src/store/helpers.ts:29) | ⚠️ Верно, но преувеличено — JSDoc уже документирует поведение | ✅ Исправлено |
| | CRIT-R16-3 | `any` в `collectSubtreeForWorker` и `applyCSGMeshes` | [`history-tree.ts:366`](web-app/src/csg/history-tree.ts:366) | ✅ Верно — нарушение strict: true | ✅ Исправлено |
| | CRIT-R16-4 | `JSON.stringify` в `computeNodeHash` — проблема производительности | [`history-tree.ts:254`](web-app/src/csg/history-tree.ts:254) | ✅ Верно, но severity спорный — вызывается только при rebuild | ✅ Исправлено |

#### ⚡ Производительность (4)

| # | Проблема | Файл | Вердикт | Статус |
|---|----------|------|---------|--------|
| | PERF-R16-1 | Двойной проход по вершинам в `extractAndCenterGetAABB` | [`helpers.ts:44`](web-app/src/store/helpers.ts:44) | ❌ Неверно — функция не вызывает `computeAABB`, два прохода неизбежны | ❌ Закрыто |
| | PERF-R16-2 | `Array.from()` в hot path | [`history-tree.ts:446`](web-app/src/csg/history-tree.ts:446) | ⚠️ Частично неверно — только в одной из двух указанных функций | ✅ Исправлено |
| | PERF-R16-3 | Избыточные ререндеры через Zustand | — | ⚠️ Вводит в заблуждение — 32/33 уже с селекторами | ✅ Исправлено |
| | PERF-R16-4 | `computeVertsHash` — возможны коллизии | [`Viewport3D.tsx:68`](web-app/src/components/Viewport3D.tsx:68) | ✅ Верно — сумма произведений для симметричных мешей | ✅ Исправлено |

#### 📝 Читаемость (4)

| # | Проблема | Файл | Вердикт | Статус |
|---|----------|------|---------|--------|
| | CODE-R16-1 | Дублирование матричной математики | [`rebuild.ts:154`](web-app/src/store/rebuild.ts:154), [`worker-matrix.ts:15`](web-app/src/csg/worker-matrix.ts:15) | ✅ Верно | ✅ Исправлено |
| | CODE-R16-2 | Магические числа в Viewport3D | [`Viewport3D.tsx:97`](web-app/src/components/Viewport3D.tsx:97) | ✅ Верно | ✅ Исправлено |
| | CODE-R16-3 | Смешение русского и английского в комментариях |多处 | ✅ Верно | ✅ Исправлено |
| | CODE-R16-4 | `GizmoMode` с `null` как значение | [`ui-store.ts:11`](web-app/src/store/ui-store.ts:11) | ✅ Верно | ✅ Исправлено |

#### 🔒 Безопасность (3)

| # | Проблема | Файл | Вердикт | Статус |
|---|----------|------|---------|--------|
| | SEC-R16-1 | Отсутствие валидации входящих данных в worker | [`worker.ts`](web-app/src/csg/worker.ts) | ✅ Верно — `as unknown as` касты без валидации | ✅ Исправлено |
| | SEC-R16-2 | `try/catch` с пустым `catch` | [`worker-handlers.ts:104,930`](web-app/src/csg/worker-handlers.ts:104) | ⚠️ Частично неверно — только в worker-handlers.ts, не в document-store.ts | ✅ Исправлено |
| | SEC-R16-3 | `setCached` без проверки на disposed объекты | [`worker-handlers.ts:108`](web-app/src/csg/worker-handlers.ts:108) | ✅ Верно, но низкая ценность — вызывается с только что созданными объектами | ✅ Исправлено |

#### 🧪 Тестирование (3)

| # | Проблема | Файл | Вердикт | Статус |
|---|----------|------|---------|--------|
| | TEST-R16-1 | Нет тестов для критических функций | — | ⚠️ Частично неверно — `buildRebuildMeta` тестируется | ⚠️ Открыто |
| | TEST-R16-2 | Тесты используют `as any` для обхода типов | — | ⚠️ Преувеличено/устарело — всего 1 `as any` в history-tree.test.ts | ✅ Исправлено |
| | TEST-R16-3 | Нет тестов для `snap-utils.ts` | [`snap-utils.ts`](web-app/src/components/snap-utils.ts) | ✅ Верно — 468 строк без тестов | ✅ Исправлено |

---

## ✅ Исправленные проблемы (сводка)

Полная история исправлений с деталями — в [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md).

| Раунд | Проблемы | Статус |
|-------|----------|--------|
| **Раунд 1** (2025-07-15) | CRIT-1 (God Component), CRIT-2 (store разделение), CRIT-3 (не баг), WARN-1..8, SEC-1/2, PERF-1/2/3, TEST-1, COSM-1/2/3 | ✅ Все исправлены |
| **Раунд 3** (2025-07-16) | CRIT-R3-1/2/3, WARN-R3-1..8, PERF, TEST, STRUCT | ✅ Все исправлены |
| **Раунд 4** (2026-07-16) | CRIT-R4-1/2/3, WARN-R4-1..7, LOW-R4-1/2/3 | ✅ Все исправлены |
| **Раунд 5** (2026-07-16) | CRIT-R5-1/2, WARN-R5-1/2/3, LOW-R5-1/2/3, Worker cache sync | ✅ Все исправлены |
| **Раунд 6** (2026-07-16) | CRIT-R6-1/2/3, WARN-R6-1..6, PERF-R6-1/2, Q-R6-1/2/3, SEC-R6-1 | ✅ Все исправлены |
| **Раунд 7** (2026-07-16) | ERR-1..6, PART-1..6 — верификация, точность ~78% | ✅ Задокументировано |
| **Раунд 8** (2026-07-16) | CRIT-R8-1/2/3 (WASM leak, race condition, Prototype Pollution) | ✅ Все исправлены |
| **Раунд 9** (2026-07-21) | CRIT-CSG-1/2/3 (CSG координаты, цепочка CSG) | ✅ Все исправлены |
| **Раунд 11** (2026-07-21) | UX-2/3/4 (фильтры, extrude, mirror) | ✅ Все исправлены |
| **Раунд 12** (2026-07-21) | CRIT-MIRROR-1, UX-5 (mirror rotation, ruler click-click) | ✅ Все исправлены |
| **Раунд 14** (2026-07-21) | CRIT-MIRROR-1/2, CRIT-RESIZE-1/2, UX-5/6 | ✅ Все исправлены |
| **Раунд 15** (2026-07-21) | CRIT-RESIZE-1/2, UX-6 | ✅ Все исправлены |
| **BUG-CSG-POS** (2026-07-25) | BUG-CSG-POS-1/2 (CSG позиционирование, stale cache) | ✅ Исправлено |
| **BUG-CSG-POS-5/6** (2026-07-26) | BUG-CSG-POS-5/6 (moveTreeNode рекурсия, двойное TRS) | ✅ Исправлено |
| **Раунд 16 — 17 исправлений** (2026-07-26) | CRIT-R16-1..4, PERF-R16-2/3/4, CODE-R16-1/2/3/4, SEC-R16-1/2/3, TEST-R16-2/3 | ✅ Исправлено |
| **Mirror HIGH** (2026-07-30) | MIRROR-3, MIRROR-5, MIRROR-8 | ✅ Исправлено |
| **Mirror MEDIUM** (2026-07-30) | MIRROR-1, MIRROR-6, MIRROR-7, MIRROR-10 | ✅ Исправлено |
| **Mirror LOW** (2026-07-31) | MIRROR-2 (live preview), MIRROR-4 (3D plane), MIRROR-9 (double sync) | ✅ Исправлено |
| **Раунд 17 + SourceCraft** (2025-07-31) | CRIT-17-1 (boolean hash), CRIT-17-2 (resizeObject try/catch), HIGH-1..5, LOW-1..8 | ✅ Все исправлены |
| **SourceCraft — 38 проблем** (2026-07-31) | CRIT-1..12 (treeNodes, busy, drag-select, WASM leak, etc.), MED Store/CSG/UI/IO (12), LOW (12) | ✅ Все исправлены |
| **Mirror boolean/non-manifold** (2026-08-01) | MIRROR-BOOLEAN (finalTransform из centroid), MIRROR-NONMANIFOLD (workerMirrorObject для import_mesh) | ✅ Исправлено |

---

## 🎯 План действий (приоритет)

На данный момент все 55 проблем (15 из Раунда 17 + 38 из SourceCraft + 2 mirror) исправлены.
Активных задач нет.

Следующие раунды код-ревью будут направлены на выявление новых проблем.

---

## 📊 Сводка

| Метрика | Значение |
|---------|----------|
| Всего выявлено проблем | ~110+ (за всё время) |
| Исправлено | ~110+ |
| Активных | 0 |
| Точность ревью (Раунд 16) | ~50% (8/18 полностью верных) |
| Точность ревью (Раунд 17 + SourceCraft) | ~83% (12.5/15 подтверждено) |

---

*Полная история всех код-ревью с детальным описанием каждого раунда: [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md)*
