# 🔍 Код-ревью: TinkerCraft Web

**Дата:** 2025-07-15
**Ревьюер:** Koda AI
**Версия проекта:** 0.0.1
**Стек:** React 18 + TypeScript 5.7 + Three.js 0.170 + Zustand 5 + manifold-3d (WASM) + Vite 6 + pnpm

> **Формат:** Этот файл содержит только **активные** (неисправленные) проблемы. Исправленные проблемы перенесены в [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md).

---

## 📋 Активные проблемы

### 🔴 Раунд 19 — Глубокий аудит Mirror (12 проблем)

**Дата ревью:** 2026-08-02
**Ревьюер:** SourceCraft Code Assistant (Ask режим)
**Объём:** 7 файлов (document-store.ts, history-tree.ts, rebuildOps.ts, worker-handlers.ts, rebuild.ts, viewport-hooks.ts, ui-store.ts)

> **Важное замечание:** Проблемы MIRROR-1..10 из предыдущих раундов (Раунды 11–15, 17) были помечены как исправленные, однако глубокий аудит показал, что **фундаментальные проблемы остались**. Новые проблемы MIRROR-19-1..12 отражают актуальное состояние кода.

#### Сводка

| # | Проблема | Файл | Severity | Описание |
|---|----------|------|----------|----------|
| | **MIRROR-19-1** | [`document-store.ts:601-608`](web-app/src/store/document-store.ts:601) | **CRITICAL** | `mirrorCenter` вычисляется из `computeAABB(obj.vertices)` (локальные координаты) вместо `obj.transform` (мировые). Для объекта с `transform.x=20` AABB даёт `x=100` (начальная позиция создания), в результате `x' = 2*100 - 20 = 180` вместо правильного `x' = 2*20 - 20 = 20`. |
| | **MIRROR-19-2** | [`document-store.ts:612`](web-app/src/store/document-store.ts:612) | **CRITICAL** | `const id = ids[0]` — preview работает только для ПЕРВОГО выделенного объекта. Multi-select полностью игнорируется. |
| | **MIRROR-19-3** | [`document-store.ts:625-634`](web-app/src/store/document-store.ts:625) | **HIGH** | Утечка preview-узлов в build tree. Каждый вызов `previewMirror` создаёт `mirror_preview_${nextId()}`, но НИКОГДА не удаляет предыдущие. В логах обнаружено 14 preview-узлов. |
| | **MIRROR-19-4** | [`document-store.ts:593-648`](web-app/src/store/document-store.ts:593) | **HIGH** | Race condition в preview: нет debounce/throttle, нет отмены предыдущего запроса. Быстрое наведение на разные кнопки плоскости вызывает каскад параллельных rebuild. |
| | **MIRROR-19-5** | [`document-store.ts:593-648`](web-app/src/store/document-store.ts:593) | **HIGH** | Preview-узлы не очищаются после confirm mirror. После `mirrorSelected` в дереве остаются `mirror_preview_*` узлы, которые никогда не удаляются. |
| | **MIRROR-19-6** | [`document-store.ts:114`](web-app/src/store/document-store.ts:114) | **HIGH** | Детекция CSG-результата — хрупкий хак: `shapeType === 'cube' && !params.width`. Любой куб с параметром `width=0` (или undefined) будет ошибочно определён как CSG-результат. |
| | **MIRROR-19-7** | [`history-tree.ts:744`](web-app/src/csg/history-tree.ts:744) | **MEDIUM** | `baked` без `localTransform` молча пропускается в `mirrorNodeRecursive`. Если у baked-ноды нет `localTransform`, она не получает зеркального transform. |
| | **MIRROR-19-8** | [`history-tree.ts:773`](web-app/src/csg/history-tree.ts:773) | **MEDIUM** | `boolean` без `children` молча пропускается в `mirrorNodeRecursive`. Пустая boolean-нода не обрабатывается, не логируется ошибка. |
| | **MIRROR-19-9** | [`document-store.ts:692-700`](web-app/src/store/document-store.ts:692) | **MEDIUM** | `treeTransform` может устареть после `rebuildNode`. `rebuildNode` может изменить `localTransform` ноды (например, для baked-нод), но store использует значение, полученное ДО rebuild. |
| | **MIRROR-19-10** | [`document-store.ts:704-726`](web-app/src/store/document-store.ts:704) | **MEDIUM** | Fallback при `treeTransform === null` даёт другую логику, чем `mirrorTreeNode`. Если `mirrorTreeNode` не установил `localTransform`, fallback использует простую инверсию знака, которая может не совпадать с логикой `mirrorEuler`. |
| | **MIRROR-19-11** | [`rebuild.ts:76-85,279-299`](web-app/src/store/rebuild.ts:76) | **MEDIUM** | `applyMirrorToTransform` в `rebuildBuildTree` и `buildRebuildMeta` использует `as unknown as` для приведения типов. При ошибке приведения mirror-трансформ будет неверным. |
| | **MIRROR-19-12** | [`viewport-hooks.ts:794-804`](web-app/src/components/viewport-hooks.ts:794) | **LOW** | Preview mesh применяет transform через `geometry.applyMatrix4(matrix)` с `Euler` из `mirrorPreviewMesh.transform`. Если transform содержит отражённые углы (Euler sign flip), `Matrix4.compose` с `Quaternion.setFromEuler` может дать неверную матрицу для отражённых углов. |

### 🔴 Раунд 20 — Аудит утверждения о параметрических CSG (3 изменения)

**Дата ревью:** 2026-08-03
**Ревьюер:** SourceCraft Code Assistant (Ask режим)
**Объём:** 3 файла (document-store.ts, history-tree.ts, rebuild.ts)

> **Контекст:** Проверялось утверждение «Достаточно заменить createBakedNode на createBooleanNode, чтобы CSG-результаты стали параметрическими». После двух раундов верификации по коду установлено, что утверждение **неверно** — нужно минимум 3 изменения, а не одно.

