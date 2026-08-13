# 🔍 Код-ревью: TinkerCraft Web

**Дата:** 2025-07-15
**Ревьюер:** Koda AI
**Версия проекта:** 0.0.1
**Стек:** React 18 + TypeScript 5.7 + Three.js 0.170 + Zustand 5 + manifold-3d (WASM) + Vite 6 + pnpm

> **Формат:** Этот файл содержит только **активные** (неисправленные) проблемы. Исправленные проблемы перенесены в [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md).

---

## 📋 Активные проблемы

> **Статус: ✅ Активных проблем нет.** Все выявленные проблемы закрыты
> (исправлены или признаны архитектурными / «не багами»).
> Детальная история каждого раунда — в [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md).

---

### ✅ ИСПРАВЛЕНО — CYCLE-CSG (Cannot create cycle in tree при rebuildBuildTree) (2026-08-08)

**Проблема:** Ошибка `Cannot create cycle in tree: obj_7 → csg_8 or obj_5 → csg_8` при `jumpToHistory`, `loadFromProject`, `undo/redo`. При восстановлении дерева из истории boolean-узлы создавались без проверки существования детей (`op.ids[0]`, `op.ids[1]`). Дети могли быть удалены из `objects` (через `delete`), но оставаться в операции `group` → `createBooleanNode` падал с ошибкой циклической зависимости.

**Корень проблемы:** В `rebuildBuildTree` (`rebuild.ts`) при обработке `group` операции не проверялось, что дети уже зарегистрированы в дереве. `isAncestor` в `createBooleanNode` (`history-tree.ts`) проверял циклы через `parentId`, но если дети отсутствовали в дереве — проверка не срабатывала.

**Решение:**
1. Добавлена проверка `getNode(childAId)` и `getNode(childBId)` перед `createBooleanNode`
2. Если один из детей отсутствует — операция пропускается с `console.warn`
3. Улучшено логирование ошибки при создании boolean-узла (выводятся childA/childB и операция)
4. Используется `continue` вместо `break` для корректной обработки оставшихся операций

**Файлы:** `rebuild.ts` (добавлена проверка существования детей, улучшено логирование)

---

### ✅ ЗАВЕРШЕНО — 7.5.4: Тесты цепочек операций (2026-08-08)

**15 тестов в `build-chain.test.ts`, 5 групп:**

1. **CSG цепочки** (3 теста): union/subtract/intersect, вложенный CSG (cube→union+cyl→union+sphere), parentId chain
2. **Mirror + CSG** (2 теста): mirror YZ→union со сферой, multi-select mirror
3. **Undo/Redo через CSG** (3 теста): undo удаляет boolean-ноду, redo воссоздаёт, глубокий 5-шаговый undo/redo
4. **Jump to history** (4 теста): jump к середине цепочки, jump с delete после CSG, jump с delete child CSG, jump через delete→redo
5. **Edge cases** (3 теста): пустая история, несколько CSG с разными types, CSG с move после

**Результат:** 220/220 тестов проекта проходят. Build tree корректно восстанавливается из истории операций.

**Файлы:** `src/store/build-chain.test.ts`

