# AGENTS.md — Контекст для AI-ассистентов

> Этот файл предназначен для AI-ассистентов (Koda, Cursor, Claude, Copilot).
> Он содержит архитектурный контекст, конвенции и ключевые паттерны проекта.

## Проект

**TinkerCraft Web** — браузерный 3D CAD-редактор. Вдохновлён CaDoodle, реализован с нуля на React + Three.js + manifold-3d.

## Стек

- **React 18** + **TypeScript 5.7** (strict mode)
- **Three.js r170** — 3D рендеринг
- **manifold-3d** (WASM) — CSG операции в Web Worker
- **Zustand 5** — стейт-менеджмент
- **Vite 6** — сборка
- **Vitest 4** — тесты (1022 теста, 85 файлов; `it.fails` открытых багов нет — UX-прогон 7 нашёл 0 новых, цикл закрыт; UX-AUDIT-1…10 исправлены в `fix-all`, 11…20 — в `fix-all-2`, 21…31 — в `fix-all-3`, 32…35 — в `fix-all-4`, 32-followup и 36…40 — в `fix-all-5`, 41, 42 — в `fix-all-6`)
- **pnpm** — пакетный менеджер

## Команды

```bash
cd web-app
pnpm dev          # dev-сервер (порт 5000)
pnpm build        # production-сборка
pnpm test         # запуск тестов (1022 теста, 85 файлов)
pnpm typecheck    # tsc --noEmit
pnpm e2e:smoke    # дымовой тест в браузере (Playwright; нужен запущенный pnpm dev; см. web-app/e2e/helpers.mjs). В CI все e2e — job `e2e` в ci-web.yml (CI-E2E)
pnpm e2e:tree     # Фаза 9.1: раскрытие CSG в дереве, выбор ребёнка
pnpm e2e:edit-child  # Фаза 9.2/9.3: правка параметра ребёнка CSG, undo
pnpm e2e:edit-step-move  # Фаза 9.5.2: ✎ у шага move → ΔX → CSG пересчитан, undo/redo
pnpm e2e:edit-step-mirror  # Фаза 9.5.3: ✎ у шага mirror → плоскость XZ → CSG пересчитан, undo/redo
pnpm e2e:edit-step-extrude  # Фаза 9.5.4: проект из e2e/fixtures/extrude-union.3dtc → ✎ у extrude → глубина 10, undo/redo
pnpm e2e:independent-copy  # CSG-INDEPENDENT-COPY: зеркало и Ctrl+C/V CSG → правка ребёнка копии не трогает оригинал и наоборот
pnpm e2e:import-mesh-csg  # IMPORT-MESH-CSG: замкнутый STL (e2e/fixtures/closed-cube.stl) ∪ куб → CSG; незамкнутый → уведомление ru/en
pnpm e2e:nested-moved-edit  # NESTED-MOVED-EDIT: G сдвинут и повёрнут до ∪ цилиндр → правка сферы во вложенном G без замка; undo/redo
pnpm e2e:ux-audit  # UX-AUDIT: ✅-сценарии без покрытия (примитивы, интерфейс, .3dtc/STL, 100k) + исправленные UX-AUDIT-1…10 (fix-all)
pnpm e2e:ux-audit-2  # UX-прогон 2 (H–N): CSG 3 уровней и копия копии в UI, 100k → экспорт, стресс, 1024/768, темы
pnpm e2e:ux-audit-3  # UX-прогон 3 (H–N повторно + O–T): текст (кириллица, CSG, 漢字/emoji), CSG со сферой, импорт ∪ импорт → .3dtc, выравнивание повёрнутого CSG, стресс 52/104, 1366, тосты, поле, история + исправленные UX-AUDIT-21/23/24/27/29/30/31 (импорт 100k без долгих задач, стрелки поля, плашка линейки, тост на 768)
pnpm e2e:ux-audit-4  # UX-прогон 4 (U–Y): текст новый/старый .3dtc/копия, цилиндр/конус/CSG, линейка по CSG, «Повернуть»/«Масштаб» и фильтры, 1280 + исправленные UX-AUDIT-32 (выравнивание с поворотом), -35 (линейка над 100k без долгих задач)
pnpm e2e:ux-audit-5  # UX-прогон 5: выравнивание с поворотом по наклонной плоскости (CSG → правка ребёнка/шага, копия, .3dtc), «Множественное», текст (зеркало зеркала, вложенный CSG), панель выравнивания 768/1024 + исправленные UX-AUDIT-32-followup (поворот на месте), -36 (имя текста в en), -37 (встречно > 90°), -38/-40 (шаг «Повернуть» в панели и истории), -39 («Вписать в экран» на 768)
pnpm e2e:ux-audit-6  # UX-прогон 6: явная проверка фиксов fix-all-5 (32-followup: призма и три призмы «Множественным» на своём X/Y; 37: 5° / 85° / 90° / 95°; 36: имя текста ru ↔ en; 38/40: «Шаг N: Повернуть» / «Масштаб», «Правка шага: поворот …»; 39: «Вписать в экран» 768 перспектива/орто) + исправленные в fix-all-6 UX-AUDIT-41 (CSG поворачивается вокруг центра рамки — центр тела по экспорту STL на месте), -42 (поворот через ±180°: «поворот (0, 0, 30)°» / «(0, 0, 90)°», а не −330 / −270)
pnpm e2e:ux-audit-7  # UX-прогон 7 (0 новых): явная проверка фиксов fix-all-6 — 41: CSG после выравнивания с поворотом (undo/redo, правка ребёнка и шага, .3dtc, копия, зеркальная копия, вложенный, «Множественное» — центр тела по STL на месте), конус/пирамида/текст/импорт — вокруг опорной точки; 42: поле 270, 170 → 200 и «поворот (0, 0, 30)°» (ru/en, правка шага), 350 + 30 → 380, гизмо через 180° (Z) и 90° (Y) — кольцо по цвету на снимке
pnpm e2e:align-ui-revit  # ALIGN-UI-REVIT: «Выровнять» → Z → верх B в 0; грань A → B; «Множественное»; Esc; правый клик
pnpm e2e:align-obb  # ALIGN-REVIT: режимом «Выровнять» — повёрнутый цилиндр боковой (гладкой) гранью к грани куба — касание по реальной геометрии; повёрнутый куб плоской гранью к плоскости XY — поворот (UX-AUDIT-32)
pnpm e2e:align-plane-resolve  # ALIGN-PLANE-RESOLVE: режим «Выровнять» → шаг align («Выровнять по грани», ✎ нет) → правка «Переместить» якоря до выравнивания → снова заподлицо; undo/redo, .3dtc; призма с поворотом; плоскость по оси
pnpm e2e:n-ary-csg  # N-ARY-CSG: 10 кубов → «Объединение» → один CSG, 10 детей плоско, правка 5-го ребёнка, undo/redo; A (5) → «Вычитание» → B (5) → Enter / «Пересечение» → «ОК» → один CSG с группами A и B; 31 куб → предупреждение «много объектов», CSG создан
pnpm e2e:csg-group-fix  # CSG-GROUP-FIX: кнопок групп нет; A (5) → «Вычитание» → режим (статус-бар «A: 5, B: 0», метки «A») → B → Esc — без изменений; X → B → Enter / «Пересечение» → «ОК» / кнопка ещё раз → один CSG; «Объединение» — сразу
pnpm e2e:double-click-timing  # клики по иконке палитры на медленном CPU (в очереди при занятом главном потоке): два клика — один режим размещения, 0 фигур, Enter — 1; иконка + клик по сетке в очереди — 1 фигура на сетке; палитра на месте до 14 фигур (история прокручивает только свой список)
pnpm e2e:plug-and-play  # PLUG-AND-PLAY: «Куб» → режим (0 фигур) → превью на сетке → клик → куб на сетке (Z = 10); «Сфера» → верхняя грань куба → сфера стоит на кубе; X / Y / Z → YZ / XZ / XY (нормаль — к камере), цилиндр лёжа на YZ; Esc / правый клик — отмена; Enter над сценой — в превью
pnpm e2e:dimensions  # DIMENSIONS: меню «Размер» (3 пункта, Esc), D — режим сразу; «Поставить размер» → точка куба 1 → точка куба 2 → число = |B − A|; клик по линии — выделен; сдвиг / масштаб куба 2 и Ctrl+Z / Ctrl+Y — число за объектом; «Показать / скрыть размеры»; «Настройки» к выбранному — Проекция, цвет, шрифт; Delete — размер удалён, кубы на месте
pnpm e2e:ux-viewport  # UX-VIEWPORT: ЛКМ-протяжка вид не вращает, ПКМ вращает, СКМ сдвигает; F и двойной клик СКМ — вписать; сетка: шаги 1 → 5 → 10 → 50 → 100 (жирная ×10), не обрывается на отдалении и после сдвига; рамка: слева направо — синяя, только целиком внутри; справа налево — зелёная пунктирная, задетые; Shift — добавить
pnpm e2e:selection-outline  # SELECTION-OUTLINE: ничего не выделено — каймы нет; клик по кубу — синяя кайма вокруг него (2–4 px); клик в пусто — нет; Shift+клик / рамка — кайма у всех; светлая тема, орто, гизмо; 100k + 24 объекта выделены — FPS ≥ 55
pnpm e2e:ux-polish  # ux-polish: A — CSG-GROUP-UI (кнопки CSG в тулбаре; «Вычитание» → кайма A оранжевая, B синяя; Esc — каймы A нет); B — CLEANUP-TREE-SNAPSHOT (куб − сфера → X → undo / redo — объекты и дети CSG как были); C — SHADOW-BOUNDS-400 (куб на X = 0 / 600 / 1500 и отдалились — тень есть, центр области теней у куба); D — DIMENSION-UNDO (размер → Delete → Ctrl+Z — вернулся, Ctrl+Y — удалён; кнопки тулбара; история документа не меняется)
pnpm e2e:ortho-raycast  # ORTHO-RAYCAST: ортография — линейка у краёв вида = сетке под курсором (по режиму размещения), линейка с верха куба у края, гизмо — стрелка X ловится и куб идёт за мышью (+120 px); перспектива — как раньше
pnpm e2e:ux-formats-settings  # Пакет A: «Настройки» (язык ru → en → ru, единицы см — поле «2.00 см», ввод 5 см → 50 мм, перезагрузка, «Сбросить», Esc), «Высокий контраст» (панель и фон сцены чёрные), звуки (click / create / success, выкл. — тишина), «Экспорт» STL / OBJ / 3MF / glTF и «Импорт» OBJ, замок (клик и Ctrl+A не выбирают, Delete — остаётся, снять — выбирается)
```