#### Сводка

| # | Проблема | Файл | Severity | Описание |
|---|----------|------|----------|----------|
| | **CSG-PARAM-1** | [`document-store.ts:464`](web-app/src/store/document-store.ts:464) | **HIGH** | `createBakedNode(resultId, mesh.vertices, mesh.indices, mesh.normals ?? null, resultTransform)` — CSG-результат регистрируется как baked-нода вместо boolean. После замены на `createBooleanNode(resultId, op, idA, idB, resultTransform)` дерево будет знать об операндах и сможет перестраивать CSG-результат параметрически. |
| | **CSG-PARAM-2** | [`document-store.ts:80`](web-app/src/store/document-store.ts:80) | **MEDIUM** | `createBooleanNode(nd.id, nd.operation, nd.children[0], nd.children[1])` — при восстановлении из снапшота (undo/redo) не передаётся `nd.localTransform`. После undo/redo boolean-нода теряет позицию. Нужно: `createBooleanNode(nd.id, nd.operation, nd.children[0], nd.children[1], nd.localTransform)`. |
| | **CSG-PARAM-3** | [`rebuild.ts:254-256`](web-app/src/store/rebuild.ts:254) | **LOW** | `createPrimitiveNode(op.id, op.shapeType, op.params, { ...op.transform })` вызывается без проверки существования узла. При undo/redo → `restoreTreeFromSnapshot` уже восстановил дерево → `rebuildBuildTree` создаёт дубликаты. Нужно: `if (!getNode(op.id)) { createPrimitiveNode(...) }`. |

#### Детали проверки

**Исходное утверждение:** «Достаточно заменить createBakedNode на createBooleanNode»

**Вердикт после 2 раундов верификации по коду:** ❌ **НЕВЕРНО**

**Что подтвердилось:**
- `createBooleanNode` существует и корректен ([`history-tree.ts:98-130`](web-app/src/csg/history-tree.ts:98))
- `rebuildNode` для boolean вызывает `applyCSGMeshes` ([`history-tree.ts:385-386`](web-app/src/csg/history-tree.ts:385))
- `mirrorTreeNode` для boolean рекурсивно обрабатывает детей ([`history-tree.ts:831-836`](web-app/src/csg/history-tree.ts:831))
- `syncObjectsForOperation` корректно определяет CSG-результаты через `isCsgResult` ([`document-store.ts:113-119`](web-app/src/store/document-store.ts:113))
- `rebuildBuildTree` уже создаёт `createBooleanNode` ([`rebuild.ts:309-312`](web-app/src/store/rebuild.ts:309))
- `applyCSGMeshes` работает с деревом через `collectSubtree`, не требует `objects` ([`history-tree.ts:486-496`](web-app/src/csg/history-tree.ts:486))

**Что опровергнуто:**
- Утверждение «нужно сохранять CSG-результат в objects» — **неверно**, `resultId` и так сохраняется на строке 439
- Утверждение «нужно обновить syncObjectsForOperation для boolean-нод» — **неверно**, текущая эвристика `isCsgResult` работает корректно
- Утверждение «не удалять transforms операндов в rebuildBuildTree» — **неверно**, `delete transforms[id]` на строке 302 нужен (CSG поглощает операнды)

**Подтверждённые 3 изменения:**
1. [`document-store.ts:464`](web-app/src/store/document-store.ts:464) — `createBakedNode` → `createBooleanNode(resultId, op, idA, idB, resultTransform)`
2. [`document-store.ts:80`](web-app/src/store/document-store.ts:80) — передать `nd.localTransform` в `createBooleanNode`
3. [`rebuild.ts:254-256`](web-app/src/store/rebuild.ts:254) — добавить `if (!getNode(op.id))` перед `createPrimitiveNode`

---

### 🔴 Раунд 18 — Полное код-ревью (138 проблем)

**Дата ревью:** 2026-08-01
**Ревьюер:** SourceCraft Code Assistant (Orchestrator + Ask режимы)
**Объём:** 4 слоя (Store, CSG Worker, UI Components, IO) — 30+ файлов, ~5000 строк кода

#### Сводка по слоям

| Слой | Файлов | Critical | High | Medium | Low | Всего |
|------|--------|----------|------|--------|-----|-------|
| **Store** (document-store, ui-store, helpers, types, rebuild, snapshots, notifications) | 7 | 1 | 5 | 10 | 12 | **28** |
| **CSG Worker** (worker, worker-client, worker-handlers, types, history-tree, tree-store, rebuildOps, worker-matrix, тесты) | 10 | 2 | 10 | 17 | 10 | **39** |
| **UI Components** (Viewport3D, viewport-hooks, ViewCube, snap-utils, Toolbar, PropertiesPanel, Timeline, App, и др.) | 23 | 1 | 5 | 14 | 20 | **40** |
| **IO** (stl-import, stl-export, doodle-io, autosave, project-manager, тесты) | 8 | 1 | 7 | 13 | 7 | **28** |
| **Общие** | — | — | — | 2 | 1 | **3** |
| **Итого** | **48** | **5** | **27** | **56** | **50** | **138** |

---

### 🔴 Критические (5)