## 📊 Сводка по раундам

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
| **Раунд 17 + SourceCraft** (2025-07-31) | CRIT-17-1 (boolean hash), CRIT-17-2 (resizeObject try/catch), HIGH-1..5, LOW-1..8 | ✅ Все исправлены |
| **SourceCraft — 38 проблем** (2026-07-31) | CRIT-1..12 (treeNodes, busy, drag-select, WASM leak, etc.), MED Store/CSG/UI/IO (12), LOW (12) | ✅ Все исправлены |
| **Mirror boolean/non-manifold** (2026-08-01) | MIRROR-BOOLEAN (finalTransform из centroid), MIRROR-NONMANIFOLD (workerMirrorObject для import_mesh) | ✅ Исправлено |
| **Раунд 18 — 138 проблем** (2026-08-01) | CRIT-18 (5), HIGH-18 (27), MED-18 (56), LOW-18 (50) — 4 слоя (Store, CSG, UI, IO) | ✅ Все закрыты (64 исправлено, 74 архитектурно/НЕ БАГ) |
| **Раунд 19 — 12 проблем** (2026-08-02) | MIRROR-19-1..12 (глубокий аудит mirror) | ✅ Все закрыты (6 исправлено, 5 неактуально, 1 «не баг») |
| **Раунд 20 — CSG-PARAM** (2026-08-03) | CSG-PARAM-1/2/3 (createBakedNode→createBooleanNode, localTransform, дубликаты createPrimitiveNode) | ✅ **Все исправлены** |
| **MIRROR-CSG-RS** (2026-08-07) | MIRROR-CSG-RS (потеря rotation/scale при булевых операциях над зеркальными CSG-результатами) | ✅ **Исправлено** |
| **CYCLE-CSG** (2026-08-08) | CYCLE-CSG (Cannot create cycle in tree — дети CSG-операции отсутствуют при rebuildBuildTree) | ✅ **Исправлено** |
| **7.5.4 — Тесты цепочек** (2026-08-08) | 15 тестов: CSG-цепочки, Mirror+CSG, Undo/Redo, Jump to history | ✅ **Завершено** |
| **7.5.5 — Финальная полировка** (2026-08-13) | devLog, IconButton, тултипы, Layout тулбара, [DIAG:*] → dev mode, иконки Timeline, имя проекта в PropertiesPanel, тултипы Align | ✅ **Завершено** |
| **Фаза 7 — Завершение** (2026-08-05) | Все проблемы Раундов 16–20 верифицированы и закрыты. Фаза 7 официально завершена. | ✅ **Завершена** |
| **Фаза 7.5 — Параметрический скелет** (2026-08-05) | Инфраструктура: createBooleanNode ✅, rebuild boolean ✅, mirror-store ✅, syncObjectsForOperation ✅. Тестирование цепочек ✅, финальная полировка ✅. | ✅ **Завершена** |

---

## 📊 Итоговая статистика

| Метрика | Значение |
|---------|----------|
| Всего выявлено проблем | ~291 (за всё время) |
| Исправлено | ~176 |
| Архитектурные / НЕ БАГ | ~115 |
| **Активных проблем** | **0** |
| **Фаза 7** | **✅ Завершена (2026-08-05)** |
| **Фаза 7.5** | **✅ Завершена (2026-08-13)** |
| **Фаза 7.6** | **✅ Завершена (2026-08-13)** |
| Точность ревью (Раунд 16) | ~50% (8/18 полностью верных) |
| Точность ревью (Раунд 17 + SourceCraft) | ~83% (12.5/15 подтверждено) |
| Точность ревью (Раунд 18) | ✅ ЗАВЕРШЕНО (138/138 закрыто) |
| Точность ревью (Раунд 19 — Mirror) | ✅ ЗАВЕРШЕНО (12/12 закрыто) |
| Точность ревью (Раунд 20 — CSG-PARAM) | 100% (3/3 подтверждено, ✅ исправлено) |

### Ключевые выводы

1. **Mirror — самая проблемная фича проекта**: 12 проблем Раунда 19, из них 2 CRITICAL и 4 HIGH. Фундаментальные проблемы с mirrorCenter (локальные vs мировые координаты), multi-select preview, утечкой preview-узлов. Все устранены.
2. **Утечки памяти** — главная проблема проекта: Three.js (BufferAttribute, TransformControls, ViewCube), WASM (manifold-объекты в handleCsgBooleanSync), IndexedDB (соединения), preview-узлы build tree. Все устранены.
3. **Типобезопасность** — множественные `as unknown as`, `any`, index signature ослабляют strict mode TypeScript. Ключевые устранены (ShapeParams, RebuildMeta, isCsgResult).
4. **Архитектура IO** — отсутствие единой системы типов ошибок и унифицированного подхода к обработке ошибок (признано архитектурной задачей).
5. **Производительность snap-utils** — избыточное создание объектов Vector3 в горячем цикле raycasting. Оптимизировано (reuse Vector3, убран второй Raycaster).
6. **Параметрические CSG** — инфраструктура готова (build tree ✅, rebuildFromHistory ✅, applyCSGMeshes ✅), все 3 изменения CSG-PARAM применены ✅. Фаза 7.5 завершит интеграцию.
7. **Фаза 7.5** — мост между текущим состоянием и параметрическим будущим. Инфраструктура реализована, нужно тестирование цепочек и финальная полировка.

---

*Полная история всех код-ревью с детальным описанием каждого раунда: [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md)*

---

## 🔴 MIRROR-CSG-RS — Потеря rotation/scale при булевых операциях над зеркальными CSG-результатами (2026-08-07)

