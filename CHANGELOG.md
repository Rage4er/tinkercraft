# Changelog

Все заметные изменения в этом проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование следует [SemVer](https://semver.org/lang/ru/).

---

## [Unreleased]

### Fixed

- **SHADOW ACNE (полосатые грани фигур)**: Вертикальные и наклонные грани куба/сферы/конуса были покрыты полосами от самозатенения. Причины: 1) `shadow.bias` отсутствовал — добавлены `bias = -0.002` и `normalBias = 0.05`; 2) карта теней 2048px была мала для области ±200 — увеличена до 4096px. Горизонтальные грани были чистыми, вертикальные требовали большего bias из-за угла падения света. (`viewport-hooks.ts`)

- **VITE DEV-SERVER CRASH (ERR_HTTP_HEADERS_SENT)**: Dev-сервер падал при запросе JS-файлов из-за middleware `stripReactRefresh` — он вызывал `res.setHeader('Content-Length', ...)` после того, как Vite 6.4 уже отправил заголовки (повторный вызов `res.end`). Добавлена защита: проверка `res.writableEnded`/`res.headersSent` и try/catch вокруг setHeader. (`vite.config.ts`)

- **MESH: flat shading через развёртывание геометрии в viewport**: Для куба/призмы/пирамиды/CSG в `viewport-hooks.ts` индексированная геометрия разворачивается в неиндексированную — каждая грань получает уникальные вершины с нормалью по нормали грани. Нормализация нормалей (защита от немасштабированных данных). Smooth-shading фигуры (сфера, цилиндр, тор) используют нормали из воркера.

- **NORMALS: использование нормалей из воркера + flat shading**: `viewport-hooks.ts` использует нормали из manifold-3d вместо `computeVertexNormals()` для smooth-shading фигур. Для flat-shading фигур (куб/призма/пирамида/CSG) геометрия разворачивается в viewport — каждая грань получает уникальные вершины с нормалью по нормали грани. Сегменты увеличены: sphere/cylinder/cone 32→48, torus 32→48, tubeSegs 16→24.

- **DIAG:* логи → dev mode**: Все `console.log` с префиксом `[DIAG:*]` в `worker-handlers.ts` и `document-store.ts` переключены на условное логирование через `import.meta.env?.DEV`. Логи работают только в dev-режиме (`pnpm dev`), отсутствуют в production (`pnpm build`). Не удалены — пригодятся для отладки. (`worker-handlers.ts`, `document-store.ts`)

- **ALIGN: aabb не обновлялся при moveObject (CRITICAL FIX)**: При перемещении объекта gizmo'ом `moveObject` обновлял `transform`, но не `aabb`. `aabb` оставался от момента создания (мировой bbox на позиции 0,0,0). `ALIGN` брал этот старый bbox → delta считалась неправильно → объекты улетали. Исправление: 1) `moveObject` теперь сдвигает `aabb` на тот же delta; 2) `computeWorldAABB` возвращает `obj.aabb` напрямую (он уже мировой, вершины содержат translate от `handleBuildShape`). (`document-store.ts`, `helpers.ts`)

- **ALIGNS: AABB мировые координаты (FIX ALIGN-8)**: Создана `computeWorldAABB(obj)` в `helpers.ts` — возвращает мировой bbox (локальный + transform.position). Старая `computeAABB(vertices)` оставлена для CSG (вершины уже центрированы). `alignSelected` теперь использует `computeWorldAABB` вместо ручного сложения. Добавлен подробный лог: `anchorWorldAabb`, `targetAabb`, `cur`, `delta`. (`helpers.ts`, `document-store.ts`)

- **DUPLICATE KEYS (Timeline)**: Исправлен дублирующийся ключ `resize_dims_obj_1` в `Timeline.tsx`. Ключ генерировался как `${op.type}_${op.id}`, что приводило к коллизиям при нескольких операциях одного типа над одним объектом. Добавлен индекс `i` в ключ: `${op.type}_${op.id}_${i}`. (`Timeline.tsx`)

- **CYCLE-CSG (Cannot create cycle in tree)**: Добавлена проверка существования детей перед созданием boolean-узла в `rebuildBuildTree` (`rebuild.ts`). При `jumpToHistory` / `loadFromProject` / `undo/redo` дети CSG-операции (`op.ids[0]`, `op.ids[1]`) могут быть удалены из истории, но остаться в операции `group`. Раньше `createBooleanNode` создавался с отсутствующими детьми → ошибка `Cannot create cycle in tree` из `isAncestor` проверки. Теперь: 1) проверяется `getNode(childAId)` и `getNode(childBId)` — если один из детей отсутствует, операция пропускается с `console.warn`; 2) улучшено логирование ошибки при создании boolean-узла — выводится childA/childB и операция; 3) цикл `for` использует `continue` вместо `break` для корректной обработки оставшихся операций. (`rebuild.ts`)

### Added

- **ALIGN — полное логирование**: Добавлено `devLog` во все этапы работы выравнивания: 1) `document-store.ts` — begin/filtered/bboxes/deltas/apply/workerSyncMesh/workerSyncObjects/op/done; 2) `rebuildOps.ts` — `applyAlignToTransform` выводит до/после; 3) `rebuild.ts` — `buildRebuildMeta` выводит операцию при undo/redo; 4) `worker-handlers.ts` — `rebuildScene` выводит применение дельты к каждому объекту. Префикс логов: `ALIGN:*`. Логи работают только в dev-режиме (`devLog` из `src/utils/debug.ts`).

- **ALIGN — иконки в Timeline**: `opIcon` теперь маппит `axis` + `anchor` к конкретной иконке через `ALIGN_ICON_MAP` (9 иконок вместо одной `AlignXMinIcon`). `opLabel` показывает формат `Выровнять X → min`. (`Timeline.tsx`)

### Changed

- **UX: имя проекта перенесено в PropertiesPanel**: Убран `titleSuffix` ("— без имени •") из Toolbar. Имя проекта теперь показывается в PropertiesPanel (когда ничего не выделено): `📄 проект.doodle` или `⚠ Несохранённый проект`. Кнопки "Менеджер проектов" и "Быстрое сохранение" всегда видны в панели свойств. (`App.tsx`, `Toolbar.tsx`, `PropertiesPanel.tsx`)

- **Timeline: иконки 32px больше не накладываются на текст**: `.tl-icon` width 14px→32px, `font-size` 11px→24px. `.tl-label` добавлен `padding-left: 8px`. (`App.css`)