| # | Проблема | Файл | Слой | Описание |
|---|----------|------|------|----------|
| | **CRIT-18-1** | [`document-store.ts:1148`](web-app/src/store/document-store.ts:1148) | Store | `extrudeSelected`: мутация `newObjects` (удаление `id`) до успешного завершения `workerCsgBoolean`. При ошибке — объект потерян из состояния. |
| | **CRIT-18-2** | [`worker-handlers.ts:190-257`](web-app/src/csg/worker-handlers.ts:190) | CSG | `buildPrimitive` не проверяет отрицательные размеры (`width=-10`). Может привести к падению WASM. |
| | **CRIT-18-3** | [`worker-sync.test.ts:1-38`](web-app/src/csg/worker-sync.test.ts:1) | CSG | Тесты синхронизации не проверяют логику — только типы. Дают ложное чувство безопасности. |
| | **CRIT-18-4** | [`viewport-hooks.ts:446-468`](web-app/src/components/viewport-hooks.ts:446) | UI | Утечка памяти: старые `BufferAttribute` не диспоузятся при обновлении геометрии mesh. |
| | **CRIT-18-5** | [`doodle-io.ts`](web-app/src/io/doodle-io.ts) | IO | Нет тестов для `doodle-io.ts` — основной формат сохранения проектов без покрытия. |

---

### 🟡 Высокий приоритет (27)

#### Store (5)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **HIGH-18-1** | [`document-store.ts:1029,1082`](web-app/src/store/document-store.ts:1029) | Мутация build tree через `Object.assign(node, ...)` и прямую запись `node.localTransform`. Нарушение иммутабельности Zustand. |
| | **HIGH-18-2** | [`document-store.ts:113,414`](web-app/src/store/document-store.ts:113) | Эвристическое определение CSG-результата (`shapeType==='cube' && !params.width`). Хрупкое и ненадёжное. |
| | **HIGH-18-3** | [`rebuild.ts:142-147`](web-app/src/store/rebuild.ts:142) | Расширение типа `RebuildMeta` через приведение в рантайме. Хрупкое и неочевидное. |
| | **HIGH-18-4** | [`rebuild.ts:258,323`](web-app/src/store/rebuild.ts:258) | Потеря baked-нод для `import_mesh` при отсутствии параметра `objects` в `rebuildBuildTree`. |
| | **HIGH-18-5** | [`rebuild.ts:70,85,98`](web-app/src/store/rebuild.ts:70) | Приведение типов через `as unknown as` для `TransformNR` → `RebuildTransform`. Обход системы типов. |

#### CSG Worker (10)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **HIGH-18-6** | [`worker.ts:59-68`](web-app/src/csg/worker.ts:59) | `as unknown as` для всех сообщений воркера — полное отключение проверки типов. |
| | **HIGH-18-7** | [`worker-client.ts:72`](web-app/src/csg/worker-client.ts:72) | Утечка обработчика `error` при `worker.terminate()` (HMR). Двойной reject при пересоздании воркера. |
| | **HIGH-18-8** | [`worker-client.ts:230-235`](web-app/src/csg/worker-client.ts:230) | `transform?: any` — нарушение strict mode. |
| | **HIGH-18-9** | [`worker-handlers.ts:204,206-212`](web-app/src/csg/worker-handlers.ts:204) | `sphere` с `radius <= 0` и `cylinder` с `height <= 0` — падение WASM. |
| | **HIGH-18-10** | [`worker-handlers.ts:849,861`](web-app/src/csg/worker-handlers.ts:849) | `cache.get(id).transform()` без проверки на `null`. Падение при mirror/move non-manifold объектов. |
| | **HIGH-18-11** | [`worker-handlers.ts:1143-1165`](web-app/src/csg/worker-handlers.ts:1143) | Утечка WASM-объектов в `handleCsgBooleanSync` — 2 manifold-объекта на каждую CSG операцию. |
| | **HIGH-18-12** | [`history-tree.ts:450-452,507`](web-app/src/csg/history-tree.ts:450) | `Array.from(node.vertices)` — полное копирование TypedArray в `number[]` для больших мешей. |
| | **HIGH-18-13** | [`tree-store.ts:11-73`](web-app/src/csg/tree-store.ts:11) | `TreeStore` — простой класс без реактивности. React-компоненты не узнают об изменениях. |
| | **HIGH-18-14** | [`rebuildOps.ts:60-83`](web-app/src/csg/rebuildOps.ts:60) | Неверная инверсия `rotX` для mirror YZ. Неправильное поведение для повёрнутых объектов. |

#### UI Components (5)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **HIGH-18-15** | [`viewport-hooks.ts:261`](web-app/src/components/viewport-hooks.ts:261) | `TransformControls` не диспоузится при размонтировании — утечка слушателей и WebGL-ресурсов. |
| | **HIGH-18-16** | [`viewport-hooks.ts:767-836`](web-app/src/components/viewport-hooks.ts:767) | Потенциальная утечка в `useMirrorPreview` при переключении plane/mesh. |
| | **HIGH-18-17** | [`ViewCube.tsx:142-145`](web-app/src/components/ViewCube.tsx:142) | Геометрии и материалы ViewCube не диспоузятся при размонтировании. |
| | **HIGH-18-18** | [`App.tsx:229-264`](web-app/src/App.tsx:229) | `Ctrl+S` конфликтует с scale-гизмо; нет `return` после `e.preventDefault()`. |
| | **HIGH-18-19** | [`stl-export.ts:88`](web-app/src/io/stl-export.ts:88) | Нет защиты от переполнения памяти при большом количестве треугольников в экспорте. |

#### IO (7)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **HIGH-18-20** | [`stl-import.test.ts`](web-app/src/io/stl-import.test.ts) | Нет тестов для `parseStlFile` и `detectStlFormat`. |
| | **HIGH-18-21** | [`doodle-io.ts:47-53`](web-app/src/io/doodle-io.ts:47) | Нет защиты от ZIP bomb (decompression ratio). |
| | **HIGH-18-22** | [`doodle-io.ts:23-37`](web-app/src/io/doodle-io.ts:23) | Рекурсия `validateObjectKeys` без защиты от stack overflow (глубина > 10K). |
| | **HIGH-18-23** | [`autosave.ts:20-36`](web-app/src/io/autosave.ts:20) | Утечка соединений с IndexedDB — нет `db.close()`. |
| | **HIGH-18-24** | [`autosave.ts`](web-app/src/io/autosave.ts) | Нет тестов для `autosave.ts`. |
| | **HIGH-18-25** | [`project-manager.test.ts:12-35`](web-app/src/io/project-manager.test.ts:12) | Тесты мокают весь модуль, а не только IndexedDB — не проверяют реальную реализацию. |