**Приоритет:** CRITICAL
**Статус:** ✅ **ИСПРАВЛЕНО**

### Проблема

После зеркалирования CSG-объекта (с rotation/scale) последующие булевы операции теряли параметры дочерних фигур (rotation, scale).

**Корневая причина — двойная:**

1. **`handleSyncMesh`** (worker-handlers.ts) применял **только трансляцию** к геометрии CSG-объекта, игнорируя rotation/scale в transform. Для зеркальных CSG-результатов (baked, с rotation/scale в transform) это означало, что булевы операции оперировали **неповёрнутой/немасштабированной** геометрией — терялись все параметры дочерних фигур.

2. **`csgBoolean` `ensureInTree`** регистрировал CSG-результаты как `createPrimitiveNode(id, 'cube', {})` — placeholder cube с пустыми params. При последующем rebuild из дерева (mirror, undo/redo) вместо реальной CSG-геометрии строился дефолтный куб 20×20×20 — «параметры детей обнуляются».

### Исправление

1. **`handleSyncMesh`**: теперь применяет **полный TRS** (rotation + scale + position) через `buildTransformMatrix`, когда transform содержит не-identity rotation/scale. Fast path — только translation — сохранён для обычных CSG-результатов.

2. **`handleRebuildTreeNode`** (baked-нода): аналогично — полный TRS при наличии rotation/scale.

3. **`transformBakedMesh`** (history-tree.ts): аналогично — полный TRS при наличии rotation/scale.

4. **`rebuildFromHistory`**: больше **не запекает** RS (rotation/scale) в вершины. Вершины остаются центрированными (TRS применяется при рендере через pivot и в worker для CSG-булевых).

5. **`csgBoolean` `ensureInTree`**: CSG-результаты теперь регистрируются как **baked-ноды** (готовый меш + полный transform), а не placeholder cube с пустыми params.

### Файлы

`worker-handlers.ts`, `history-tree.ts`, `document-store.ts`, `rebuild.ts`

---

## 🪞 Mirror Pipeline — Раунд 9 (2025-08-07)

**Проблемы, найденные при анализе production-логов:**

| ID | Проблема | Статус | Файлы |
|----|----------|--------|-------|
| **MIRROR-R9-1** | Дублирование preview+confirm (mirrorObject x2) | ✅ ИСПРАВЛЕНО | `mirror-store.ts` |
| **MIRROR-R9-2** | Тройной syncObjectsForOperation (preview hover YZ→XZ→XY) | ✅ ИСПРАВЛЕНО | `mirror-store.ts` |
| **MIRROR-R9-3** | Дубль moveObject с одинаковыми параметрами | ✅ ИСПРАВЛЕНО | `document-store.ts` |
| **MIRROR-R9-4** | Кэш не инвалидировался при изменениях сцены | ✅ ИСПРАВЛЕНО | `document-store.ts`, `mirror-store.ts` |

**Решения:**
1. **MIRROR-CACHE**: `previewMirror` сохраняет результаты в `mirrorCache`, `mirrorSelected` проверяет кэш по plane+ids+transformHash — skip full rebuild.
2. **MIRROR-CACHE-SYNC**: `previewMirror` проверяет кэш перед `syncObjectsForOperation` — skip sync при hover без изменений.
3. **MIRROR-DELTA-EP**: `moveObject` проверяет delta < 1e-6 по всем 9 параметрам — skip near-identical calls.
4. **MIRROR-CACHE-INVALIDATE**: `invalidateMirrorCache()` вызывается в 14 мутирующих методах.

---

## 📌 Будущие направления

### Параметрическая история операций (Фаза 8)

Следующий этап улучшения после завершения всех раундов ревью:

- **Раскрытие CSG-операций** в Timeline — редактирование состава operand-ов и типа boolean операции
- **Редактирование параметров** примитивов прямо в истории (width/height/depth, radius, segments)
- **Перестроение цепочки** при изменении любого шага — `rebuildFromHistory(ops.slice(0, index + 1))`
- **Edit modal** для fillet, extrude, mirror — изменение параметров без undo/redo
- **Undo для edit** — запись предыдущего состояния в историю

Базовая инфраструктура уже готова: история операций ✅, build tree ✅, rebuildFromHistory ✅, boolean-ноды в дереве ✅ (CSG-PARAM-1). Нужно только UI.