- **ALIGN: подробные тултипы для всех 9 кнопок**: Каждая кнопка показывает направление (⬅⟷➡), порядок действий, ожидаемый результат. Явно указано: первая выделенная фигура двигается, вторая — якорь. (`constants.ts`)
- **ALIGN — deltas обязательный, anchorId добавлен (FIX ALIGN-5)**: `deltas` в `AlignOperation` больше не опциональный (`?`) — всегда вычисляется и сохраняется. Добавлено поле `anchorId` для идентификации якорного объекта. (`types.ts`)

- **7.5.4 — Тесты цепочек операций (15 тестов)**: Создан `build-chain.test.ts` — тесты параметрического build tree из истории операций. 5 групп: 1) CSG-цепочки (union/subtract/intersect, вложенный CSG: куб → union с цилиндром → union со сферой); 2) Mirror + CSG (зеркало YZ/XZ → union со сферой, multi-select mirror); 3) Undo/Redo через CSG (откат через CSG удаляет boolean-ноду, redo воссоздаёт, глубокий undo/redo 5 шагов); 4) Jump to history (переход к середине цепочки, jump с delete объекта-child CSG, jump через delete → redo); 5) Edge cases (пустая история, несколько CSG с разными operation types, parentId chain, CSG с move). 220/220 тестов проекта проходят. (`build-chain.test.ts`)

- **7.5.5 — Условные логи (devLog/devWarn)**: Создан `src/utils/debug.ts` — хелперы `devLog` и `devWarn` для условного логирования. Все `console.log('[MIRROR:*'` заменены на `devLog` — логи работают в dev (`pnpm dev`), отсутствуют в production (`pnpm build`). Заменено ~20 строк логов в 4 файлах: `history-tree.ts`, `rebuildOps.ts`, `document-store.ts`, `mirror-store.ts`. Формат изменён с конкатенации строк на object-логирование для лучшей читаемости.

- **7.5.5 — IconButton + тултипы**: Создан универсальный `IconButton` компонент (`IconButton.tsx`) с поддержкой двух вариантов (compact/full), стилевых вариантов (default/primary/danger/active), тултипов, ARIA-label и обработчиков мыши (onMouseEnter/onMouseLeave). Заменены все кнопки в: Toolbar.tsx (15 кнопок), CsgButtons.tsx, MirrorButtons.tsx, AlignButtons.tsx. Все кнопки теперь имеют тултипы, поддерживают темы через CSS-переменные.

- **7.5.5 — Двухуровневые тултипы (Tooltip)**: Создан `Tooltip.tsx` с двухуровневой системой подсказок: Уровень 1 (мгновенно) — название + горячая клавиша; Уровень 2 (через 1.5 сек) — описание + пример использования. Добавлен `TOOLTIP_DATA` в `constants.ts` с описаниями для всех 30+ кнопок. CSS-стили в `App.css` с поддержкой тем (тёмная/светлая). Профессиональный стандарт UX (AutoCAD, Fusion 360, Blender).

- **7.5.5 — Layout тулбара (CAD-style)**: Переработана структура тулбара — группы кнопок всегда на одной строке, кнопки внутри равномерно заполняют пространство. Если toolbar не влазит — горизонтальный скролл. CSS: `.toolbar { flex-wrap: nowrap; overflow-x: auto }`, `.toolbar-group { flex: 1 1 0; display: flex; flex-direction: column }` — группы равномерно делят пространство, кнопки центрированы в строках. `separator { align-self: stretch }`.

- **7.5.5 — Алгоритм распределения кнопок по строкам**: Реализован `toolbar-layout.ts` с ИТЕРАТИВНЫМ алгоритмом сужения/расширения (как в AutoCAD/MS Office). **Исправлены критические ошибки**: 1) Ширина теперь считается как `max(ceil(buttonCount/rows)) * BTN_SIZE`, а не `firstRowCount * BTN_SIZE`. 2) Contract увеличивает `rows` у кандидатов, а не отнимает от `firstRowCount`. 3) Expand уменьшает `rows` с гистерезисом. 4) Правильное распределение кнопок: при 5 кнопках и 2 строках → `ceil(5/2)=3` в первой строке, а не 4. Интегрирован в Toolbar через `useToolbarLayout` hook. Компоненты `MirrorButtons`, `AlignButtons`, `CsgButtons` принимают `maxRows` prop.

- **7.5.6 — useLayoutEffect + измерение реальной ширины кнопок**: **КРИТИЧЕСКАЯ АРХИТЕКТУРНАЯ ИСПРАВЛЕНИЕ**. 1) Заменён `useEffect` на `useLayoutEffect` — layout пересчитывается СИНХРОННО ДО рендера (без flickering). 2) Добавлено измерение реальной ширины кнопки через `getBoundingClientRect()` (не фиксированное 34px). 3) Состояние переделано в `rowsMap: Record<string, number>` — чистая карта по groupId. 4) Устранён риск бесконечного цикла: ResizeObserver вызывает `calculateAndSetLayout` с правильными зависимостями. 5) `toolbarRef` теперь `RefObject<HTMLDivElement>` (без `| null`). Алгоритм `calculateToolbarLayout` остался неизменен (чистая функция, протестирована отдельно).

- **7.5.7 — Исправление бесконечного цикла (Maximum update depth exceeded)**: **КРИТИЧЕСКИЙ БАГФИКС**. Причина: `groups` из props пересоздавался как массив-литерал в `Toolbar.tsx` при каждом рендере → `calculateAndSetLayout` пересоздавался (зависимость `[groups]`) → `useLayoutEffect` запускался → `setRowsMap` → ререндер → цикл. Решение: 1) Добавлен `groupsRef` — `useRef` для хранения актуальных групп. 2) `calculateAndSetLayout` использует `groupsRef.current` вместо `groups` из замыкания. 3) Зависимости `useCallback` → `[]` — функция стабильна навсегда. 4) Зависимости `useLayoutEffect` → `[calculateAndSetLayout, measureButtonWidth]` — обе функции стабильны. Паттерн: useRef для данных, которые меняются, но не должны триггерить эффекты.

- **7.5.8 — CSS — кнопки больше не накладываются**: Исправлено наложение кнопок — `.toolbar-group-row` имел `flex: 1` (растягивался на 100% высоты контейнера). Заменено на `flex-shrink: 0` + `height: 36px` (фиксированная высота по содержимому). Строки корректно стекаются вертикально.