---

### 🟠 Средний приоритет (56)

#### Store (10)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **MED-18-1** | [`document-store.ts:891-953`](web-app/src/store/document-store.ts:891) | Дублирование паттерна undo/redo/jumpToHistory (~90 строк, повторённых трижды). |
| | **MED-18-2** | [`document-store.ts:834`](web-app/src/store/document-store.ts:834) | Избыточная синхронизация с воркером в `alignSelected` — выравнивание меняет только позицию. |
| | **MED-18-3** | [`document-store.ts:66`](web-app/src/store/document-store.ts:66) | Non-null assertion для опциональных полей baked-нод в `restoreTreeFromSnapshot`. |
| | **MED-18-4** | [`document-store.ts:468`](web-app/src/store/document-store.ts:468) | `rebuildNode` после `set()` без rollback при ошибке. |
| | **MED-18-5** | [`ui-store.ts:63`](web-app/src/store/ui-store.ts:63) | `mirrorPreviewMesh` хранит полные mesh-данные без Transferable. |
| | **MED-18-6** | [`helpers.ts:37`](web-app/src/store/helpers.ts:37) | `extractAndCenterInPlace` мутирует входной массив — неочевидно для вызывающего кода. |
| | **MED-18-7** | [`types.ts:11`](web-app/src/store/types.ts:11) | Отсутствие `isCsgResult` в `SceneObject` — вынуждает эвристику. |
| | **MED-18-8** | [`rebuild.ts:313`](web-app/src/store/rebuild.ts:313) | `try/catch` без уведомления пользователя при ошибке создания boolean-ноды. |
| | **MED-18-9** | [`snapshots.ts:74-76`](web-app/src/store/snapshots.ts:74) | Копирование TypedArray → Array при сериализации дерева (дорого для больших мешей). |
| | **MED-18-10** | [`notifications.ts:28`](web-app/src/store/notifications.ts:28) | `setTimeout` не очищается при `dismiss()` — лишняя операция при быстром закрытии. |

#### CSG Worker (17)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **MED-18-11** | [`worker.ts:70`](web-app/src/csg/worker.ts:70) | Нет валидации `ids` в `deleteObjects` — `for (const id of msg.ids)` упадёт с TypeError. |
| | **MED-18-12** | [`worker-client.ts:118`](web-app/src/csg/worker-client.ts:118) | Таймаут 30s по умолчанию — для sync-операций слишком много. |
| | **MED-18-13** | [`worker-client.ts:143`](web-app/src/csg/worker-client.ts:143) | Нет Transferable объектов при отправке — лишнее копирование для больших массивов. |
| | **MED-18-14** | [`worker-client.ts:76-80`](web-app/src/csg/worker-client.ts:76) | При ошибке воркера reject всех pending — может скрыть реальную проблему. |
| | **MED-18-15** | [`worker-handlers.ts:791-989`](web-app/src/csg/worker-handlers.ts:791) | `handleRebuildScene` — гигантский switch на 200 строк. Нарушение SRP. |
| | **MED-18-16** | [`worker-handlers.ts:921-922`](web-app/src/csg/worker-handlers.ts:921) | Нет валидации `resultVertices`/`resultIndices` — повреждённые данные могут создать гигантский массив. |
| | **MED-18-17** | [`worker-handlers.ts:1030-1031`](web-app/src/csg/worker-handlers.ts:1030) | Stale cache в `handleCsgBoolean` — caller должен помнить о `workerSyncObjects`. |
| | **MED-18-18** | [`types.ts:129-137`](web-app/src/csg/types.ts:129) | `ShapeParams` — index signature `[key: string]: number \| undefined` делает тип нестрогим. |
| | **MED-18-19** | [`types.ts:193-230`](web-app/src/csg/types.ts:193) | `TreeNode` — не discriminated union, много опциональных полей. |
| | **MED-18-20** | [`history-tree.ts:366-406`](web-app/src/csg/history-tree.ts:366) | Дуальная логика WASM vs worker в `rebuildNode` — усложняет тестирование. |
| | **MED-18-21** | [`history-tree.ts:564,566-569`](web-app/src/csg/history-tree.ts:564) | Non-null assertion для `shapeType` и `localTransform` — падение с cryptic error. |
| | **MED-18-22** | [`history-tree.ts:594-598`](web-app/src/csg/history-tree.ts:594) | Конструктор `Manifold` без try/catch для baked-мешей. |
| | **MED-18-23** | [`history-tree.ts:639-653`](web-app/src/csg/history-tree.ts:639) | Мутация node напрямую в `mirrorTreeNode` — проблемы с React re-render. |
| | **MED-18-24** | [`tree-store.ts:76`](web-app/src/csg/tree-store.ts:76) | Singleton усложняет тестирование (нельзя изолировать тесты). |
| | **MED-18-25** | [`tree-store.ts:60-62`](web-app/src/csg/tree-store.ts:60) | `getAllNodesMap()` возвращает ссылку на внутренний Map — caller может мутировать store. |
| | **MED-18-26** | [`rebuildOps.ts:33-50`](web-app/src/csg/rebuildOps.ts:33) | Аддитивное применение scale — дрейф при последовательных move операциях. |
| | **MED-18-27** | [`worker-matrix.ts:15-39`](web-app/src/csg/worker-matrix.ts:15) | Фиксированный порядок Euler XYZ — несовместимость при другом порядке в других частях кода. |