## Текущий статус

| Фаза | Описание | Статус |
|------|----------|--------|
| 0–7.6 | Ядро CAD, CSG, UI, Mirror, Timeline | ✅ Завершены |
| **8** | **Единая модель трансформов** | ✅ Завершена (v1.1.0) |
| **8.5** | **Унификация отрисовки и данных** | ✅ Завершена (v1.2.3) |
| **9** | **Параметрическая история** — 9.1–9.4, 9.6–9.9 ✅; 9.5.0 (эффективная история) ✅; 9.5.1 (fillet) ❌ отменена; 9.5.2 move ✅; 9.5.3 mirror ✅; 9.5.4 extrude ✅; CSG-INDEPENDENT-COPY, IMPORT-MESH-CSG, ALIGN-REVIT ✅ | ✅ Завершена (v1.3.0, `phase-9 → main`) |
| 10 | Яндекс.Игры — монетизация (ветка `yandex-games`) | 🔄 Отдельная ветка (Y.1–Y.5 ✅; v1.4.0 — `main` v1.3.9 + SDK и экономика, PR #52) |
| 11 | B-Rep и тяжёлая математика (FILLET-CHAMFER-BREP — OCCT WASM, EDIT-VERTICES, SVG-EXTRUDE — настоящий extrude 2D→3D, THREAD-GENERATOR, STEP) | 🔲 Запланирована |
| 12 | Инструменты моделирования (ARRAY-TOOL — массивы, LOCK-OBJECT — блокировка, новые примитивы) | 🔲 Запланирована |
| 13 | UX, форматы, настройки (APP-SETTINGS, THEME-ENGINE, SFX, FORMATS-OBJ-3MF-GLTF) | 🔲 Запланирована |

**Фаза 8 в деталях:** `web-app/ARCHITECTURE_TRANSFORMS.md`
**Фаза 8.5 в деталях:** `web-app/ARCHITECTURE_RENDER.md`
**Фаза 9 в деталях:** `docs/PHASE_9_DESIGN.md` (9.1–9.9), `docs/PHASE_9_5_DESIGN.md` (9.5: правка прошлых шагов, каскад CSG)

## Ветки

| Ветка | Назначение |
|-------|------------|
| `main` | Чистый CAD (Open Source, GPL-3.0), **production**: push в `main` → деплой GitHub Pages (`deploy.yml`). Фаза 9 — с v1.3.0 |
| `phase-9` | Фаза 9 (от `main`) — смержена в `main` (v1.3.0, v1.3.1) и удалена после v1.3.1 |
| `<задача>` | Короткие ветки задач от `main` → PR в `main` (merge-коммит после зелёного CI), ветка удаляется. Push в `main` → деплой GitHub Pages. До v1.3.1 задачи Фазы 9 шли через `phase-9` (PR #1–#17) |
| `yandex-games` | Версия для Яндекс.Игр (экономика, реклама, токены); отдельно, Фазу 9 ещё не содержит |

Цепочка: `main` (v1.3.11) → ветки задач → PR в `main`. `yandex-games` — отдельно.

**`main` — production.** Любой push в `main` (merge PR) сразу выкладывает GitHub Pages (`deploy.yml`). Поэтому: в `main` — только через PR после зелёного CI, ничего «в процессе»; версия в `web-app/package.json` и `APP_VERSION` (`src/constants.ts`) должна соответствовать коду — значимый merge (фича, фикс) сопровождается patch-релизом: версия + CHANGELOG `[x.y.z]` + тег `vX.Y.Z` после зелёного деплоя.

## Архитектура (data flow)

```
User Input → App.tsx (UI) → document-store.ts (Zustand) → worker-client.ts → worker.ts (WASM CSG)
                ↓                    ↓                                               ↓
           Viewport3D.tsx      history[] (undo/redo)                          manifold-3d
           (Three.js render)   IndexedDB autosave
                                     ↓
                            history-tree.ts (Build Tree)
                            (primitive / boolean / baked)
```

### Ключевые файлы

| Файл | Ответственность |
|---|---|
| `src/App.tsx` | Layout, keyboard shortcuts, text modal form state |
| `src/constants.ts` | Общие константы (ALL_SHAPES, SNAP_VALUES, OP_FILTER_LABELS, spacing, epsilon, `TOOLTIP_DATA` — подсказки с сочетаниями, `ADD_SHAPE_DEBOUNCE_MS`) |
| `src/hotkeys.ts` | Клавиша → действие (`resolveHotkey`, UX-AUDIT-5): все сочетания из `TOOLTIP_DATA`; App только исполняет. `hotkeys.test.ts` сверяет каждое сочетание подсказки с действием её инструмента |
| **Store** | |
| `src/store/document-store.ts` | Zustand store — действия (create), 500 строк |
| `src/store/ui-store.ts` | Zustand store — UI state (gizmo, theme, camera, modals, etc.) |
| `src/store/helpers.ts` | Утилиты store (extractAndCenter, extractAndCenterGetAABB, computeAABB, makeObject, nextId, colorForIndex; `computeWorldAABB` — мировая рамка по реальной геометрии с полным TRS (вершины; без вершин — OBB `obbCorners`/`obbWorldAABB` из `localParamsBox`, ALIGN-REVIT), `worldVerticesAABB`, `solveAlignDeltas` — решатель выравнивания, общий для `alignSelected` и re-solve 9.5.2; `solvePlaneAlignDelta`/`worldProjectionRange`/`axisPlane` — выравнивание грани по плоскости (ALIGN-UI-REVIT); `solvePlaneAlignTransform` — то же с поворотом непараллельной плоской грани на месте (вокруг центра тела `alignRotationCenter`: у примитивов — опорная точка, UX-AUDIT-32-followup; у CSG — центр рамки, UX-AUDIT-41), `isSmoothSurfaceAt` — грань гладкой поверхности (порог = затенению), `eulerXYZFromMatrix` (UX-AUDIT-32), `continuousEuler` — углы в записи, ближайшей к прежним (дельта шага в ±180°; выравнивание и гизмо, UX-AUDIT-42); `faceToLocal`/`faceToWorld` — грань в системе объекта и обратно, `solvePlaneAlignMove` — решение шага выравнивания по плоскости (живое `alignToPlane` и каскад, ALIGN-PLANE-RESOLVE); `extrudeSlab` — плита extrude по мировой рамке базы, 9.5.4) |
| `src/store/types.ts` | DocumentStore interface |
| `src/store/rebuild.ts` | rebuildFromHistory — восстановление объектов из истории операций |
| `src/store/snapshots.ts` | Snapshot cache для мгновенного undo/redo (PERF-1) — только объекты; дерево не снимается (CLEANUP-TREE-SNAPSHOT: undo/redo перестраивают его из операций) |
| `src/store/notifications.ts` | Toast-уведомления (замена alert) |
| `src/store/add-text.ts` | 3D-текст в сцену (`addTextObject`): меш `io/text-mesh.ts`, имя «Текст: …», ошибка → уведомление (UX-AUDIT-3/6/10) |
| `src/store/text-object.ts` | 3D-текст как объект (UX-AUDIT-31): `textOfOp` (строка текста шага `import_mesh`: поле `text`, у старых — по id `txt_N` и имени), `isTextObject` — история «Добавить текст: …», «Тип: Текст», иконка текста; `textsByObjectId`/`textOfNode` — текст запечённых узлов дерева CSG по истории (import_mesh с текстом, зеркальные копии, узлы копий CSG — UX-AUDIT-34); `defaultTextName` — имя по умолчанию «Текст: …» → строка, `displayName` показывает его на языке интерфейса (UX-AUDIT-36) |
| `src/store/add-shape-queue.ts` | `addShapeWhenIdle(type, { at, timeoutMs })` — фигура, когда стор свободен (UX-AUDIT-9: поставленная во время долгого CSG ждёт очереди, не теряется); `at` — место из режима размещения. Фильтр двойного клика по иконке (DOUBLE-CLICK-TIMING) удалён — клик по иконке только включает размещение (PLUG-AND-PLAY) |
| `src/store/placement.ts` | Геометрия размещения (PLUG-AND-PLAY, чистые функции): `resolvePlacement` — луч → плоскость (ось X / Y / Z → YZ / XZ / XY через начало координат → грань под курсором → сетка z = 0; нормаль оси и сетки — к камере) → точка с шагом привязки (`snapInPlane`: на сетке, оси и грани, перпендикулярной оси) → трансформ фигуры, СТОЯЩЕЙ на плоскости (`placementTransform`: локальная +Z — по нормали `rotationForNormal`, pivot = точка + нормаль × `meshBottom`) |
| `src/store/placement-mode.ts` | **Режим размещения** (PLUG-AND-PLAY): `placementMode` (`shapeType`, `lock` — ось, `preview`, `mesh` — меш превью из воркера, кэш по типу), `startPlacement` (клик по иконке; та же — без изменений, выход из «Выровнять» / CSG A → B / линейки), `aim` (луч + грань под курсором → превью), `setPreview`, `setSnap` / `toggleAxis` (X / Y / Z), `confirmPlacement(at?)` (клик — в точке клика; без `at` — Enter: в превью, без превью — рядом с прошлыми; мимо плоскостей — режим остаётся), `cancelPlacement` |
| `src/hooks/usePlacementMode.ts` | Esc / Enter / X·Y·Z режима размещения (capture, раньше App; X — не «Вычитание»; не в поле ввода и не под модалкой); вход в «Выровнять», режим CSG A → B или линейку — выход из размещения. Превью — `viewport-hooks` › `usePlacementPreview` (меш фигуры, прозрачность 0,5, вне raycast); клик / правый клик / уход курсора — `Viewport3D`; подсказка, плоскость, место, «Поставить» / «Отмена» — `StatusBar` |
| `src/store/dimensions.ts` | **Размеры — модель и геометрия** (DIMENSIONS, чистые функции): `Dimension` (объекты A / B, точки в их ЛОКАЛЬНЫХ координатах + локальная рамка при создании, `offset`, `style`: kind standard / offset / projection, цвет, шрифт, высота текста, мм); `anchorOf` / `anchorWorldPoint` (ассоциативность: трансформ объекта × точка, смена геометрии — перенос в новую рамку `remapLocalPoint`), `dimensionEnds`, `dimensionGeometry` (линия, выносные, место числа, значение; проекция — на XY), `isDimensionAlive` (объекта нет — размер скрыт), `sanitizeDimensions` (файл / автосохранение) |
| `src/store/dimensions-store.ts` | **Слой размеров**: `dimensions`, `showDimensions`, `selectedDimensionId`; `addDimension`, `removeDimension`, `toggleShowDimensions`, `setDimensionStyle`, `updateDimensionPoints`, `setDimensions`; стек отмены размеров `undoStack` / `redoStack` (DIMENSION-UNDO, записи с позицией истории документа; `setDimensions` — пуст). Не в `document-store` и не шаги истории — undo документа слой не трогает |
| `src/store/dimension-mode.ts` | Режим «Размер» (D): `dimensionMode` (`first` — A, `hover` — точка под курсором, `created`), `clickPoint` (A, затем B → размер, режим остаётся), `start` / `exit` / `toggle` (выход из «Выровнять», CSG A → B, размещения, линейки); действия `createDimension` (стиль — `ui-store.dimensionDefaults`), `deleteDimension`, `restyleDimension` — помечают документ несохранённым и пишут запись отмены (`recordDimensionChange`, DIMENSION-UNDO) |
| `src/store/dimension-undo.ts` | **Отмена действий с размерами** (DIMENSION-UNDO): `recordDimensionChange` (создание / удаление / стиль + позиция истории документа), `undoWithDimensions` / `redoWithDimensions` — Ctrl+Z / Ctrl+Y и кнопки тулбара (App): запись размеров на текущей позиции документа — она, иначе шаг документа; `canUndoDimension` / `canRedoDimension` — доступность кнопок; подписка на `document-store`: новый шаг — redo размеров пуст, другой документ — стек пуст |
| `src/hooks/useDimensionMode.ts` | Esc в режиме «Размер», Delete / Backspace при выделенном размере (удаляет размер, не объекты), согласованность: другие режимы — выход, выделили объект — выделение размера снято |
| `src/components/dimension-render.ts` | 3D размера: `buildDimensionObject` (LineSegments — размерная и выносные, конусы-стрелки, число — Sprite-billboard с canvas-текстурой; поверх объектов, `userData.dimensionId`), `pickDimension` (raycast), `disposeDimensionObject`. В сцене — `viewport-hooks` › `useDimensionsRender` (слой) и `useDimensionModePreview` (маркер привязки, превью A → курсор) |
| `src/components/DimensionMenuButton.tsx` / `DimensionSettingsModal.tsx` / `DimensionPanel.tsx` / `DimensionList.tsx` | Кнопка «Размер» в тулбаре (группа «Линейки») — меню в портале: «Поставить размер» (D), «Настройки размера», «Показать / скрыть размеры» (галочка); «Настройки размеров» (тип, цвет, шрифт, высота, отступ, мм; к новым / к выбранному); панель выделенного размера (вместо свойств: значение, тип, отступ, «Стиль…», удалить); список «Размеры» в левой панели (значения, выделение, корзина) |
| `src/store/mirror-store.ts` | Store для зеркальных операций; зеркало CSG — независимая копия дерева (`copySubtree` с плоскостью) |
| **CSG / Build Tree** | |
| `src/csg/history-tree.ts` | **Build Tree** — параметрическое дерево (primitive/boolean/baked; boolean — N детей + `groupA`, `createBooleanNode(id, op, childIds, transform?, groupA?)`, N-ARY-CSG), `rebuildNode`, `mirrorNodeRecursive`, `cloneSubtree`; независимая копия CSG (`copySubtree`, `snapshotSubtree`, `instantiateSubtree`, id узлов `${idКопии}:${idИсточника}`); у boolean-узла `originTransform` (TRS₀ — система листьев; вложенный boolean воркер переносит на `Mat(localTransform)·Mat(originTransform)⁻¹`, NESTED-MOVED-EDIT) |
| `src/csg/tree-store.ts` | Zustand-стор для Build Tree |
| `src/csg/tree-view.ts` | Read-модель Build Tree для UI (`getTreeView` — дети N-арного узла плоским списком, `viewGroupSplit` — заголовки «Группа A»/«Группа B» у subtract/intersect, `findViewNode`, `formatParams`) и единая проверка редактируемости `isChildEditable` — Фаза 9.1/9.9 |
| `src/hooks/useRootConsistency.ts` | Согласованность дерева CSG-корня с мешем (замки в дереве) — Фаза 9.9 |
| `src/csg/child-params.ts` | Поля параметров примитива для формы правки ребёнка CSG (`getParamFields`, `clampFieldValue`) — Фаза 9.2. Подписи размеров — по оси (AXIS-LABELS): куб `width` — X, `height` — **Y**, `depth` — **Z** (`Manifold.cube([w, h, d])`, вверх — Z); высота цилиндра / конуса / призмы / пирамиды — Z (`properties.sizeX/Y/Z`) |
| `src/store/edit-child.ts` | Пересчёт CSG после смены params ребёнка: калибровка дерева ↔ меш, un-bake в локальную систему корня (`computeEditedChild`, `unbakeToLocal`, `findCreationTransform` — в т.ч. система создания копий: зеркало — отражённая, вставка — `copyTree.origin`) — Фаза 9.3 |
| `src/store/project-history.ts` | **Эффективная история** (Фаза 9.5.0): `projectHistory` подставляет `edit_step` (патч шага N + `replacements` замороженных шагов) и выбрасывает их; идемпотентна, вызывается на входе `rebuild.ts` и `findCreationTransform`. `computeCascade` — замыкание зависимостей правки |
| `src/store/csg-result.ts` | Общее ядро CSG `computeCsgResult` (sync → boolean → pivot = transformA → un-bake RS) для `csgBoolean` и каскада 9.5; `computeCsgResultN` — N операндов (N-ARY-CSG: union N, subtract/intersect группа A vs B; 2 операнда — бинарный путь); `syncObjectsForOperation`, `groupOperationFromResult`, `groupReplacementFromResult` |
| `src/store/csg-operands.ts` | Операнды N-арного CSG (N-ARY-CSG): `resolveCsgOperands` — выделение + группы A/B → `ids` и `groupA` (обе группы; одна — вторая из выделения; без групп — первый против остальных), `aliveGroups`, `uniqueAlive` |
| `src/store/csg-group-mode.ts` | **Режим A → B → Enter** (CSG-GROUP-FIX, кнопок «Группа A/B» нет): `csgGroupMode` (`operation`, зафиксированная `groupA`), `startCsgGroup` (выделение → A, выделение снимается), `confirmCsgGroup` (B = выделение без A → `csgBoolean(op, { a, b })`), `cancelCsgGroup` (Esc — выделение снова A), `pressCsgOperation` — кнопка / U X I: объединение сразу, вычитание / пересечение — режим, в режиме та же — ОК (без B — выход), другая — смена; `csgButtonStates` — доступность / нажатость кнопок CSG; `groupBOf` |
| `src/hooks/useCsgGroupMode.ts` | Enter / Esc режима CSG (capture, раньше App; не в поле ввода и не под модалкой), чистка исчезнувших объектов A, выход при «Выровнять». Подсказка «A: N, B: M» и «ОК» / «Отмена» — `StatusBar`; подсветка A — `viewport-hooks` (`EMISSIVE_GROUP_A`) и тёплая кайма (`GROUP_A_OUTLINE`, CSG-GROUP-UI; B — выделение, синяя кайма), метки «A» / «B» — `ComponentTree` |
| `src/store/edit-step.ts` | **Правка прошлого шага** (Фаза 9.5.2): `computeStepEdit` — гипотетическая проекция + каскад (`group` через `computeCsgResult`, `edit_child_params` путём 9.3, `align` re-solve (по плоскости — `solvePlaneAlignMove`, ALIGN-PLANE-RESOLVE)); атомарный отказ; `isStepEditable` / `SUPPORTED_KINDS` — какие шаги правятся (move, mirror, extrude — группа с `source`); плита extrude пересчитывается по рамке базы (`extrudeSlab`) |
| `src/store/align-mode.ts` | **Режим выравнивания** (ALIGN-UI-REVIT): `alignMode` (плоскость A — грань или ось, «Множественное», грань под курсором), `clickFace` (A, затем B), `applyAlignB` → `solvePlaneAlignTransform` (UX-AUDIT-32: плоская непараллельная грань B — поворот на месте (CSG — вокруг центра рамки, UX-AUDIT-41) + сдвиг: угол с нормалью A ≤ 90° — в ту же сторону, > 90° — встречно, UX-AUDIT-37; параллельная и грань гладкой поверхности — сдвиг) → `alignToPlane` (один шаг `align` с плоскостью — ALIGN-PLANE-RESOLVE: плоскость A и грань B в системах своих объектов, правка прошлого шага пересчитывает) |
| `src/components/AlignPanel.tsx` | Панель режима выравнивания (вместо свойств): подсказка, X/Y/Z, текущая плоскость, «Множественное», «Готово» |
| `src/components/align-picking.ts` | Raycast по треугольнику (`pickFace` — мировые нормаль и точка) и плоская грань для подсветки (`planarFaceTriangles`) |
| `src/hooks/useAlignModeKeys.ts` | Esc → выход из режима выравнивания (capture, раньше общего обработчика App) |
| `src/hooks/useAutosave.ts` | Автосохранение (таймер) и восстановление прошлой сессии при старте, когда воркер готов (UX-AUDIT-1) |
| `src/components/object-geometry.ts` | Геометрия Three.js объекта (`buildObjectGeometry`, UX-AUDIT-20) — одна для создания и обновления меша: куб/призма/пирамида — плоско, CSG/импорт/цилиндр/конус — по углу излома 30° (`toCreasedNormals`, без индекса; UX-AUDIT-26 — острая кромка торца), сфера/тор — гладко. `useMeshSync` пересобирает геометрию только при изменении источника (`rememberGeometrySource`: длины и хэш вершин в `userData`, UX-AUDIT-21) |
| `src/components/ConfirmModal.tsx` | Подтверждение разрушительного действия («Очистить сцену», UX-AUDIT-2): фокус на «Отмена», Esc/фон — отмена, клавиши не уходят в глобальные сочетания |
| `src/components/StepPanel.tsx` | Панель «Шаг N» (вместо `PropertiesPanel`, пока `ui-store.selectedStep` задан): ΔX/ΔY/ΔZ шага move (коммит по Enter/blur), плоскость шага mirror (сразу по выбору), глубина шага extrude (ось — просмотр) → `editStepParams` — Фаза 9.5.2–9.5.4; заголовок шага move — по виду (`kind`): «Повернуть» / «Масштаб» / «Перемещение», «Исходно» — сдвиг, поворот и масштаб (UX-AUDIT-38) |
| `src/hooks/useSelectedStepGuard.ts` | Сброс выбора шага (undo до шага, выделение в сцене, выбор ребёнка CSG) — Фаза 9.5.2 |
| `src/components/ChildPropertiesPanel.tsx` | Панель свойств выбранного ребёнка CSG (вместо `PropertiesPanel`, пока `ui-store.selectedChild` задан) — Фаза 9.2 |
| `src/components/ComponentTree.tsx` | Дерево объектов сцены; CSG-результат раскрывается в детей из Build Tree, выбор ребёнка → `ui-store.selectedChild` — Фаза 9.1; замок объекта (LOCK-OBJECT, `onToggleLock`) |
| `src/csg/rebuildOps.ts` | `applyMoveDelta`, `applyMirrorToTransform`, `applyAlignToTransform`; `expandForReplay` — шаг `align` с плоскостью (режим «Выровнять») воспроизводится как move каждой цели (мета, дерево, воркер — ALIGN-PLANE-RESOLVE) |
| `src/csg/worker.ts` | WASM worker — manifold-3d операции, типобезопасные интерфейсы |
| `src/csg/worker-client.ts` | Promise-обёртка над воркером |
| `src/csg/worker-handlers.ts` | Индивидуальные handlers для каждой операции; `combineOperands` — одно ядро N-арного boolean (union N — пакетный `Manifold.union`; subtract/intersect — union(A) op union(B); 2 операнда — прежний бинарный путь) для `csgBooleanMulti`, дерева (`rebuildTreeNode`) и истории (`rebuildScene`) — N-ARY-CSG |
| `src/csg/worker-matrix.ts` | Чистая матричная математика (SRT, RS, transform); `relativeTransformMatrix` — поправка вложенного CSG `Mat(TRS_cur)·Mat(TRS₀)⁻¹` (NESTED-MOVED-EDIT) |
| `src/csg/types.ts` | Типы операций, сцены, параметров, `TreeNode` |
| `src/csg/BUILD_TREE_SPEC.md` | Спецификация Build Tree (1410 строк) |
| **Components** | |
| `src/components/Viewport3D.tsx` | Three.js вьюпорт, гизмо, raycaster, ruler, snap-to-geometry; режим размещения (PLUG-AND-PLAY): наведение → `aim` (throttle 50 мс + последнее положение), клик — `confirmPlacement`, правый клик — отмена, гизмо скрыт, курсор — прицел, `data-placement*` для e2e; навигация (VIEWPORT-NAV): ЛКМ — выбор и рамка, ПКМ — вращение, СКМ — сдвиг, колесо — масштаб, двойной клик СКМ — «Вписать» (`viewport-nav.ts`); рамка выделения (SELECTION-RECT) |
| `src/components/viewport-nav.ts` | Кнопки мыши OrbitControls (`VIEWPORT_MOUSE_BUTTONS`: LEFT — нет, MIDDLE — сдвиг, RIGHT — вращение), детектор двойного клика СКМ (`createMiddleDoubleClick`) |
| `src/components/adaptive-grid.ts` | Сетка (GRID-ADAPTIVE): шейдерная плоскость — тонкая + жирная ×10 + оси, шаг 1 / 5 / 10 / 50 / 100 по масштабу (`gridStepFor`, клетка ≥ 16 px), без края (следует за целью камеры, гаснет к краю радиуса `gridRadiusFor`); обновляется в цикле отрисовки, `data-grid-step` / `-major` / `-radius` / `-center` у вьюпорта; темы — `setAdaptiveGridTheme` |
| `src/components/selection-outline.ts` | Кайма выделенных (SELECTION-OUTLINE): `SelectionOutlinePass` — `OutlinePass` прямо на канвас (без EffectComposer: сцена — обычный `renderer.render`, затем проходы каймы, затем накладки с флагом `DRAW_OVER_OUTLINE` — гизмо, размеры); обычное смешивание (светлая тема), маска под тип камеры (`setCamera`), буферы в CSS px; `selectionOutlineTargets` (выделенные видимые меши, каждый кадр), `renderWithSelectionOutline` (несколько проходов: группа A режима CSG — тёплая `GROUP_A_OUTLINE`, затем выделенные — синяя; нет объектов — один `render`); `data-outline-count` / `data-outline-a-count` у вьюпорта (e2e) |
| `src/components/shadow-follow.ts` | Тени у центра вида (SHADOW-BOUNDS-400): `shadowFrustumFor(target, distance, mapSize)` — область теней (полуразмер `shadowHalfFor` ≥ 200 мм и ≥ расстояния, ступени ×1,25; центр в узле текселей в осях света; солнце по `SUN_DIR`; bias / normalBias — под размер, в мировых единицах как при ±200), `applyShadowFrustum` (солнце, цель, камера тени, приёмник), `sameShadowFrustum`; в цикле отрисовки — `useThreeInit`, `data-shadow-half` / `-center` у вьюпорта |
| `src/components/selection-rect.ts` | Рамка выделения (SELECTION-RECT): `rectModeOf` (вправо — окно, влево — секущая), `objectsInRect` / `meshInRect` по настоящей геометрии (окно — все вершины в рамке; секущая — вершина или треугольник пересекает рамку, `triangleOverlapsRect` — SAT) |
| `src/store/settings.ts` / `src/store/units.ts` / `src/themes/` / `src/components/SettingsModal.tsx` | **Настройки** (APP-SETTINGS): `useSettingsStore` — тема, звуки, единицы (localStorage `tinkercraft-settings`, `sanitizeSettings`), язык — i18next (`setLanguage`), `reset`; окно — шестерёнка в статус-баре (`ui-store.showSettings`). Единицы длины — только показ и ввод (модель в мм): `NumInput` без `unit` — поле длины (пересчёт там), линейка и размеры — `lengthLabel`. **Темы** (THEME-ENGINE): `src/themes/<id>.json` (id, order, name ru/en, base, vars, scene) — новая тема = новый JSON, `themes/index.ts` (`THEMES`, `applyTheme`, `parseTheme`); стили светлых тем — `[data-theme="light"]` в `App.css` |
| `src/sfx.ts` / `src/hooks/useSfx.ts` | **Звуки** (SFX): `playSfx(kind)` — Web Audio-тоны `SFX_RECIPES` (click / create / success / error), вкл. и громкость — `useSettingsStore.sound`; `setSfxBackend` — подмена вывода в тестах; `<html data-sfx-last / data-sfx-count>` — для e2e. Когда звучит — `useSfx` (клик по кнопке, новый шаг истории `newOperation` → `sfxForOperation`, уведомление error / warning); размер — `createDimension` |
| `src/components/view-ray.ts` | Луч из курсора по **активной** камере вида (ORTHO-RAYCAST): `ndcFromClient`, `rayFromCamera` (`setFromCamera` — перспектива / орто), `groundPointOnRay` (луч ∩ плоскость z = 0 — не формула «от позиции камеры»), `syncGizmoCamera` (гизмо на камере вида — каждый кадр). Новый код, бросающий луч из курсора, берёт `activeCameraRef`, не `cameraRef` (та всегда перспективная) |
| `src/components/camera-fit.ts` | «Вписать в экран» (F): `fitDistance` — расстояние камеры по рамке сцены с учётом угла обзора и соотношения сторон вьюпорта (узкий — сцена не обрезается; широкий — как раньше, 2,5 × размер), `FIT_DIR` — направление (UX-AUDIT-39) |
| `src/components/snap-utils.ts` | Привязка (snap) к геометрии: vertex, edge, face, circle; кандидаты — треугольники рядом с точкой попадания (сетка треугольников геометрии в локальных координатах, кэш на геометрию — UX-AUDIT-35: 100k — ~6 мс на запрос); рёбра — и у геометрии без индекса (по позициям, UX-AUDIT-22) |
| `src/components/Toolbar.tsx` | Тулбар (файл, undo, view, gizmo, линейка и «Размер» (меню), CSG, тема); раскладка — `hooks/useToolbarLayout.ts` (ширина кнопки + реальный зазор `.toolbar-group-row`; на 1366 — одна строка с названием); у каждой кнопки `aria-label` = подпись тултипа (`IconButton`), e2e ищут кнопки по нему (`toolbarButton`/`panelButton` в `e2e/helpers.mjs`), не по индексу |
| `src/components/LeftPanel.tsx` | Палитра фигур + список объектов + история; клик по фигуре — режим размещения (`onAddShape` = `startPlacement`), размещаемая фигура — нажатая иконка; «Текст» — окно ввода |
| `src/components/PropertiesPanel.tsx` | Панель свойств (трансформ, resize, CSG; extrude в UI нет — EXTRUDE-3D-SCALE) |
| `src/components/TextModal.tsx` | Модалка 3D текста |
| `src/components/StatusBar.tsx` | Статус-бар |
| `src/components/NumInput.tsx` | Numeric input с draft-редактированием; единица по умолчанию — «мм»/«mm» по языку; `integer` — целое поле (UX-AUDIT-7/8) |
| `src/components/Section.tsx` | Collapsible section |
| `src/components/Timeline.tsx` | История операций + opIcon/opLabel; `filterKeyOf` — категория шага для фильтра («Вставить», «Повернуть», «Масштаб» — UX-AUDIT-29); подпись правки шага move — группы, которые правка меняет: сдвиг / поворот / масштаб (UX-AUDIT-40); к текущему шагу прокручивается только `.tl-list`, не левая панель (`scrollListToItem`, DOUBLE-CLICK-TIMING) |
| `src/components/list-scroll.ts` | `scrollListToItem` — прокрутить список к элементу (как `block: 'nearest'`) без прокрутки предков; `scrollIntoView` двигал `.panel-left` — палитра уезжала из-под курсора (DOUBLE-CLICK-TIMING) |
| **IO** | |
| `src/io/stl-import.ts` | Импорт STL (бинарный + ASCII); диалог «Импорт» — `.stl,.obj,.3mf` (OBJ / 3MF — `io/mesh-formats.ts`) |
| `src/io/stl-export.ts` | Экспорт в бинарный STL |
| `src/io/mesh-formats.ts` | Форматы (FORMATS-OBJ-3MF-GLTF): `worldMeshes` (видимые объекты в мире, как STL), экспорт `exportToObj` / `exportTo3mf` (ZIP + XML, цвета) / `exportToGltf` (`GLTFExporter`, корень Y-вверх и метры), импорт `parseObjText` / `parse3mf` / `parseMeshFile` (по расширению; STL — `stl-import`). UI — меню «Экспорт» (`ExportMenuButton`), «Импорт» — `.stl,.obj,.3mf`; стор — `exportMesh(format)` |
| `src/io/doodle-io.ts` | **УСТАРЕЛО**: формат .doodle (legacy, не поддерживается) |
| `src/io/3dtc-io.ts` | Формат .3dtc (ZIP + JSON) — основной формат проекта (v1.2.0+); `dimensions` — слой размеров отдельным полем рядом с `operations` (DIMENSIONS) |
| `src/io/autosave.ts` | Автосохранение в IndexedDB (запись с `modified`); `clearScene` чистит запись |
| `src/io/text-mesh.ts` | Меш 3D-текста (`buildTextMesh`): контуры выдавливаются и свариваются по отдельности → замкнутый меш для CSG; запасной шрифт Droid Sans (кириллица), `missing` — символы не из шрифтов, `repairTJunctions`; `TextMeshError` (UX-AUDIT-3/10/18) |
| `src/io/legacy-fillet.ts` | Миграция старых проектов со скруглением: вырезает шаги `fillet`, снимает `filletRadius`, перенумеровывает `edit_step` (вызывается при всех загрузках в сторе) |
| **Platform (yandex-games ветка)** | |
| `src/platform/index.ts` | Абстракция платформы (clean / yandex) |

## Конвенции кода

### TypeScript
- `strict: true` — без `any` (кроме точки инициализации WASM: `as unknown as ManifoldAPI`)
- Экспортируйте функции для тестирования (не тестируйте через приватные)
- Интерфейсы для внешних API (WASM), типы для доменных сущностей

### React
- `useMemo` для производных значений из store (Set, reduce и т.п.)
- `useRef` для стабилизации `useEffect` (паттерн `kbRef` — см. keyboard shortcuts)
- Zustand store функции стабильны — можно использовать в deps без пересоздания

### Состояние (Zustand)
- Два store: `document-store.ts` (документ/сцена) и `ui-store.ts` (UI state)
- Actions возвращают Promise при вызове воркера
- История операций — массив `history[]` с фильтрацией
- **Эффективная история (Фаза 9.5):** потребители истории читают `projectHistory(ops)`, а не сырые `operations` — новые функции, разбирающие историю, проецируют её на входе (`edit_step` не должна доходить до воспроизведения)
- Undo/redo через `rebuildFromHistory()` с snapshot cache (`snapshots.ts`) — мгновенный undo/redo при наличии кэша, fallback на WASM rebuild

### CSG Worker
- Воркер кэширует manifold-объекты по `id` (Map)
- `sanitizeParams()` валидирует пользовательский ввод перед отправкой в воркер

### Build Tree (Фаза 8)
- **N-ARY-CSG:** boolean-узел — `children` (N ≥ 2, плоско) + `groupA` (subtract/intersect: `children[0..groupA)` — группа A, результат union(A) op union(B); нет — 1). Группы задаёт режим «A → B → Enter» (`csg-group-mode.ts`, CSG-GROUP-FIX), кнопок групп в UI нет. Бинарный `[a, b]` — частный случай; boolean считать только через `combineOperands` (воркер), не `a.add(b)` по `children[0]`/`[1]`. Дети CSG-объекта — из дерева (`getNode(root).children`), `SceneObject.children` после перестроения по истории не восстанавливается
- **`relativeToParent`** — единственный источник истины для трансформов
- **`localTransform`** — вычисляемый (для UI)
- **`vertices`** — всегда в origin (центрированы по центру масс)
- Transform применяется **один раз** (в `rebuildNode` или worker)
- См. `web-app/ARCHITECTURE_TRANSFORMS.md`

### Единый источник (Фаза 8.5 + 8.5.9)
- **`vertices`** — всегда в origin (центр масс). Для CSG: вершины un-baked'ятся от RS операнда A (`v = S⁻¹Rᵀ·(v_world − posA)`)
- **`transform`** — мировой pivot (spawn + user). Для CSG: полный TRS операнда A (`resultTransform = transformA`)
- **Отрисовка** = `mesh.position = transform`, `geometry = vertices`
- **`centerGeometry` — НЕТ** (удалён)
- **`isPivotCenteredGeometry` — НЕТ** (удалён)
- **Render = data** — CI-тест `render-data-invariant.test.ts`
- **`GroupOperation.resultRotation`/`resultScale`** — история CSG с rot/scale, `rebuild.ts` восстанавливает полный TRS
- См. `web-app/ARCHITECTURE_RENDER.md`

### Тесты
- Type-level тесты: `src/csg/types.test.ts`
- Unit-тесты: `src/csg/*.test.ts`, `src/io/*.test.ts`, `src/store/*.test.ts`, `src/components/*.test.ts`
- Мок IndexedDB: `src/__mocks__/indexeddb.ts` (in-memory IDB для jsdom)
- Среда: jsdom (через vite.config.ts)
- Имена: `describe('FunctionName')` → `it('описание')`
- Известный, но ещё не исправленный баг: `it.fails('ID ожидание: …')` + `it('ID реальность: …')` (а не `skip`): тест подтверждает баг на каждом прогоне и краснеет после фикса; в e2e — `knownBug(...)` (см. `e2e/ux-audit.mjs`). После фикса: `it.fails` → `it`, «реальность» удалить, `knownBug` → обычная проверка. Реестр — `DEVELOPMENT_PLAN.md` › «UX-AUDIT», «UX-AUDIT-2», «UX-AUDIT-3», «UX-AUDIT-4», «UX-AUDIT-5», «UX-AUDIT-6», «UX-AUDIT-7»
- Строки интерфейса — только через i18n (`t('…')`, ru и en): `i18n/i18n-coverage.test.ts` (AST-скан) падает на кириллице в литералах/JSX вне `console`/`devLog` и на расхождении ключей ru/en
- e2e в CI (CI-E2E): раннер без GPU (WebGL — Mesa llvmpipe на CPU), язык — `LANG=ru_RU`. Порог производительности (FPS, долгие задачи, время) — только через `assertPerf` (`e2e/helpers.mjs`), не `fail`: локально строго, в CI (`E2E_SOFT_PERF=1`) — предупреждение `[SOFT PERF]`. Рамку тоста мерить после `waitToastsSettled` (анимация появления), а не по паузе
- e2e добавляют фигуру палитры через `placeShape(page, label)` (`e2e/helpers.mjs`): клик по иконке включает режим размещения, Enter ставит фигуру рядом с прошлыми — позиции как до PLUG-AND-PLAY. Размещение на грани / сетке / плоскости оси — `e2e/plug-and-play.mjs` (`data-placement*` у `.viewport-canvas`)
- Навигация вьюпорта (VIEWPORT-NAV): протяжка ЛКМ — рамка выделения, вид вращает ПКМ, сдвигает СКМ (e2e — `page.mouse.down({ button: 'right' | 'middle' })`); захват указателя на контейнере вьюпорта не брать — OrbitControls сам захватывает его на канвасе и иначе «залипает»

### CSS
- Темы — CSS-переменные из `src/themes/*.json` (THEME-ENGINE, `applyTheme`); `:root` в `App.css` — запас тёмной; правила «для светлых» — `[data-theme="light"]`
- Инлайн-стили допустимы для динамических значений (position, color из объекта)

## Документирование изменений (обязательно)

**Любое изменение в коде должно быть задокументировано.** Без исключений.

### CHANGELOG.md
После каждого изменения добавьте запись в `CHANGELOG.md` в секцию `[Unreleased]`:
- `Added` — новые функции, файлы, возможности
- `Changed` — изменения в существующем поведении
- `Removed` — удалённый код, файлы, функции
- `Fixed` — исправленные баги

Формат записи: `- Краткое описание (ссылка на файл/модуль если нужно)`

### CODE_REVIEW.md
Если изменение исправляет проблему из код-ревью — отметьте статус:
- `✅ ИСПРАВЛЕНО` — проблема устранена
- `✅ НЕ БАГ` — проблема проверена, не требует исправления
- Обновите таблицу «Статус исправлений» и приоритеты действий

### DEVELOPMENT_PLAN.md
Если изменение затрагивает фазы разработки или известные проблемы:
- Обновите статус задачи (🔲 → 🔄 → ✅)
- Обновите таблицу «Известные проблемы и технический долг»

### ARCHITECTURE_TRANSFORMS.md
При изменении модели трансформов (Фаза 8):
- Обновите схему `TreeNode` / `SceneObject`
- Обновите таблицу «Решаемые проблемы»
- Обновите статус этапов Фазы 8

### Прочая документация
- `ARCHITECTURE.md` — при изменении потоков данных, слоёв, ключевых решений
- `AGENTS.md` — при изменении конвенций, паттернов, ключевых файлов
- `README.md` — при изменении возможностей, стека, команд

### Чек-лист перед завершением задачи
1. [ ] `CHANGELOG.md` обновлён
2. [ ] `CODE_REVIEW.md` обновлён (если затронуты проблемы из ревью)
3. [ ] `DEVELOPMENT_PLAN.md` обновлён (если затронуты фазы/проблемы)
4. [ ] `ARCHITECTURE_TRANSFORMS.md` обновлён (если затронута Фаза 8)
5. [ ] `pnpm typecheck` — 0 ошибок
6. [ ] `pnpm test` — все тесты проходят

## Важные паттерны

### Центрирование геометрии
- **Все примитивы** центрируются в origin через `Manifold.cube(..., true)`, `Manifold.cylinder(..., true)` и т.д.
- **CSG-результаты** центрируются по **центру масс** (не BBox!) в origin
- **Worker кэширует в origin** — transform применяется **один раз** при использовании
- **`vertices` в `SceneObject` всегда в origin** — transform живёт в `SceneObject.transform`
- **`relativeToParent` в `TreeNode`** — источник истины для rebuild (Фаза 8)

### Toast вместо alert
Используйте `notify(message, type)` из `store/notifications.ts` для показа ошибок/предупреждений. Не используйте `alert()`. Подтверждение разрушительного действия — `ConfirmModal` (не `confirm()`).

### Валидация ввода
Используйте `clamp(v, min, max)` и `sanitizeParams(params)` из `worker.ts` для валидации пользовательских параметров перед отправкой в воркер.

### Привязка линейки к геометрии (snap-to-geometry)
При включённой `rulerMode` точки клика линейки привязываются к геометрии фигур через `findNearestSnap()` (`snap-utils.ts`):
- Raycast → поиск вершин/рёбер/граней/центров → выбор лучшего кандидата
- Приоритет: vertex > edge > circle > face
- Fallback (если raycast не попал) — проекция на рабочую плоскость Z=0
- Визуальный индикатор — цветная сфера (`createSnapIndicator`)
- Цвета: vertex=красный, edge=зелёный, circle=синий, face=жёлтый
- Константы радиусов: `SNAP_VERTEX_RADIUS=2.0`, `SNAP_EDGE_RADIUS=2.0`, `SNAP_FACE_RADIUS=2.0`, `SNAP_CIRCLE_RADIUS=3.0`

## Известные ограничения (не баги)

- Импортированные меши (STL) не параметризуются (IMPORT-MESH-PARAMETRIC: не требуется); трансформации и CSG работают — CSG допускает замкнутый STL (проверка по manifold в воркере, IMPORT-MESH-CSG), незамкнутый → уведомление `errors.csgNonManifold`; «починка» незамкнутого меша не делается; старые extrude без `group.source` не редактируются как extrude (EXTRUDE-LEGACY: не мигрируем); `extrudeSelected` — движок правки 9.5.4, не UI-инструмент: это «растянуть по оси», а не extrude 2D→3D, кнопку не возвращать (EXTRUDE-3D-SCALE; настоящий extrude — Фаза 11)
- Скругления (fillet) нет: прежний параметр куба удалён (remove-fillet) до инструмента на B-Rep; старые шаги `fillet` вырезаются при загрузке (`io/legacy-fillet.ts`) — новых не создавать
- После v1.3.1 открыто: связанное зеркало (linked mirror) не делали — копия CSG всегда независимая; «починка» незамкнутого STL. CI — один workflow `ci-web.yml` (CI-DEDUP ✅): job `ci` (install + typecheck + test + build) и job `e2e` — все 29 e2e (CI-E2E ✅)
- Выравнивание режимом «Выровнять» (ALIGN-UI-REVIT) пишется шагом `align` с плоскостью (ALIGN-PLANE-RESOLVE ✅; с поворотом — UX-AUDIT-32; грань гладкой поверхности — цилиндр, сфера — не поворачивает, только касание): правка прошлого шага пересчитывает его; ✎ у самого шага нет (как у обычного align). Плоскость A следует за системой объекта A (TRS), а не за гранью при правке формы A (правка ребёнка CSG A)
- Дерево живой сессии, начатой до v1.3.2 (boolean-узлы без `originTransform`), для вложенного CSG, сдвинутого до объединения, остаётся под замком `nested_moved` (предохранитель); после перезагрузки/загрузки проекта дерево перестраивается из истории с TRS₀ — правка работает
- Блокировка (LOCK-OBJECT) — шаг истории `lock`; заблокированный не выбирается во вьюпорте, не двигается, не удаляется, не идёт в CSG (`document-store` — `notify`), выбрать можно из списка / дерева. Новые действия, меняющие объект, должны проверять `obj.locked`
- `.doodle` (legacy) в UI не открывается: `parseDoodle` не вызывается
- Размещение (PLUG-AND-PLAY): плоскости X / Y / Z — мировые, через начало координат (не через грань под курсором); на наклонной грани шаг привязки не действует (точка — точно в попадании); поворот вокруг нормали при размещении не задаётся (только «стоит на плоскости»); после размещения режим выключается (одна фигура на клик по иконке); «Текст» — по-прежнему окно ввода, без размещения
- Размеры (DIMENSIONS) — аннотации, не шаги «Истории» (своя отмена — Ctrl+Z / Ctrl+Y в общем порядке с шагами, DIMENSION-UNDO ✅; в «Истории» не видны); размер к объекту, ушедшему в CSG, скрыт и на результат не переносится (DIMENSION-CSG-TRANSFER); при перетаскивании гизмо число — по отпусканию (DIMENSION-LIVE-DRAG); только линейные (угловые / радиусы — позже); управляющий размер (вариант C: число задаёт геометрию) — бэклог `DEVELOPMENT_PLAN.md`
- 3D-текст, созданный до `fix-all` (в истории — несшитый меш), в CSG не участвует — пересоздать (UX-AUDIT-3 не мигрирует старые шаги); «Отменить» после «Очистить сцену» работает только сразу после очистки (до нового действия)
- 3D-текст: латиница — шрифт helvetiker, строки с кириллицей/диакритикой — запасной Droid Sans (`io/text-mesh.ts`); символов, которых нет ни в одном (иероглифы, emoji), — «?» с предупреждением
- Узкое окно (≤1024): тулбар в 2–3 строки, подсказка вьюпорта скрыта; панели 320 + 200 px фиксированы (на 768 вьюпорт ~250 px)

## Node.js — Настройка и проверка

Перед работой с проектом убедитесь, что Node.js настроен корректно.

- **Документация:** `web-app/NODEJS_SETUP.md` — полное руководство по настройке Node.js, pnpm, проверке typecheck и тестов
- **Фактическое состояние:** Node.js v24.22.2, pnpm 12.10.1 (зафиксирован в `web-app/package.json` → `packageManager`; CI берёт версию оттуда, Node 24)
- **node_modules:** 203 MB (pnpm symlink-based, не коммитится)
- **Проверка:** `cd web-app && pnpm typecheck && pnpm test`

Если возникают вопросы по Node.js, зависимостям или запуску тестов — **сначала прочитайте `web-app/NODEJS_SETUP.md`**.

## Документация

- `ARCHITECTURE_TRANSFORMS.md` — единая модель трансформов (Фаза 8)
- `ARCHITECTURE_RENDER.md` — единый источник данных и отрисовки (Фаза 8.5)
- `docs/PHASE_9_5_DESIGN.md` — Фаза 9.5: дизайн правки прошлых шагов (move/mirror/extrude; fillet отменён), каскад CSG
- `docs/PHASE_9_DESIGN.md` — Фаза 9: решения (операция с результатом, вложенные CSG), риски, статус подзадач
- `CODE_REVIEW.md` — результаты код-ревью с приоритетами
- `DEVELOPMENT_PLAN.md` — план разработки (Фазы 0–7)
- `ARCHITECTURE.md` — описание архитектуры
- `CHANGELOG.md` — история изменений
- `web-app/BUILD_TREE_SPEC.md` — спецификация Build Tree
- `web-app/NODEJS_SETUP.md` — настройка Node.js, pnpm, проверка typecheck и тестов
- `ECONOMY.md` — экономика Яндекс.Игр (ветка `yandex-games`)
- `PLAN_YANDEX.md` — план интеграции Яндекс.Игр