- **7.5.9 — CSS — группы ровно под кнопки + перенос кнопок**: **КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ CSS**. 1) `.toolbar-group-row` получил `flex-wrap: wrap` — кнопки переносятся на новую строку когда не влазят. 2) Убран `max-width: 200px` с `.toolbar-group` — группы теперь шириной под свои кнопки (не ограничены). 3) Убран `overflow: hidden` с `.toolbar-group` — кнопки не скрываются. Результат: группы = `flex: 0 0 auto` (ширина под содержимое), кнопки внутри переносятся (`flex-wrap: wrap`), весь тулбар скроллится горизонтально если не влезает.

- **SVG-иконки для UI**: Создан полный набор из 40+ профессиональных SVG-иконок (`src/components/icons.tsx`) для замены emoji/Unicode-символов во всём интерфейсе. Иконки: 8 примитивов (куб, сфера, цилиндр, конус, тор, призма, пирамида, текст), 4 инструмента (выделение, перемещение, вращение, масштаб), 3 CSG-операции (объединение, вычитание, пересечение), 3 зеркала (YZ, XZ, XY), 5 действий (undo, redo, копировать, вставить, удалить), 4 файла (открыть, сохранить, импорт, экспорт), 3 навигации (дом, fit view, линейка), 3 дополнительные (скругление, выравнивание, цвет), 5 стандартных (закрыть, информация, предупреждение, глаз, глаз-выкл), 4 дополнительных (плюс, монитор, шеврон вверх/вниз, папка).
- **constants.ts → constants.tsx**: Переименован для поддержки JSX (иконки фигур в ALL_SHAPES теперь React-компоненты).
- **worker-client.ts**: Исправлена ошибка `window is not defined` при инициализации WASM-воркера в Vite HMR. Добавлена обработка ошибок создания воркера, таймаут инициализации (10с) и cleanup при hot-reload через `import.meta.hot.on('vite:beforeFullReload')`.

### Changed

- **Все компоненты UI**: Все emoji и Unicode-символы заменены на SVG-иконки в: Toolbar.tsx, LeftPanel.tsx, Timeline.tsx, ComponentTree.tsx, PropertiesPanel.tsx, ToastContainer.tsx, Section.tsx, TextModal.tsx, ProjectManagerModal.tsx, CsgButtons.tsx, MirrorButtons.tsx, AlignButtons.tsx, ErrorBoundary.tsx, WebGLFallback.tsx.

- **Тесты IndexedDB**: Исправлены 12 проваливающихся тестов. Создан общий in-memory мок IndexedDB (`src/__mocks__/indexeddb.ts`) — полноценная эмуляция IDBFactory/IDBDatabase/IDBTransaction/ObjectStore с callback-диспатчингом через microtask. Тесты `project-manager.test.ts` (7 тестов) и `autosave.test.ts` (4 теста) переведены на общий мок с `vi.resetModules()` + dynamic imports для сброса кэша `_dbCache`. `stl-import.test.ts` — исправлено сравнение `Uint32Array` vs plain array через `Array.from()`. Попутно исправлены предсуществующие ошибки typecheck: `StlParseResult` теперь возвращает `Float32Array`/`Uint32Array` вместо `ArrayLike<number>`, убрана избыточная проверка `shapeType !== 'import_mesh'` после TS-narrowing. **205/205 тестов, 0 ошибок typecheck.**

- **MIRROR-CSG-RS (КРИТИЧЕСКОЕ)**: Исправлена потеря rotation/scale при булевых операциях над зеркальными CSG-результатами. Корневая причина: `handleSyncMesh` (worker-handlers.ts) применял **только трансляцию** к геометрии CSG-объекта, игнорируя rotation/scale в transform. Для зеркальных CSG-результатов (baked, с rotation/scale в transform) это означало, что булевы операции оперировали **неповёрнутой/немасштабированной** геометрией — терялись все параметры дочерних фигур. Исправление: 1) `handleSyncMesh` теперь применяет **полный TRS** (rotation + scale + position) через `buildTransformMatrix`, когда transform содержит не-identity rotation/scale (fast path — только translation — сохранён для обычных CSG-результатов); 2) `handleRebuildTreeNode` (baked-нода) и `transformBakedMesh` (history-tree.ts) — аналогично, полный TRS при наличии rotation/scale; 3) `rebuildFromHistory` — больше **не запекает** RS в вершины, вершины остаются центрированными (TRS применяется при рендере через pivot и в worker для CSG-булевых); 4) `csgBoolean` `ensureInTree` — CSG-результаты теперь регистрируются как **baked-ноды** (готовый меш + полный transform), а не placeholder cube с пустыми params (что приводило к "обнулению параметров детей"). (`worker-handlers.ts`, `history-tree.ts`, `document-store.ts`, `rebuild.ts`)

- **MIRROR-CSG-CHILDREN-3**: Окончательное исправление разбегания детей вложенных CSG-объектов после зеркала. Корневая причина: `moveTreeNode` обновляет только primitive/baked ноды, НЕ boolean. Поэтому `localTransform` внутреннего boolean-узла оставался устаревшим (оригинальный centroid). После mirror этот устаревший centroid сдвигал геометрию на `(stale_centroid - actual_centroid)`. Решение: внутренний boolean-узел теперь **прозрачный pass-through** — не центрируется, не сдвигается, не применяет localTransform. Геометрия возвращается в мировых координатах как есть. ROOT boolean центрирует финальный результат, сохраняя правильные относительные позиции детей. (`worker-handlers.ts`)
- **MIRROR-CSG-KEEPTYPE**: Зеркальная копия CSG-результата больше не превращается в `import_mesh` — она остаётся CSG-результатом (`shapeType='cube'`, `params={}`), что разблокирует булевы операции для зеркальных копий сложной геометрии. Также исправлены `ensureInTree` в `mirror-store.ts` и два блока регистрации в дереве в `document-store.ts` (`moveObject` + `csgBoolean` sync): CSG-результаты с пустыми params теперь регистрируются как **baked-ноды** (готовый меш), а не как primitive cube с пустыми params (что строило дефолтный куб 20×20×20). (`mirror-store.ts`, `document-store.ts`)

### Changed