#### UI Components (14)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **MED-18-28** | [`Viewport3D.tsx:260`](web-app/src/components/Viewport3D.tsx:260) | Избыточный `computeBoundingSphere` в drag-select — bounding sphere уже актуален. |
| | **MED-18-29** | [`ViewCube.tsx:29-55`](web-app/src/components/ViewCube.tsx:29) | Stale closure в `animateTo` при быстрых кликах на грани куба. |
| | **MED-18-30** | [`snap-utils.ts:106-108`](web-app/src/components/snap-utils.ts:106) | Избыточное создание `Vector3` для каждой вершины — нагрузка на GC. |
| | **MED-18-31** | [`snap-utils.ts:142-153`](web-app/src/components/snap-utils.ts:142) | Избыточное создание `Vector3` для каждого ребра — десятки тысяч аллокаций. |
| | **MED-18-32** | [`snap-utils.test.ts`](web-app/src/components/snap-utils.test.ts) | Нет тестов для `findNearestSnap` — основной функции snap-to-geometry. |
| | **MED-18-33** | [`Toolbar.tsx:6-84`](web-app/src/components/Toolbar.tsx:6) | 45 пропсов — компонент делает слишком много. |
| | **MED-18-34** | [`PropertiesPanel.tsx:238-391`](web-app/src/components/PropertiesPanel.tsx:238) | Дублирование кода для разных `shapeType` — if/else на 150 строк. |
| | **MED-18-35** | [`Timeline.tsx:119`](web-app/src/components/Timeline.tsx:119) | `key={i}` вместо уникального id операции — проблемы с фокусом и анимациями. |
| | **MED-18-36** | [`NumInput.tsx:18`](web-app/src/components/NumInput.tsx:18) | Нет валидации `max` — пользователь может ввести сколь угодно большое число. |
| | **MED-18-37** | [`App.tsx:26-66`](web-app/src/App.tsx:26) | Гигантский `useShallow` селектор (32 поля) — ререндер всего App при любом изменении. |
| | **MED-18-38** | [`App.tsx:79-122`](web-app/src/App.tsx:79) | Гигантский docStore селектор (42 поля) — аналогично. |
| | **MED-18-39** | [`App.tsx:211`](web-app/src/App.tsx:211) | Шорткаты не проверяют наличие модальных окон — Escape закроет модалку и вызовет `clearSelection`. |
| | **MED-18-40** | [`ErrorBoundary.tsx:9-10`](web-app/src/components/ErrorBoundary.tsx:9) | Ошибки не логируются — разработчик не узнает о произошедшей ошибке. |

#### IO (13)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **MED-18-41** | [`stl-import.ts:34-56`](web-app/src/io/stl-import.ts:34) | `mergeCoincidentVertices` возвращает `number[]` вместо `Float32Array` — двойное выделение памяти. |
| | **MED-18-42** | [`stl-import.ts:75-93`](web-app/src/io/stl-import.ts:75) | `detectStlFormat` может ошибочно детектить ASCII STL при совпадении "solid" в бинарном файле. |
| | **MED-18-43** | [`stl-export.ts:120-140`](web-app/src/io/stl-export.ts:120) | Нормали не трансформируются при повороте — неверные нормали для повёрнутых CSG-объектов. |
| | **MED-18-44** | [`stl-export.test.ts`](web-app/src/io/stl-export.test.ts) | Нет тестов для `applyTransformToVertices` с поворотом. |
| | **MED-18-45** | [`doodle-io.ts:23-37`](web-app/src/io/doodle-io.ts:23) | `validateObjectKeys` не удаляет небезопасные ключи (`__proto__`), только проверяет. |
| | **MED-18-46** | [`doodle-io.ts:157-167`](web-app/src/io/doodle-io.ts:157) | `revokeObjectURL` без задержки — может прервать скачивание в Safari/мобильных браузерах. |
| | **MED-18-47** | [`autosave.ts:52-54`](web-app/src/io/autosave.ts:52) | Нет обработки `QuotaExceededError` — пользователь не получит уведомления. |
| | **MED-18-48** | [`autosave.ts:46-51`](web-app/src/io/autosave.ts:46) | Нет обработки `tx.onabort` — Promise может зависнуть навсегда. |
| | **MED-18-49** | [`project-manager.ts:24-36`](web-app/src/io/project-manager.ts:24) | Избыточное открытие соединений с IndexedDB — каждая операция открывает новое соединение. |
| | **MED-18-50** | [`project-manager.ts:65-72`](web-app/src/io/project-manager.ts:65) | `getAll()` загружает полные данные проектов для списка метаданных. |
| | **MED-18-51** | [`project-manager.ts:105-119`](web-app/src/io/project-manager.ts:105) | `updateProject` создаёт новый проект при несуществующем `id` (IndexedDB `put`). |
| | **MED-18-52** | общая | Нет единого подхода к обработке ошибок в IO слое (return, throw, console.warn). |
| | **MED-18-53** | общая | Нет типизированных ошибок IO — невозможно различить типы ошибок на уровне типов. |

#### Общие (2)

| # | Проблема | Описание |
|---|----------|----------|
| | **MED-18-54** | Нет единого подхода к обработке ошибок между слоями (return Result, throw, console.warn). |
| | **MED-18-55** | Нет типизированных ошибок — невозможно различить типы ошибок на уровне типов. |

---

### 🟢 Низкий приоритет (50)

