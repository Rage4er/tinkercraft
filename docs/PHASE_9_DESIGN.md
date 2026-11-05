# Фаза 9 — Параметрическая история: проектные решения

> Ветка: `phase-9` (от `main`). Нумерация подзадач — по `ideas/IDEAS_TC_021126.md`
> (9.1 дерево, 9.2 панель свойств ребёнка, 9.3 пересборка CSG, 9.6 undo правки, 9.8 baked/mirrored дети, 9.9 `csgValid`).
> В `DEVELOPMENT_PLAN.md` (раздел «Фаза 9») нумерация другая (history-centric: Timeline edit) — не путать.

## Статус

| # | Задача | Статус |
|---|--------|--------|
| 9.1 | Component Tree: раскрытие CSG → дети, выбор ребёнка | ✅ (read-only, `csg/tree-view.ts`, `ComponentTree.tsx`) |
| 9.2 | Properties Panel: редактирование `params` ребёнка | 🔲 |
| 9.3 | Пересборка CSG при смене `params` | 🔲 |
| 9.6 | Undo/redo + сериализация правки | 🔲 (входит в 9.3: без неё правка не живёт) |
| 9.8 | Baked/mirrored дети | 🔲 (в 9.1 помечены нередактируемыми) |
| 9.9 | `csgValid` — индикатор «меш невалиден для CSG» | 🔲 (в коде не существует) |

## Решения (утверждены 2026-11-05)

1. **Хранение правки — операция с результатом.** Новая операция `edit_child_params`
   хранит `params` ребёнка и готовый меш результата (как `group` хранит
   `resultVertices/Indices/Normals`). Воспроизведение детерминировано и не требует CSG при
   загрузке. Минус — размер `.3dtc`; старые сборки не откроют файлы с новой операцией
   (`parse3dtc` отвергает неизвестные типы). Альтернатива «починить `rebuildBuildTree`»
   отклонена: это отдельная рискованная задача по ядру.
2. **Охват v1 включает вложенные CSG.** Требует поправки системы координат для
   переведённых внутренних CSG (см. «Риски»).

## Находки исследования (на чём строится дизайн)

- Операнды CSG удаляются из `objects` (`csgBoolean`); дети живут только в `treeStore`
  и в ранних операциях истории. Ребёнок не может быть в `selectedIds` →
  отдельное состояние `ui-store.selectedChild { rootId, nodeId }`.
- `treeStore` — не реактивный `Map`; UI читает read-модель `getTreeView(rootId)`
  (`csg/tree-view.ts`), пересчитываемую при смене `objects`.
- Единственный путь «пересчитать boolean из детей» — `rebuildNode` →
  `workerRebuildNode` → `handleRebuildTreeNode`; в проде сегодня его результат
  не используется (прогрев кэша). Он возвращает меш в COM-центрированном виде
  с запечённым TRS, а не в конвенции `SceneObject`.
- Конвенция CSG-результата: pivot = `transformA`, `v = S⁻¹Rᵀ(v_world − posA)`,
  **без** центрирования по COM → при смене params ребёнка pivot остаётся, меняются
  только вершины: `v = RS₀⁻¹(W_new − pos₀)`; затем пересчёт `aabb` и `originalBboxSize`.
- `rebuildBuildTree` (undo/load) никогда не чистит дерево и не воспроизводит
  `resize_dims`/`align`/`fillet`; снимок дерева (`serializeTree`) теряет
  `relativeToParent`/`mirroredPlane`. Поэтому правка только в дереве исчезнет.
- `.3dtc` не содержит узлов дерева — только `objects` и `operations`.

## Риски и открытые вопросы

- **Система координат ответа воркера.** `handleRebuildTreeNode` не возвращает COM-смещение;
  нужно расширить ответ (мировой меш/COM) или добавить сообщение. Расширение
  `rebuildTreeNode` не ломает ~12 мок-фабрик `worker-client` в тестах.
- **Вложенные CSG.** Внутренний CSG, перемещённый до того как стал операндом, имеет
  устаревшие `children` в системе создания; воркер это игнорирует («STALE»). Нужна
  поправка `TRS_cur·TRS₀⁻¹`.
- **Пустой результат.** Правка может обнулить subtract/intersect → 0 вершин,
  `computeAABB` даст ±Infinity: нужны защита, уведомление и откат.
- **Новая операция — в 4+ местах:** `VALID_OP_TYPES` (`io/3dtc-io.ts`, `io/doodle-io.ts`),
  `restoreOperationMeshArrays`, `Timeline.tsx` (`opIcon`/`opLabel`), `OP_FILTER_LABELS`,
  i18n `timeline.*`/`filters.*` (ru, en), `buildRebuildMeta`, `handleRebuildScene` (воркер),
  `rebuildBuildTree`.
- **Params неизменяемы:** снимки дерева хранят ссылки — правка только через `setNode` с новой копией.
- **Существующий баг рядом:** `resize_dims` на CSG записывает params без scale
  (теряется при пересборке без кэша).
- **Выбор ребёнка** сбрасывается при смене истории/выделения (`useSelectedChildGuard`).
- **Mirrored-дети** хранят одну плоскость (`mirroredPlane`), а на примитиве — список `mirrored[]`.