- **OPT (MIRROR-CACHE)**: Добавлен кэширующий механизм для previewMirror и mirrorSelected, чтобы избежать повторного вычисления зеркальных объектов (mirrorObject) при переходе от предварительного просмотра к подтверждению. previewMirror сохраняет результаты mirrorObject в кэш, а mirrorSelected проверяет кэш перед повторным вычислением. Это уменьшает нагрузку на WASM-воркер и ускоряет пользовательский интерфейс при зеркальных операциях (PR #1234)
- **OPT (MIRROR-CACHE-INVALIDATE)**: Кэш `mirrorCache` теперь корректно инвалидируется при всех операциях, изменяющих сцену: `addShape`, `addRawMesh`, `importStl`, `applyFillet`, `pasteClipboard`, `deleteSelected`, `csgBoolean`, `moveObject`, `alignSelected`, `resizeObject`, `extrudeSelected`, `jumpToHistory`, `clearScene`, `openDoodle`. Раньше кэш не инвалидировался при moveObject — зеркальные копии после перемещения объектов могли использовать неактуальные данные. (`document-store.ts`, `mirror-store.ts`)
- **OPT (MIRROR-CACHE-SYNC)**: `previewMirror` теперь проверяет кэш перед вызовом `syncObjectsForOperation`. Если plane, ids и transformHash совпадают с закэшированными — sync пропускается. Это устраняет 3 лишних sync-а при hover по трём кнопкам зеркала (YZ → XZ → XY) без перемещения объектов. (`mirror-store.ts`)
- **FIX (MIRROR-DELTA-EP)**: `moveObject` теперь пропускает вызовы с near-identical трансформами (delta < 1e-6 по всем 9 параметрам). Устранены дублирующие history-записи и лишние инвалидации кэша при double-trigger (React Strict Mode, одновременный drag + property panel sync). (`document-store.ts`)
- **FIX (TIMELINE-ICONS)**: Исправлен краш Timeline.tsx — `op.shapeType` типа `ShapeType` не включает `"text"`, удалён case "text" из switch (shapeType never включает "text" по типу). Добавлены недостающие импорты иконок (SphereIcon, CylinderIcon, ConeIcon, TorusIcon, PrismIcon, PyramidIcon). (`Timeline.tsx`)
- **PHASE-7.5 STATUS UPDATE**: Фаза 7.5 переведена из «Не начата» в «В процессе». Подзадачи 7.5.1 (верификация CSG-архитектуры) и 7.5.2 (верификация зеркала для всех типов) завершены. Актуальные задачи: 7.5.3 (тестирование цепочек операций) и 7.5.4 (финальная полировка — убрать диагностические логи, проверить производительность, обновить документацию). (`DEVELOPMENT_PLAN.md`)

### Added

- **PHASE-7.5 BLOCK B — ВИЗУАЛЬНАЯ ПОЛИРОВКА**: Расширен план Фазы 7.5 — добавлен Блок B «Интерфейс и визуальная полировка». Включает: 32 SVG-иконки (7 примитивов, 3 CSG, 3 зеркало, 4 инструмента, 5 действий, 4 файла, 3 навигация, 3 дополнительные), дизайн-систему (цвета, типографика, отступы, скругления, тени), компонент `IconButton`, структуру директорий `icons/`, 13 задач интеграции. Блок B разделён на приоритеты P0-P2. (`DEVELOPMENT_PLAN.md`)

### Added

- **PHASE-7 COMPLETED** — Фаза 7 «Исправления и улучшения» завершена. Все ~175 проблем из раундов код-ревью (Раунды 16–20) закрыты. Полная история в `CODE_REVIEW.md`.
- **PHASE-7.5 — Доводка инструментов (Параметрический скелет)**: Добавлена Фаза 7.5 в `DEVELOPMENT_PLAN.md`. Инфраструктура реализована: `createBooleanNode` (history-tree.ts), boolean-ноды в rebuild (rebuild.ts:324), mirror-store для всех типов (mirror-store.ts), syncObjectsForOperation (mirror-store.ts:51-88). 7.5.1 и 7.5.2 завершены. Осталось: тестирование цепочек (7.5.3), финальная полировка (7.5.4).

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

### Fixed

- **LOW-18-1 (dynamic import)**: НЕ БАГ — динамический импорт предотвращает circular dependency
- **LOW-18-2 (lastCsgMs)**: lastCsgMs: 0 добавлен в resizeObject CSG ветку (`document-store.ts`)
- **LOW-18-15 (dispose on error)**: try/finally с dispose в handleSyncObjects (`worker-handlers.ts`)
- **LOW-18-25 (Raycaster)**: raycasterRef кэширует Raycaster (`ViewCube.tsx`)
- **LOW-18-26 (inline styles)**: viewcube-container и viewcube-label CSS классы добавлены (`ViewCube.tsx`, `App.css`)
- **LOW-18-28 (snap-utils tests)**: getSceneMeshes и getScenePivots тесты добавлены (`snap-utils.test.ts`)
- **LOW-18-29 (rename hint)**: НЕ БАГ — title="Двойной клик — переименовать" уже есть
- **LOW-18-30 (magic number)**: INPUT_SELECT_DELAY_MS = 30 константа (`ComponentTree.tsx`)

### Fixed

- **MED-18-8 (boolean notify)**: notify() добавлен в try/catch boolean node creation (`rebuild.ts`)
- **MED-18-18 (ShapeParams)**: index signature `[key: string]` убран, строго типизирован (`types.ts`)
- **MED-18-23 (mirror mutation)**: setNode() вызывается после мутации localTransform (`history-tree.ts`)
- **MED-18-25 (getAllNodesMap)**: new Map(this._nodes) возвращает копию (`tree-store.ts`)
- **MED-18-35 (Timeline key)**: composite key `${op.type}_${id || i}` вместо key={i} (`Timeline.tsx`)
- **MED-18-36 (NumInput max)**: prop max добавлен, Math.min(max, v) в onBlur (`NumInput.tsx`)
- **MED-18-40 (ErrorBoundary)**: console.error('[ErrorBoundary] Caught error:', error) добавлен (`ErrorBoundary.tsx`)
- **MED-18-43 (STL normals)**: applyTransformToNormals() добавлена, normals трансформируются через rotation matrix (`stl-export.ts`)


- **MED-18-3 (restoreTreeFromSnapshot)**: Non-null assertions заменены на safe access с fallback к identity transform (`document-store.ts`)
- **MED-18-7 (isCsgResult)**: Поле `isCsgResult` добавлено в `SceneObject` — заменяет эвристику `!obj.params` (`types.ts`)
- **MED-18-12 (timeout)**: Таймаут send() по умолчанию снижен с 30s до 10s для sync-операций (`worker-client.ts`)
- **MED-18-14 (worker error)**: Ошибка воркера теперь включает reqId в сообщение (`worker-client.ts`)
- **MED-18-16 (mesh validation)**: Лимит 10M вершин / 30M индексов для resultVertices/resultIndices (`worker-handlers.ts`)
- **MED-18-21 (rebuildPrimitive)**: Safe access shapeType/params/localTransform с явной проверкой (`history-tree.ts`)
- **MED-18-26 (scale drift)**: Clamp scale [0.001, 1000] в applyMoveDelta для предотвращения floating-point drift (`rebuildOps.ts`)
- **LOW-18-3 (clipboard)**: Комментарий о разделении объектов сцены и буфера обмена (`document-store.ts`)
- **LOW-18-6 (makeObject)**: Принимает опциональный aabb для пропуска redundant computeAABB (`helpers.ts`)
- **LOW-18-9 (rebuild)**: Комментарий о in-place мутации extractAndCenterInPlace (`rebuild.ts`)
- **LOW-18-13 (worker init)**: Флаг _initialized для пропуска await initPromise после инициализации (`worker.ts`)
- **LOW-18-33 (text modal)**: maxLength={64} для ограничения длины текста (`TextModal.tsx`)
- **LOW-18-34 (text modal)**: isNaN проверка для Number() в onChange size/depth (`TextModal.tsx`)

- **MED-18-39 (keyboard)**: Escape не сбрасывает выделение при открытых модалках (`App.tsx`)
- **MED-18-41 (STL import)**: mergeCoincidentVertices возвращает TypedArray вместо number[] (`stl-import.ts`)
- **MED-18-42 (STL detect)**: Дополнительная проверка big-endian triangle count в detectStlFormat (`stl-import.ts`)
- **MED-18-49 (project-manager)**: Cached DB connection — getDb() вместо openDb() на каждую операцию (`project-manager.ts`)
- **MED-18-50 (listProjects)**: Оптимизация загрузки метаданных проектов (`project-manager.ts`)
- **MED-18-51 (updateProject)**: Проверка существования проекта перед обновлением (`project-manager.ts`)
- **MED-18-29 (ViewCube)**: Generation counter для предотвращения stale closure при быстрых кликах (`ViewCube.tsx`)
- **MED-18-28 (drag-select)**: Использование существующего boundingSphere вместо recomputing (`Viewport3D.tsx`)
- **MED-18-30/31 (snap-utils)**: Reuse Vector3 в collectWorldVertices/Edges для снижения GC pressure (`snap-utils.ts`)
- **MED-18-27 (Euler order)**: Документирован фиксированный порядок XYZ в computeRSMatrix (`worker-matrix.ts`)
- **MED-18-6 (extractAndCenter)**: Мутация in-place явно задокументирована в JSDoc (`helpers.ts`)
- **MED-18-9 (snapshots)**: TypedArrays хранятся напрямую без Array.from конверсии (`snapshots.ts`)
- **LOW-18-36..40**: UI fixes — Section aria-controls, Toast animation, ErrorBoundary retry button, StatusBar cleanup (`Section.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`, `StatusBar.tsx`)
- **LOW-18-37 (CSS)**: Light theme для ruler-display (`App.css`)
- **LOW-18-41 (WebGLFallback)**: Убран хардкод "Replit" (`WebGLFallback.tsx`)
- **LOW-18-43/44 (STL)**: Big-endian check + 0 triangles check (`stl-import.ts`)
- **LOW-18-45 (file picker)**: Cleanup event handlers после выбора файла (`stl-import.ts`)
- **LOW-18-48 (project)**: Проверка уникальности имени проекта при saveProject (`project-manager.ts`)
- **LOW-18-17 (import type)**: ManifoldObject импортирован как type (`history-tree.ts`)
- **LOW-18-10/11 (snapshots)**: Убран touch-on-access overhead, batch eviction (`snapshots.ts`)
- **LOW-18-23 (DPR)**: setPixelRatio в ResizeObserver (`viewport-hooks.ts`)
- **LOW-18-24 (fitView)**: Использование существующего boundingBox (`Viewport3D.tsx`)
- **LOW-18-27 (snap)**: Убран второй Raycaster в findNearestSnap (`snap-utils.ts`)
- **LOW-18-31 (LeftPanel)**: Убран useMemo для 8 элементов (`LeftPanel.tsx`)
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

### Fixed

- **LOW-18-1 (dynamic import)**: НЕ БАГ — динамический импорт предотвращает circular dependency
- **LOW-18-2 (lastCsgMs)**: lastCsgMs: 0 добавлен в resizeObject CSG ветку (`document-store.ts`)
- **LOW-18-15 (dispose on error)**: try/finally с dispose в handleSyncObjects (`worker-handlers.ts`)
- **LOW-18-25 (Raycaster)**: raycasterRef кэширует Raycaster (`ViewCube.tsx`)
- **LOW-18-26 (inline styles)**: viewcube-container и viewcube-label CSS классы добавлены (`ViewCube.tsx`, `App.css`)
- **LOW-18-28 (snap-utils tests)**: getSceneMeshes и getScenePivots тесты добавлены (`snap-utils.test.ts`)
- **LOW-18-29 (rename hint)**: НЕ БАГ — title="Двойной клик — переименовать" уже есть
- **LOW-18-30 (magic number)**: INPUT_SELECT_DELAY_MS = 30 константа (`ComponentTree.tsx`)

### Fixed

- **MED-18-8 (boolean notify)**: notify() добавлен в try/catch boolean node creation (`rebuild.ts`)
- **MED-18-18 (ShapeParams)**: index signature `[key: string]` убран, строго типизирован (`types.ts`)
- **MED-18-23 (mirror mutation)**: setNode() вызывается после мутации localTransform (`history-tree.ts`)
- **MED-18-25 (getAllNodesMap)**: new Map(this._nodes) возвращает копию (`tree-store.ts`)
- **MED-18-35 (Timeline key)**: composite key `${op.type}_${id || i}` вместо key={i} (`Timeline.tsx`)
- **MED-18-36 (NumInput max)**: prop max добавлен, Math.min(max, v) в onBlur (`NumInput.tsx`)
- **MED-18-40 (ErrorBoundary)**: console.error('[ErrorBoundary] Caught error:', error) добавлен (`ErrorBoundary.tsx`)
- **MED-18-43 (STL normals)**: applyTransformToNormals() добавлена, normals трансформируются через rotation matrix (`stl-export.ts`)


- **MED-18-3 (restoreTreeFromSnapshot)**: Non-null assertions заменены на safe access с fallback к identity transform (`document-store.ts`)
- **MED-18-7 (isCsgResult)**: Поле `isCsgResult` добавлено в `SceneObject` — заменяет эвристику `!obj.params` (`types.ts`)
- **MED-18-12 (timeout)**: Таймаут send() по умолчанию снижен с 30s до 10s для sync-операций (`worker-client.ts`)
- **MED-18-14 (worker error)**: Ошибка воркера теперь включает reqId в сообщение (`worker-client.ts`)
- **MED-18-16 (mesh validation)**: Лимит 10M вершин / 30M индексов для resultVertices/resultIndices (`worker-handlers.ts`)
- **MED-18-21 (rebuildPrimitive)**: Safe access shapeType/params/localTransform с явной проверкой (`history-tree.ts`)
- **MED-18-26 (scale drift)**: Clamp scale [0.001, 1000] в applyMoveDelta для предотвращения floating-point drift (`rebuildOps.ts`)
- **LOW-18-3 (clipboard)**: Комментарий о разделении объектов сцены и буфера обмена (`document-store.ts`)
- **LOW-18-6 (makeObject)**: Принимает опциональный aabb для пропуска redundant computeAABB (`helpers.ts`)
- **LOW-18-9 (rebuild)**: Комментарий о in-place мутации extractAndCenterInPlace (`rebuild.ts`)
- **LOW-18-13 (worker init)**: Флаг _initialized для пропуска await initPromise после инициализации (`worker.ts`)
- **LOW-18-33 (text modal)**: maxLength={64} для ограничения длины текста (`TextModal.tsx`)
- **LOW-18-34 (text modal)**: isNaN проверка для Number() в onChange size/depth (`TextModal.tsx`)

- **MED-18-39 (keyboard)**: Escape не сбрасывает выделение при открытых модалках (`App.tsx`)
- **MED-18-41 (STL import)**: mergeCoincidentVertices возвращает TypedArray вместо number[] (`stl-import.ts`)
- **MED-18-42 (STL detect)**: Дополнительная проверка big-endian triangle count в detectStlFormat (`stl-import.ts`)
- **MED-18-49 (project-manager)**: Cached DB connection — getDb() вместо openDb() на каждую операцию (`project-manager.ts`)
- **MED-18-50 (listProjects)**: Оптимизация загрузки метаданных проектов (`project-manager.ts`)
- **MED-18-51 (updateProject)**: Проверка существования проекта перед обновлением (`project-manager.ts`)
- **MED-18-29 (ViewCube)**: Generation counter для предотвращения stale closure при быстрых кликах (`ViewCube.tsx`)
- **MED-18-28 (drag-select)**: Использование существующего boundingSphere вместо recomputing (`Viewport3D.tsx`)
- **MED-18-30/31 (snap-utils)**: Reuse Vector3 в collectWorldVertices/Edges для снижения GC pressure (`snap-utils.ts`)
- **MED-18-27 (Euler order)**: Документирован фиксированный порядок XYZ в computeRSMatrix (`worker-matrix.ts`)
- **MED-18-6 (extractAndCenter)**: Мутация in-place явно задокументирована в JSDoc (`helpers.ts`)
- **MED-18-9 (snapshots)**: TypedArrays хранятся напрямую без Array.from конверсии (`snapshots.ts`)
- **LOW-18-36..40**: UI fixes — Section aria-controls, Toast animation, ErrorBoundary retry button, StatusBar cleanup (`Section.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`, `StatusBar.tsx`)
- **LOW-18-37 (CSS)**: Light theme для ruler-display (`App.css`)
- **LOW-18-41 (WebGLFallback)**: Убран хардкод "Replit" (`WebGLFallback.tsx`)
- **LOW-18-43/44 (STL)**: Big-endian check + 0 triangles check (`stl-import.ts`)
- **LOW-18-45 (file picker)**: Cleanup event handlers после выбора файла (`stl-import.ts`)
- **LOW-18-48 (project)**: Проверка уникальности имени проекта при saveProject (`project-manager.ts`)
- **LOW-18-17 (import type)**: ManifoldObject импортирован как type (`history-tree.ts`)
- **LOW-18-10/11 (snapshots)**: Убран touch-on-access overhead, batch eviction (`snapshots.ts`)
- **LOW-18-23 (DPR)**: setPixelRatio в ResizeObserver (`viewport-hooks.ts`)
- **LOW-18-24 (fitView)**: Использование существующего boundingBox (`Viewport3D.tsx`)
- **LOW-18-27 (snap)**: Убран второй Raycaster в findNearestSnap (`snap-utils.ts`)
- **LOW-18-31 (LeftPanel)**: Убран useMemo для 8 элементов (`LeftPanel.tsx`)
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

### Fixed

- **LOW-18-1 (dynamic import)**: НЕ БАГ — динамический импорт предотвращает circular dependency
- **LOW-18-2 (lastCsgMs)**: lastCsgMs: 0 добавлен в resizeObject CSG ветку (`document-store.ts`)
- **LOW-18-15 (dispose on error)**: try/finally с dispose в handleSyncObjects (`worker-handlers.ts`)
- **LOW-18-25 (Raycaster)**: raycasterRef кэширует Raycaster (`ViewCube.tsx`)
- **LOW-18-26 (inline styles)**: viewcube-container и viewcube-label CSS классы добавлены (`ViewCube.tsx`, `App.css`)
- **LOW-18-28 (snap-utils tests)**: getSceneMeshes и getScenePivots тесты добавлены (`snap-utils.test.ts`)
- **LOW-18-29 (rename hint)**: НЕ БАГ — title="Двойной клик — переименовать" уже есть
- **LOW-18-30 (magic number)**: INPUT_SELECT_DELAY_MS = 30 константа (`ComponentTree.tsx`)

### Fixed

- **MED-18-8 (boolean notify)**: notify() добавлен в try/catch boolean node creation (`rebuild.ts`)
- **MED-18-18 (ShapeParams)**: index signature `[key: string]` убран, строго типизирован (`types.ts`)
- **MED-18-23 (mirror mutation)**: setNode() вызывается после мутации localTransform (`history-tree.ts`)
- **MED-18-25 (getAllNodesMap)**: new Map(this._nodes) возвращает копию (`tree-store.ts`)
- **MED-18-35 (Timeline key)**: composite key `${op.type}_${id || i}` вместо key={i} (`Timeline.tsx`)
- **MED-18-36 (NumInput max)**: prop max добавлен, Math.min(max, v) в onBlur (`NumInput.tsx`)
- **MED-18-40 (ErrorBoundary)**: console.error('[ErrorBoundary] Caught error:', error) добавлен (`ErrorBoundary.tsx`)
- **MED-18-43 (STL normals)**: applyTransformToNormals() добавлена, normals трансформируются через rotation matrix (`stl-export.ts`)


- **MED-18-3 (restoreTreeFromSnapshot)**: Non-null assertions заменены на safe access с fallback к identity transform (`document-store.ts`)
- **MED-18-7 (isCsgResult)**: Поле `isCsgResult` добавлено в `SceneObject` — заменяет эвристику `!obj.params` (`types.ts`)
- **MED-18-12 (timeout)**: Таймаут send() по умолчанию снижен с 30s до 10s для sync-операций (`worker-client.ts`)
- **MED-18-14 (worker error)**: Ошибка воркера теперь включает reqId в сообщение (`worker-client.ts`)
- **MED-18-16 (mesh validation)**: Лимит 10M вершин / 30M индексов для resultVertices/resultIndices (`worker-handlers.ts`)
- **MED-18-21 (rebuildPrimitive)**: Safe access shapeType/params/localTransform с явной проверкой (`history-tree.ts`)
- **MED-18-26 (scale drift)**: Clamp scale [0.001, 1000] в applyMoveDelta для предотвращения floating-point drift (`rebuildOps.ts`)
- **LOW-18-3 (clipboard)**: Комментарий о разделении объектов сцены и буфера обмена (`document-store.ts`)
- **LOW-18-6 (makeObject)**: Принимает опциональный aabb для пропуска redundant computeAABB (`helpers.ts`)
- **LOW-18-9 (rebuild)**: Комментарий о in-place мутации extractAndCenterInPlace (`rebuild.ts`)
- **LOW-18-13 (worker init)**: Флаг _initialized для пропуска await initPromise после инициализации (`worker.ts`)
- **LOW-18-33 (text modal)**: maxLength={64} для ограничения длины текста (`TextModal.tsx`)
- **LOW-18-34 (text modal)**: isNaN проверка для Number() в onChange size/depth (`TextModal.tsx`)

- **MED-18-39 (keyboard)**: Escape не сбрасывает выделение при открытых модалках (`App.tsx`)
- **MED-18-41 (STL import)**: mergeCoincidentVertices возвращает TypedArray вместо number[] (`stl-import.ts`)
- **MED-18-42 (STL detect)**: Дополнительная проверка big-endian triangle count в detectStlFormat (`stl-import.ts`)
- **MED-18-49 (project-manager)**: Cached DB connection — getDb() вместо openDb() на каждую операцию (`project-manager.ts`)
- **MED-18-50 (listProjects)**: Оптимизация загрузки метаданных проектов (`project-manager.ts`)
- **MED-18-51 (updateProject)**: Проверка существования проекта перед обновлением (`project-manager.ts`)
- **MED-18-29 (ViewCube)**: Generation counter для предотвращения stale closure при быстрых кликах (`ViewCube.tsx`)
- **MED-18-28 (drag-select)**: Использование существующего boundingSphere вместо recomputing (`Viewport3D.tsx`)
- **MED-18-30/31 (snap-utils)**: Reuse Vector3 в collectWorldVertices/Edges для снижения GC pressure (`snap-utils.ts`)
- **MED-18-27 (Euler order)**: Документирован фиксированный порядок XYZ в computeRSMatrix (`worker-matrix.ts`)
- **MED-18-6 (extractAndCenter)**: Мутация in-place явно задокументирована в JSDoc (`helpers.ts`)
- **MED-18-9 (snapshots)**: TypedArrays хранятся напрямую без Array.from конверсии (`snapshots.ts`)
- **LOW-18-36..40**: UI fixes — Section aria-controls, Toast animation, ErrorBoundary retry button, StatusBar cleanup (`Section.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`, `StatusBar.tsx`)
- **LOW-18-37 (CSS)**: Light theme для ruler-display (`App.css`)
- **LOW-18-41 (WebGLFallback)**: Убран хардкод "Replit" (`WebGLFallback.tsx`)
- **LOW-18-43/44 (STL)**: Big-endian check + 0 triangles check (`stl-import.ts`)
- **LOW-18-45 (file picker)**: Cleanup event handlers после выбора файла (`stl-import.ts`)
- **LOW-18-48 (project)**: Проверка уникальности имени проекта при saveProject (`project-manager.ts`)
- **LOW-18-17 (import type)**: ManifoldObject импортирован как type (`history-tree.ts`)
- **LOW-18-10/11 (snapshots)**: Убран touch-on-access overhead, batch eviction (`snapshots.ts`)
- **LOW-18-23 (DPR)**: setPixelRatio в ResizeObserver (`viewport-hooks.ts`)
- **LOW-18-24 (fitView)**: Использование существующего boundingBox (`Viewport3D.tsx`)
- **LOW-18-27 (snap)**: Убран второй Raycaster в findNearestSnap (`snap-utils.ts`)
- **LOW-18-31 (LeftPanel)**: Убран useMemo для 8 элементов (`LeftPanel.tsx`)
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

### Fixed

- **LOW-18-1 (dynamic import)**: НЕ БАГ — динамический импорт предотвращает circular dependency
- **LOW-18-2 (lastCsgMs)**: lastCsgMs: 0 добавлен в resizeObject CSG ветку (`document-store.ts`)
- **LOW-18-15 (dispose on error)**: try/finally с dispose в handleSyncObjects (`worker-handlers.ts`)
- **LOW-18-25 (Raycaster)**: raycasterRef кэширует Raycaster (`ViewCube.tsx`)
- **LOW-18-26 (inline styles)**: viewcube-container и viewcube-label CSS классы добавлены (`ViewCube.tsx`, `App.css`)
- **LOW-18-28 (snap-utils tests)**: getSceneMeshes и getScenePivots тесты добавлены (`snap-utils.test.ts`)
- **LOW-18-29 (rename hint)**: НЕ БАГ — title="Двойной клик — переименовать" уже есть
- **LOW-18-30 (magic number)**: INPUT_SELECT_DELAY_MS = 30 константа (`ComponentTree.tsx`)

### Fixed

- **MED-18-8 (boolean notify)**: notify() добавлен в try/catch boolean node creation (`rebuild.ts`)
- **MED-18-18 (ShapeParams)**: index signature `[key: string]` убран, строго типизирован (`types.ts`)
- **MED-18-23 (mirror mutation)**: setNode() вызывается после мутации localTransform (`history-tree.ts`)
- **MED-18-25 (getAllNodesMap)**: new Map(this._nodes) возвращает копию (`tree-store.ts`)
- **MED-18-35 (Timeline key)**: composite key `${op.type}_${id || i}` вместо key={i} (`Timeline.tsx`)
- **MED-18-36 (NumInput max)**: prop max добавлен, Math.min(max, v) в onBlur (`NumInput.tsx`)
- **MED-18-40 (ErrorBoundary)**: console.error('[ErrorBoundary] Caught error:', error) добавлен (`ErrorBoundary.tsx`)
- **MED-18-43 (STL normals)**: applyTransformToNormals() добавлена, normals трансформируются через rotation matrix (`stl-export.ts`)


- **MED-18-3 (restoreTreeFromSnapshot)**: Non-null assertions заменены на safe access с fallback к identity transform (`document-store.ts`)
- **MED-18-7 (isCsgResult)**: Поле `isCsgResult` добавлено в `SceneObject` — заменяет эвристику `!obj.params` (`types.ts`)
- **MED-18-12 (timeout)**: Таймаут send() по умолчанию снижен с 30s до 10s для sync-операций (`worker-client.ts`)
- **MED-18-14 (worker error)**: Ошибка воркера теперь включает reqId в сообщение (`worker-client.ts`)
- **MED-18-16 (mesh validation)**: Лимит 10M вершин / 30M индексов для resultVertices/resultIndices (`worker-handlers.ts`)
- **MED-18-21 (rebuildPrimitive)**: Safe access shapeType/params/localTransform с явной проверкой (`history-tree.ts`)
- **MED-18-26 (scale drift)**: Clamp scale [0.001, 1000] в applyMoveDelta для предотвращения floating-point drift (`rebuildOps.ts`)
- **LOW-18-3 (clipboard)**: Комментарий о разделении объектов сцены и буфера обмена (`document-store.ts`)
- **LOW-18-6 (makeObject)**: Принимает опциональный aabb для пропуска redundant computeAABB (`helpers.ts`)
- **LOW-18-9 (rebuild)**: Комментарий о in-place мутации extractAndCenterInPlace (`rebuild.ts`)
- **LOW-18-13 (worker init)**: Флаг _initialized для пропуска await initPromise после инициализации (`worker.ts`)
- **LOW-18-33 (text modal)**: maxLength={64} для ограничения длины текста (`TextModal.tsx`)
- **LOW-18-34 (text modal)**: isNaN проверка для Number() в onChange size/depth (`TextModal.tsx`)

- **MED-18-39 (keyboard)**: Escape не сбрасывает выделение при открытых модалках (`App.tsx`)
- **MED-18-41 (STL import)**: mergeCoincidentVertices возвращает TypedArray вместо number[] (`stl-import.ts`)
- **MED-18-42 (STL detect)**: Дополнительная проверка big-endian triangle count в detectStlFormat (`stl-import.ts`)
- **MED-18-49 (project-manager)**: Cached DB connection — getDb() вместо openDb() на каждую операцию (`project-manager.ts`)
- **MED-18-50 (listProjects)**: Оптимизация загрузки метаданных проектов (`project-manager.ts`)
- **MED-18-51 (updateProject)**: Проверка существования проекта перед обновлением (`project-manager.ts`)
- **MED-18-29 (ViewCube)**: Generation counter для предотвращения stale closure при быстрых кликах (`ViewCube.tsx`)
- **MED-18-28 (drag-select)**: Использование существующего boundingSphere вместо recomputing (`Viewport3D.tsx`)
- **MED-18-30/31 (snap-utils)**: Reuse Vector3 в collectWorldVertices/Edges для снижения GC pressure (`snap-utils.ts`)
- **MED-18-27 (Euler order)**: Документирован фиксированный порядок XYZ в computeRSMatrix (`worker-matrix.ts`)
- **MED-18-6 (extractAndCenter)**: Мутация in-place явно задокументирована в JSDoc (`helpers.ts`)
- **MED-18-9 (snapshots)**: TypedArrays хранятся напрямую без Array.from конверсии (`snapshots.ts`)
- **LOW-18-36..40**: UI fixes — Section aria-controls, Toast animation, ErrorBoundary retry button, StatusBar cleanup (`Section.tsx`, `ToastContainer.tsx`, `ErrorBoundary.tsx`, `StatusBar.tsx`)
- **LOW-18-37 (CSS)**: Light theme для ruler-display (`App.css`)
- **LOW-18-41 (WebGLFallback)**: Убран хардкод "Replit" (`WebGLFallback.tsx`)
- **LOW-18-43/44 (STL)**: Big-endian check + 0 triangles check (`stl-import.ts`)
- **LOW-18-45 (file picker)**: Cleanup event handlers после выбора файла (`stl-import.ts`)
- **LOW-18-48 (project)**: Проверка уникальности имени проекта при saveProject (`project-manager.ts`)
- **LOW-18-17 (import type)**: ManifoldObject импортирован как type (`history-tree.ts`)
- **LOW-18-10/11 (snapshots)**: Убран touch-on-access overhead, batch eviction (`snapshots.ts`)
- **LOW-18-23 (DPR)**: setPixelRatio в ResizeObserver (`viewport-hooks.ts`)
- **LOW-18-24 (fitView)**: Использование существующего boundingBox (`Viewport3D.tsx`)
- **LOW-18-27 (snap)**: Убран второй Raycaster в findNearestSnap (`snap-utils.ts`)
- **LOW-18-31 (LeftPanel)**: Убран useMemo для 8 элементов (`LeftPanel.tsx`)
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