#### Store (12)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **LOW-18-1** | [`document-store.ts:598`](web-app/src/store/document-store.ts:598) | Динамический импорт ui-store в `previewMirror` — лишняя асинхронная задержка. |
| | **LOW-18-2** | [`document-store.ts:1100`](web-app/src/store/document-store.ts:1100) | Потеря `lastCsgMs` в CSG-ветке `resizeObject`. |
| | **LOW-18-3** | [`document-store.ts:285-286`](web-app/src/store/document-store.ts:285) | Потенциальная утечка TypedArray в clipboard при копировании больших мешей. |
| | **LOW-18-4** | [`ui-store.ts:76-131`](web-app/src/store/ui-store.ts:76) | Избыточность индивидуальных сеттеров (16 сеттеров для 16 полей). |
| | **LOW-18-5** | [`ui-store.ts:84`](web-app/src/store/ui-store.ts:84) | Отсутствие рантайм-валидации в `setGizmoMode`. |
| | **LOW-18-6** | [`helpers.ts:86`](web-app/src/store/helpers.ts:86) | Избыточный `computeAABB` в `makeObject` при известном AABB. |
| | **LOW-18-7** | [`helpers.ts:91`](web-app/src/store/helpers.ts:91) | `nextId` не потокобезопасен (проблема только при Web Workers). |
| | **LOW-18-8** | [`types.ts:20`](web-app/src/store/types.ts:20) | `lastCsgMs` в document-store вместо ui-store. |
| | **LOW-18-9** | [`rebuild.ts:167,215`](web-app/src/store/rebuild.ts:167) | Двойной проход с мутацией `result.results` — неочевидно. |
| | **LOW-18-10** | [`snapshots.ts:123-129`](web-app/src/store/snapshots.ts:123) | Touch-on-access с удалением/вставкой в Map. |
| | **LOW-18-11** | [`snapshots.ts:52`](web-app/src/store/snapshots.ts:52) | `enforceCacheLimit` удаляет по 1 элементу за вызов. |
| | **LOW-18-12** | [`notifications.ts:22`](web-app/src/store/notifications.ts:22) | Отсутствие лимита на количество уведомлений. |

#### CSG Worker (10)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **LOW-18-13** | [`worker.ts:46`](web-app/src/csg/worker.ts:46) | `await initPromise` на каждое сообщение — микротаск даже после инициализации. |
| | **LOW-18-14** | [`worker-handlers.ts:507-510`](web-app/src/csg/worker-handlers.ts:507) | Двойное копирование mesh в `handleBuildShape`. |
| | **LOW-18-15** | [`worker-handlers.ts:1084-1103`](web-app/src/csg/worker-handlers.ts:1084) | Нет dispose при ошибке `buildPrimitive` в `handleSyncObjects`. |
| | **LOW-18-16** | [`types.ts:89-101`](web-app/src/csg/types.ts:89) | `GroupOperation` — много опциональных полей для разных сценариев. |
| | **LOW-18-17** | [`history-tree.ts:24`](web-app/src/csg/history-tree.ts:24) | Импорт `ManifoldObject` без `type`. |
| | **LOW-18-18** | [`worker-matrix.ts:56-57`](web-app/src/csg/worker-matrix.ts:56) | Двойной вызов `computeRSMatrix` при mirror. |
| | **LOW-18-19** | [`worker-sanitize.test.ts:10-49`](web-app/src/csg/worker-sanitize.test.ts:10) | Нет теста `clamp` с `min > max`. |
| | **LOW-18-20** | [`worker-sanitize.test.ts:52-128`](web-app/src/csg/worker-sanitize.test.ts:52) | Нет теста с Symbol ключами. |
| | **LOW-18-21** | [`worker-sanitize.test.ts:52-128`](web-app/src/csg/worker-sanitize.test.ts:52) | Нет теста для пустого результата `sanitizeParams`. |
| | **LOW-18-22** | [`worker-sync.test.ts:29-37`](web-app/src/csg/worker-sync.test.ts:29) | `as const` на transform не нужен. |

#### UI Components (20)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **LOW-18-23** | [`viewport-hooks.ts:264-271`](web-app/src/components/viewport-hooks.ts:264) | ResizeObserver — штатно, но стоит проверить pixelRatio. |
| | **LOW-18-24** | [`Viewport3D.tsx:211`](web-app/src/components/Viewport3D.tsx:211) | Избыточный `computeBoundingBox` в fitView. |
| | **LOW-18-25** | [`ViewCube.tsx:160-162`](web-app/src/components/ViewCube.tsx:160) | Raycaster создаётся при каждом движении мыши. |
| | **LOW-18-26** | [`ViewCube.tsx:284-309`](web-app/src/components/ViewCube.tsx:284) | Инлайн-стили вместо CSS классов. |
| | **LOW-18-27** | [`snap-utils.ts:314-318`](web-app/src/components/snap-utils.ts:314) | Избыточный второй Raycaster в `findNearestSnap`. |
| | **LOW-18-28** | [`snap-utils.test.ts`](web-app/src/components/snap-utils.test.ts) | Нет тестов для `getSceneMeshes`/`getScenePivots`. |
| | **LOW-18-29** | [`ComponentTree.tsx:91`](web-app/src/components/ComponentTree.tsx:91) | Нет визуальной подсказки для переименования. |
| | **LOW-18-30** | [`ComponentTree.tsx:48`](web-app/src/components/ComponentTree.tsx:48) | Магическое число 30ms в setTimeout. |
| | **LOW-18-31** | [`LeftPanel.tsx:49-57`](web-app/src/components/LeftPanel.tsx:49) | Избыточный `useMemo` для 8 элементов. |
| | **LOW-18-32** | [`NumInput.tsx:21`](web-app/src/components/NumInput.tsx:21) | Избыточное вычисление decimals. |
| | **LOW-18-33** | [`TextModal.tsx:43-46`](web-app/src/components/TextModal.tsx:43) | Нет ограничения длины текста. |
| | **LOW-18-34** | [`TextModal.tsx:61,73`](web-app/src/components/TextModal.tsx:61) | Нет проверки `isNaN` для `Number()`. |
| | **LOW-18-35** | [`App.tsx:186-195`](web-app/src/App.tsx:186) | Autosave эффект запускается даже при пустых операциях. |
| | **LOW-18-36** | [`PropertiesPanel.tsx:92`](web-app/src/components/PropertiesPanel.tsx:92) | Статические инлайн-стили. |
| | **LOW-18-37** | [`App.css:461-467`](web-app/src/App.css:461) | `ruler-display` не адаптирован под светлую тему. |
| | **LOW-18-38** | [`ErrorBoundary.tsx:6-27`](web-app/src/ErrorBoundary.tsx:6) | Нет кнопки "Retry". |
| | **LOW-18-39** | [`Section.tsx:18-29`](web-app/src/components/Section.tsx:18) | Нет `aria-controls`. |
| | **LOW-18-40** | [`ToastContainer.tsx:20-36`](web-app/src/components/ToastContainer.tsx:20) | Нет анимации исчезновения. |
| | **LOW-18-41** | [`WebGLFallback.tsx:7`](web-app/src/components/WebGLFallback.tsx:7) | Хардкод "Replit". |
| | **LOW-18-42** | [`StatusBar.tsx:77`](web-app/src/components/StatusBar.tsx:77) | Отладочная информация в production. |

#### IO (7)

| # | Проблема | Файл | Описание |
|---|----------|------|----------|
| | **LOW-18-43** | [`stl-import.ts:85`](web-app/src/io/stl-import.ts:85) | Нет проверки endianness в `detectStlFormat`. |
| | **LOW-18-44** | [`stl-import.ts:105-109`](web-app/src/io/stl-import.ts:105) | Нет явной проверки на 0 треугольников. |
| | **LOW-18-45** | [`stl-import.ts:58-67`](web-app/src/io/stl-import.ts:58) | Утечка DOM-элементов при многократном вызове `openStlFilePicker`. |
| | **LOW-18-46** | [`stl-export.ts:22`](web-app/src/io/stl-export.ts:22) | Identity-трансформация возвращает ссылку на оригинальный массив. |
| | **LOW-18-47** | [`doodle-io.ts:122-123`](web-app/src/io/doodle-io.ts:122) | Лишнее base64 кодирование/декодирование thumbnail. |
| | **LOW-18-48** | [`project-manager.ts:88-103`](web-app/src/io/project-manager.ts:88) | Нет проверки уникальности имени проекта. |
| | **LOW-18-49** | общая | Нет потоковой обработки больших файлов. |

---

### ❌ Отозванные проблемы (False Positives) — Раунд 17

| # | Проблема | Причина отзыва |
|---|----------|----------------|
| | CRIT-NEW-2: `resizeObject` не обновляет snapshot | `cacheSnapshotWithTree` ЕСТЬ на строке 1025 — ошибка чтения кода |
| | HIGH-NEW-3: `extrudeSelected` slab в дереве | Slab — временный объект, undo/redo использует `resultVertices` из `GroupOperation` |
| | God Component (разделение файлов) | Zustand `create<DocumentStore>()` не поддерживает разделение без middleware |
| | `busy` не сбрасывается в `resizeObject` | `busy` не устанавливается в true для else-ветки — проблема в отсутствии `try/catch`, а не busy |

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
| **Раунд 17 + SourceCraft** (2025-07-31) | CRIT-17-1 (boolean hash), CRIT-17-2 (resizeObject try/catch), HIGH-1..5, LOW-1..8 | ✅ Все исправлены |
| **SourceCraft — 38 проблем** (2026-07-31) | CRIT-1..12 (treeNodes, busy, drag-select, WASM leak, etc.), MED Store/CSG/UI/IO (12), LOW (12) | ✅ Все исправлены |
| **Mirror boolean/non-manifold** (2026-08-01) | MIRROR-BOOLEAN (finalTransform из centroid), MIRROR-NONMANIFOLD (workerMirrorObject для import_mesh) | ✅ Исправлено |

> **⚠️ ВАЖНО:** Проблемы MIRROR-1..10 из предыдущих раундов (Раунды 11–15, 17) были помечены как исправленные, однако глубокий аудит Раунда 19 показал, что **фундаментальные проблемы остались**. См. секцию «Раунд 19 — Глубокий аудит Mirror» выше для актуального списка проблем.

---

## 🎯 План действий (приоритет)

### Фаза 0 — Mirror (немедленно, 12 проблем)
1. **MIRROR-19-1 (CRITICAL)**: Исправить `mirrorCenter` — использовать `obj.transform` (мировые координаты) вместо `computeAABB(obj.vertices)` (локальные) в `previewMirror` и `mirrorSelected`
2. **MIRROR-19-2 (CRITICAL)**: Исправить preview для multi-select — итерация по всем `ids`, а не только `ids[0]`
3. **MIRROR-19-3 (HIGH)**: Очистка preview-узлов — удалять предыдущие `mirror_preview_*` узлы перед созданием новых
4. **MIRROR-19-4 (HIGH)**: Добавить debounce/throttle для preview, отменять предыдущий запрос при новом наведении
5. **MIRROR-19-5 (HIGH)**: Очищать preview-узлы после `mirrorSelected` (confirm)
6. **MIRROR-19-6 (HIGH)**: Заменить эвристику `shapeType==='cube' && !params.width` на явное поле `isCsgResult` в `SceneObject`
7. **MIRROR-19-7 (MEDIUM)**: Добавить проверку `localTransform` для baked-нод в `mirrorNodeRecursive` с fallback на identity
8. **MIRROR-19-8 (MEDIUM)**: Добавить проверку пустых `children` для boolean-нод в `mirrorNodeRecursive` с логированием
9. **MIRROR-19-9 (MEDIUM)**: Сохранять `treeTransform` ПОСЛЕ `rebuildNode`, а не до
10. **MIRROR-19-10 (MEDIUM)**: Устранить расхождение между `mirrorTreeNode` и fallback-логикой при `treeTransform === null`
11. **MIRROR-19-11 (MEDIUM)**: Убрать `as unknown as` в `rebuild.ts` для mirror-операций, добавить type-safe приведение
12. **MIRROR-19-12 (LOW)**: Проверить корректность `Matrix4.compose` с `Quaternion.setFromEuler` для отражённых углов в preview

### Фаза 0.5 — Параметрические CSG (3 изменения)
1. **CSG-PARAM-1 (HIGH)**: [`document-store.ts:464`](web-app/src/store/document-store.ts:464) — заменить `createBakedNode` на `createBooleanNode(resultId, op, idA, idB, resultTransform)`
2. **CSG-PARAM-2 (MEDIUM)**: [`document-store.ts:80`](web-app/src/store/document-store.ts:80) — передать `nd.localTransform` в `createBooleanNode` при восстановлении из снапшота
3. **CSG-PARAM-3 (LOW)**: [`rebuild.ts:254-256`](web-app/src/store/rebuild.ts:254) — добавить `if (!getNode(op.id))` перед `createPrimitiveNode` для предотвращения дубликатов при undo/redo

### Фаза 1 — Критические (немедленно)
1. **CRIT-18-1**: Исправить мутацию `newObjects` до успешного завершения асинхронных операций в `extrudeSelected`
2. **CRIT-18-2**: Добавить проверку отрицательных размеров в `buildPrimitive` (`Math.max(0.001, ...)`)
3. **CRIT-18-4**: Добавить `dispose()` для старых `BufferAttribute` при обновлении геометрии mesh
4. **CRIT-18-3, CRIT-18-5**: Добавить тесты для `worker-sync` и `doodle-io`

### Фаза 2 — Высокий приоритет (27 проблем)
- Исправить мутацию build tree (HIGH-18-1)
- Добавить явное поле `isCsgResult` (HIGH-18-2)
- Исправить утечки WASM-объектов (HIGH-18-11)
- Исправить утечки Three.js (HIGH-18-15, HIGH-18-16, HIGH-18-17)
- Исправить конфликт шортката Ctrl+S (HIGH-18-18)
- Добавить защиту от ZIP bomb и stack overflow (HIGH-18-21, HIGH-18-22)
- Исправить утечку соединений IndexedDB (HIGH-18-23)
- Добавить тесты для STL, autosave, project-manager (HIGH-18-20, HIGH-18-24, HIGH-18-25)

### Фаза 3 — Средний приоритет (56 проблем)
- Рефакторинг дублирования undo/redo (MED-18-1)
- Transferable объекты для больших массивов (MED-18-13)
- Разделение `handleRebuildScene` на отдельные функции (MED-18-15)
- Discriminated union для `TreeNode` (MED-18-19)
- Реактивность `TreeStore` (MED-18-24)
- Оптимизация Vector3 в snap-utils (MED-18-30, MED-18-31)
- Разделение гигантских селекторов в App.tsx (MED-18-37, MED-18-38)
- Единая система ошибок IO (MED-18-54, MED-18-55)

### Фаза 4 — Низкий приоритет (50 проблем)
- Косметические улучшения, CSS, документация, тесты

---

## 📊 Сводка

| Метрика | Значение |
|---------|----------|
| Всего выявлено проблем | ~260+ (за всё время) |
| Исправлено | ~110+ |
| Активных (Раунд 18 + Раунд 19 + Раунд 20) | **153** (138 + 12 mirror + 3 CSG-PARAM) |
| Точность ревью (Раунд 16) | ~50% (8/18 полностью верных) |
| Точность ревью (Раунд 17 + SourceCraft) | ~83% (12.5/15 подтверждено) |
| Точность ревью (Раунд 18) | Ожидает верификации |
| Точность ревью (Раунд 20 — CSG-PARAM) | **100%** (3/3 подтверждено после 2 раундов верификации) |

### Распределение по типам

| Тип | Количество |
|-----|-----------|
| Баг | ~40 |
| Производительность | ~25 |
| Архитектура | ~48 |
| Безопасность | ~15 |
| Тестирование | ~18 |

### Ключевые выводы

1. **Mirror — самая проблемная фича проекта**: 12 новых проблем, из них 2 CRITICAL и 4 HIGH. Фундаментальные проблемы с mirrorCenter (локальные vs мировые координаты), multi-select preview, утечкой preview-узлов.
2. **Утечки памяти** — главная проблема проекта: Three.js (BufferAttribute, TransformControls, ViewCube), WASM (manifold-объекты в handleCsgBooleanSync), IndexedDB (соединения), preview-узлы build tree.
3. **Типобезопасность** — множественные `as unknown as`, `any`, index signature ослабляют strict mode TypeScript.
4. **Архитектура IO** — отсутствие единой системы типов ошибок и унифицированного подхода к обработке ошибок.
5. **Производительность snap-utils** — избыточное создание объектов Vector3 в горячем цикле raycasting.
6. **Параметрические CSG** — инфраструктура готова (build tree ✅, rebuildFromHistory ✅, applyCSGMeshes ✅), нужно 3 изменения для включения.

---

*Полная история всех код-ревью с детальным описанием каждого раунда: [`CODE_REVIEW_ARCHIVE.md`](CODE_REVIEW_ARCHIVE.md)*

---

## 📌 Будущие направления

### Параметрическая история операций (Фаза 8)

После завершения Раунда 19 (Mirror) и Раунда 20 (CSG-PARAM) — следующий этап улучшения:

- **Раскрытие CSG-операций** в Timeline — редактирование состава operand-ов и типа boolean операции
- **Редактирование параметров** примитивов прямо в истории (width/height/depth, radius, segments)
- **Перестроение цепочки** при изменении любого шага — `rebuildFromHistory(ops.slice(0, index + 1))`
- **Edit modal** для fillet, extrude, mirror — изменение параметров без undo/redo
- **Undo для edit** — запись предыдущего состояния в историю

Базовая инфраструктура уже готова: история операций ✅, build tree ✅, rebuildFromHistory ✅, boolean-ноды в дереве ✅ (после CSG-PARAM-1). Нужно только UI.
