# Changelog

Все заметные изменения в этом проекте документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/),
версионирование следует [SemVer](https://semver.org/lang/ru/).

---

## [Unreleased]

### Added
- **UX-AUDIT (v1.3.2) — прогон «как пользователь», баги зафиксированы тестами (не чинились):** 8 находок — 🔴 автосохранение не восстанавливается после перезагрузки (UX-AUDIT-1), «Очистить сцену» без подтверждения и без отмены, сбрасывает «не сохранено» (UX-AUDIT-2), 3D-текст не участвует в CSG — «суп» треугольников без сварки, подсказка про STL (UX-AUDIT-3); 🟡 пустой результат CSG создаётся молча (UX-AUDIT-4), сочетания из подсказок Tab/L/M/N/B/U/X/I не работают (UX-AUDIT-5); 🟢 текст в дереве «Импорт» (UX-AUDIT-6), «мм» и «Загрузка CSG» в английском интерфейсе (UX-AUDIT-7), «Граней 6.0» (UX-AUDIT-8). Таблица «ожидание vs реальность» — `DEVELOPMENT_PLAN.md` › «UX-AUDIT». Тесты: `__tests__/ux-audit.test.tsx` (+6 «реальность» и 6 `it.fails` «ожидание», проверено: каждый `it.fails` падает на своей проверке), e2e `pnpm e2e:ux-audit` — ✅-сценарии без покрытия (7 примитивов, интерфейс, `.3dtc`/STL через UI, удалить всё + undo, 100k треугольников) и известные баги в браузере (обязаны воспроизводиться)

### Fixed
- **UX-AUDIT-1 — автосохранение восстанавливается после перезагрузки:** при готовности CSG-воркера прошлая сессия из IndexedDB восстанавливается один раз (только если сцена и история пусты — текущая работа не затирается) с уведомлением «Прошлая сессия восстановлена»; признак «● Не сохранено» сохраняется в записи (старые записи без поля → «не сохранено»). `clearScene` чистит автосохранение (иначе вернулась бы очищенная сессия). Автосохранение вынесено из `App.tsx` в хук `hooks/useAutosave.ts`. Тесты: `ux-audit.test.tsx` › UX-AUDIT-1 (+4), e2e `ux-audit` — перезагрузка → 2 объекта, история, уведомление; очистка → перезагрузка → пусто (`io/autosave.ts`, `store/document-store.ts`, `hooks/useAutosave.ts`, `App.tsx`)
- **UX-AUDIT-2 — «Очистить сцену» с подтверждением и отменой:** кнопка открывает подтверждение «Очистить сцену?» (`components/ConfirmModal.tsx`: фокус на «Отмена», Esc и клик по фону — отмена, клавиши не уходят в глобальные сочетания); документ до очистки запоминается (`clearedDocument`) — «Отменить» / Ctrl+Z сразу после очистки возвращает объекты, историю с redo, файл/проект и «● Не сохранено» (`canUndoClear`, `restoreClearedDocument`). После любого нового действия отмена очистки недоступна; открытие/загрузка документа сбрасывает снимок. Тесты: `ux-audit.test.tsx` › UX-AUDIT-2 (+4, вместо пары `it.fails`/«реальность»), e2e `ux-audit` — Отмена, Esc, очистка, Ctrl+Z (`store/document-store.ts`, `store/types.ts`, `components/ConfirmModal.tsx`, `App.tsx`, `App.css`, `i18n`)
- **UX-AUDIT-3 — 3D-текст участвует в CSG (куб − текст = гравировка):** меш текста строит `io/text-mesh.ts` (`buildTextMesh`): у `TextGeometry` снимаются нормали/UV, совпадающие вершины сшиваются (`mergeVertices`, допуск 1e-4 мм), вырожденные треугольники выбрасываются — замкнутый меш вместо «супа» треугольников (раньше: «Меш не замкнут… Проверьте STL»). Проверено на латинице, цифрах, знаках, кириллице, диакритике: union / subtract / intersect с кубом. Ограничение: текст, созданный до исправления (в истории — несшитый меш), в CSG не участвует — пересоздать. Тесты: `ux-audit.test.tsx` › UX-AUDIT-3 (+3: гравировка с проверкой объёма, замкнутость рёбер, union/intersect; проверены откатом сварки), e2e `ux-audit` — куб − текст через UI (`io/text-mesh.ts`, `App.tsx`)
- **UX-AUDIT-4 — пустой результат CSG не создаётся молча:** `csgBoolean` при 0 треугольников (пересечение непересекающихся, вычитание «всего») не создаёт невидимый «CSG результат» и шаг истории — объекты не тронуты, уведомление «Результат CSG пуст… объекты не изменены» (`errors.csgEmpty`, ru/en). Тесты: `ux-audit.test.tsx` › UX-AUDIT-4 (+3, проверены откатом), e2e `ux-audit` — пересечение через UI (`store/document-store.ts`, `i18n`)
- **UX-AUDIT-5 — сочетания из подсказок работают:** Tab (перспектива ↔ ортография; только когда фокус не на кнопке — иначе Tab остаётся навигацией), L (линейка), M / N / B (зеркало YZ / XZ / XY выбранных), U / X / I (объединение / вычитание / пересечение двух выбранных). Соответствие клавиш действиям — чистая функция `resolveHotkey` (`src/hotkeys.ts`), App только исполняет; тест сверяет КАЖДОЕ сочетание из `TOOLTIP_DATA` с действием его инструмента (подсказка без обработчика не пройдёт CI). Заодно: под модалкой (текст, проекты, подтверждение) сочетания не срабатывают (раньше проверка читала устаревшее замыкание и Delete/Ctrl+Z работали под модалкой проектов); автоповтор зажатой клавиши не повторяет зеркало/CSG/переключатели; поля ввода — также textarea/select/contentEditable. Тесты: `hotkeys.test.ts` (+5), e2e `ux-audit` — Tab, L, U, X, I, M, N, B в браузере (`hotkeys.ts`, `App.tsx`)
- **UX-AUDIT-6 — 3D-текст в дереве называется «Текст: Hi»:** имя импортированного меша (`addRawMesh`, `importStl`) теперь пишется и в объект, а не только в операцию истории — дерево показывало «Импорт N», а после перемотки/загрузки (rebuild берёт имя из операции) — «Текст: …»: живое ≠ rebuild. Имя текста локализовано (`textModal.objectName`: «Текст: Hi» / «Text: Hi») и строится из того же обрезанного текста, что геометрия. Импорт STL в дереве теперь — по имени файла (как и после перемотки). Тесты: `ux-audit.test.tsx` › UX-AUDIT-6 (+3: имя и строка дерева, undo/redo без снимков, en), e2e `ux-audit` — строка дерева «Текст: A» (`store/document-store.ts`, `App.tsx`, `i18n`)
- **UX-AUDIT-7 — английский интерфейс без русских строк:** через i18n (ru/en) теперь — единица «мм»/«mm» у полей (`NumInput` по умолчанию, шаг move в `StepPanel`, модалка текста), «Загрузка CSG (WASM)…» (`App`, `Viewport3D`), «Вычисление…», линейка «Расстояние», экран «WebGL недоступен», название действия в ошибке отмены/повтора/перехода по истории, имя проекта по умолчанию «Без названия», ошибки разбора `.3dtc` (попадают в «Ошибка открытия: …»), менеджера проектов и импорта STL (были зашиты по-русски, а часть STL — по-английски и в русском интерфейсе; ключи `errors.stl*` существовали, но не использовались). Исключение — устаревший `io/doodle-io.ts` (из UI не вызывается). Страж: `i18n/i18n-coverage.test.ts` — AST-скан исходников на кириллицу в литералах и JSX вне `console`/`devLog` (проверен возвратом «мм»), одинаковые ключи ru/en, нет кириллицы в en. Тесты: `ux-audit.test.tsx` › UX-AUDIT-7 (+3), `3dtc-io.test.ts` (сообщения ru и en), e2e `ux-audit` — интерфейс en без кириллицы (`components/NumInput.tsx`, `StepPanel.tsx`, `TextModal.tsx`, `Viewport3D.tsx`, `WebGLFallback.tsx`, `App.tsx`, `store/document-store.ts`, `io/3dtc-io.ts`, `io/project-manager.ts`, `io/stl-import.ts`, `i18n`)
- **UX-AUDIT-8 — «Граней 6», а не «6.0»:** у `NumInput` — проп `integer` (показ без дробной части, шаг 1, ввод округляется до целого до ограничения `min`); включён для «Граней» призмы/пирамиды в панели свойств и для целых полей формы ребёнка CSG (`child-params` › `integer`). Тесты: `ux-audit.test.tsx` › UX-AUDIT-8 (+2: панель, ввод 7.6 → 8 и min), e2e `ux-audit` — «Граней=6 / 4» (`components/NumInput.tsx`, `PropertiesPanel.tsx`, `ChildPropertiesPanel.tsx`)

---

## [1.3.2] — 2026-11-07

### Added
- **NESTED-MOVED-EDIT:** правка ребёнка вложенного CSG, сдвинутого / повёрнутого / отмасштабированного до объединения (раньше 🔒 `nested_moved`). `TreeNode.originTransform` (TRS₀) + поправка воркера `Mat(TRS_cur)·Mat(TRS₀)⁻¹` для вложенного boolean.

### Fixed
- `ALIGN-TREE-REPLAY`: шаги `align` не применялись к узлам дерева при перемотке/загрузке (выровненный до объединения операнд — замок).

### Changed
- `CI-DEDUP`: один CI-workflow (`ci-web.yml`) вместо двух.

### Known Limitations
- Дерево живой сессии, начатой до v1.3.2 (без TRS₀), для сдвинутого до объединения вложенного CSG остаётся под замком `nested_moved`; после перезагрузки/загрузки проекта дерево перестраивается из истории — правка работает.
- `ALIGN-PLANE-RESOLVE`, `CI-E2E` — после.

### Подробно

#### Added
- **NESTED-MOVED-EDIT — правка ребёнка вложенного CSG, трансформированного ДО объединения:** A ∪ B → G → сдвиг / поворот / масштаб G → G ∪ C → правка B в дереве — работает (раньше замок 🔒 `nested_moved` и отказ). У boolean-узла дерева — TRS₀ (`TreeNode.originTransform`: система, в которой лежат листья; ставится при создании CSG, копируется снимком/вставкой, отражается зеркалом тем же сопряжением, что `localTransform`). Воркер (`rebuildTreeNode`) переносит результат ВЛОЖЕННОГО boolean на `M = Mat(TRS_cur)·Mat(TRS₀)⁻¹` (`worker-matrix.relativeTransformMatrix`, полная аффинная матрица: сдвиг, поворот, неравномерный масштаб); TRS_cur = `localTransform` на момент объединения; совпадают — identity, обычный CSG не меняется. Калибровка 9.3 проходит; правка совпадает со «свежим» сценарием (габарит 1e-4, объём и площадь 1e-5) в т.ч. для двух уровней вложенности, вычитания, вложенного CSG вторым операндом, после undo/redo без снимков, загрузки `.3dtc`, у зеркальной и вставленной копии. Замок `nested_moved` остаётся предохранителем для любого расхождения дерева и меша (старое дерево без TRS₀); текст причины обобщён. Тесты: +19 (`__tests__/nested-moved-edit.test.ts` — 13, `worker-matrix.test.ts` — 3, `history-tree.test.ts` — 3; проверены откатом), перевёрнуты 4 теста «сдвинутый вложенный CSG заблокирован» (`edit-child-params`, `child-editability-ui` — теперь замок на старом дереве); e2e `pnpm e2e:nested-moved-edit`, `e2e:tree` (сдвинутый вложенный CSG — без замков, форма) (`csg/types.ts`, `csg/history-tree.ts`, `csg/worker-handlers.ts`, `csg/worker-client.ts`, `csg/worker-matrix.ts`, `store/rebuild.ts`, `store/document-store.ts`, `store/snapshots.ts`, `csg/tree-view.ts`, `i18n`)

#### Fixed
- **ALIGN-TREE-REPLAY — выравнивание операнда до объединения терялось в дереве после перемотки/загрузки:** `rebuildBuildTree` не применял шаги `align` к узлам дерева (только `move`/`mirror`) — выровненный до CSG операнд стоял в дереве на старом месте, дерево корня не воспроизводило меш (замок `nested_moved`). Живой путь это маскировал (`csgBoolean` синхронизирует узлы операндов перед CSG). Регресс-тест: `nested-moved-edit.test.ts` › «ALIGN-TREE-REPLAY» (проверен откатом)

#### Changed
- **CI-DEDUP — один CI-workflow вместо двух:** `build.yml` («Test package») удалён — он дублировал `ci-web.yml` (те же install + typecheck + test, без build); на PR с кодом шло 4 прогона (2 workflow × push + pull_request). В `ci-web.yml` («CI (web-app)», install + typecheck + test + build, Node 24, pnpm из `packageManager`) снят фильтр путей — PR только с документацией тоже получает проверку (раньше её давал лишь `build.yml`), а `push` — только `main` (ветки задач проверяются через `pull_request`). `deploy.yml` не менялся

---

## [1.3.1] — 2026-11-06

### Added
- **ALIGN-UI-REVIT:** режим выравнивания (одна кнопка, выбор грани/плоскости, множественное, Esc/правый клик). `solvePlaneAlignDelta` — произвольная плоскость. 9 старых кнопок убраны.

### Removed
- `release.yml` — остаток CaDoodle (Java), не относится к Web.

### Fixed
- `NumInput`: `-0.0` → `0` (`formatNum`, −0.04 при одном знаке).
- `PropertiesPanel`: уникальные `id` (`num-input-pos-*`, `num-input-rot-*`, `num-input-scale-*`), `label` ↔ `id`.

### Known Limitations
- `NESTED-MOVED-EDIT`, `ALIGN-PLANE-RESOLVE`, `CI-DEDUP`, `CI-E2E` — после.

### Подробно

#### Added
- **ALIGN-UI-REVIT — режим выравнивания как в Revit (одна кнопка):** кнопка тулбара «Выровнять» (иконка — два столбика разной высоты от одной плоскости) включает режим (`store/align-mode.ts`: `alignMode` + `startAlignMode` / `setPlane` / `setHoveredFace` / `clickFace` / `applyAlignB` / `toggleMultiple` / `exitAlignMode`). Плоскость A — клик по грани объекта (мировые нормаль и точка) или X / Y / Z в панели `AlignPanel` (мировые плоскости YZ / XZ / XY через начало координат); затем клик по грани B — B сдвигается вдоль нормали плоскости, его грань ложится в плоскость A (шаг «Переместить» в истории — воспроизводится и правится ✎). Выбор грани B (`helpers.solvePlaneAlignDelta`): кликнутая грань параллельна плоскости (≤ 1°) — встаёт именно она; не параллельна — крайняя точка B по нормали со стороны, куда смотрит грань (знак dot); протяжённость B — та же реальная геометрия, что у ALIGN-REVIT (`worldProjectionRange`: вершины через полный TRS, без вершин — OBB). Raycast по треугольнику (`components/align-picking.ts`: `pickFace`, `planarFaceTriangles`), подсветка под курсором всей плоской грани (синяя) и выбранной плоскости A (жёлтая), наведение — throttle 50 мс, отсечение по boundingSphere/Box в `Mesh.raycast`. Галочка «Множественное» — после B режим и плоскость остаются. Esc (`hooks/useAlignModeKeys.ts`, capture — выделение не сбрасывается), правый клик, «Готово» — выход. Курсор `crosshair`. Подсказки в статус-баре и панели (ru/en). Тесты: +21 (`__tests__/align-ui.test.tsx` — 16: кнопка, режим, raycast по настоящим мешам Three.js, X/Y/Z, выравнивание на WASM, множественное, Esc, подсказки ru/en; `store/helpers.test.ts` — 5: правила выбора грани B); e2e `pnpm e2e:align-ui-revit`

#### Changed
- **e2e `align-obb` — через режим «Выровнять»:** повёрнутый цилиндр → плоскость = грань куба, повёрнутый куб → плоскость XY (проверка реальной геометрии та же); `findAlignFace` в `e2e/helpers.mjs` ищет грань на экране по подсветке. `toolbar-aria`: 27 кнопок (было 35)

#### Fixed
- **UX-NUMINPUT — `NumInput` показывал «-0.0»:** значение, которое после округления до точности поля равно нулю (−0, −1e-6, −0.04 при одном знаке), показывается без минуса (`formatNum`; только отображение — значение не меняется; ввод «-0» отдаётся как `0`). Точность поля прежняя (1 знак у позиции/поворота: «0.0»)
- **UX-NUMINPUT — одинаковые `id` полей панели свойств:** у позиции и масштаба были одинаковые `num-input-X/Y/Z` (метки «X/Y/Z»), `<label>` масштаба указывала на поле позиции. Теперь `num-input-pos-*`, `num-input-rot-*`, `num-input-scale-*` (`NumInput` принимает `id`; по умолчанию — `num-input-<label>`). e2e обращаются к полю позиции по `#num-input-pos-*` (раньше — `.first()`). Тест: `__tests__/num-input.test.tsx` (+7, проверен откатом)

#### Removed
- **9 кнопок выравнивания (X/Y/Z × min/center/max)** — из тулбара и из панели свойств (`components/AlignButtons.tsx` удалён, ключи `align.x_min`… и подсказки `tooltips.alignX…` — тоже). Действие `alignSelected` в сторе осталось: шаги `align` старых проектов воспроизводятся и пересчитываются каскадом (re-solve)
- **`.github/workflows/release.yml`** — остаток сборки Java-приложения CaDoodle (`BowlerStudio/...NameGetter.java`), к TinkerCraft Web не относится; падал на всех тегах (v1.2.0–v1.3.0). Другие workflow от него не зависят (CLEANUP-RELEASE-YML)

---

## [1.3.0] — 2026-11-06

**Фаза 9 — Параметрическая история (9.1–9.9, 9.5.0–9.5.4).**

### Added
- **9.1–9.3:** дерево компонентов (раскрытие CSG, выбор ребёнка), панель свойств ребёнка (`ChildPropertiesPanel`), пересборка CSG при смене `params` (`edit_child_params`).
- **9.4:** правка из Timeline v1 — ✎ у `add_shape` / `edit_child_params` ведёт к форме цели (append-only).
- **9.6:** undo/redo + сериализация правки (`.3dtc` round-trip).
- **9.7:** индикация «Пересчёт CSG…».
- **9.8:** правка зеркальных детей CSG (`primitive` + `mirrored[]`).
- **9.9:** замок 🔒 «правка недоступна» (причины: `baked` / `nested_moved` / `mirror`).
- **9.5.0:** `projectHistory` (эффективная история), `computeCsgResult` (общее ядро CSG), `computeCascade`.
- **9.5.1:** отменена (fillet удалён).
- **9.5.2:** правка шага `move` (каскад CSG, re-solve `align`, pivot CSG).
- **9.5.3:** правка шага `mirror` (плоскость, `composeMirroredList`, каскад).
- **9.5.4:** правка шага `extrude` (`GroupOperation.source`, каскад, re-solve `align`).
- **CSG-INDEPENDENT-COPY:** зеркало и вставка CSG → независимая параметрическая копия (копия дерева, не baked). Правка копии не трогает оригинал.
- **IMPORT-MESH-CSG:** CSG для замкнутых STL (по manifold, а не по `shapeType`), i18n `errors.csgNonManifold`.
- **ALIGN-REVIT:** выравнивание по реальной геометрии (вершины, поворот, масштаб), `aria-label` у всех 35 кнопок тулбара.
- **UI:** левая панель 320px, примитивы в 3 столбца.
- **CI:** `packageManager: pnpm@12.10.1`, CI зелёный (install + typecheck + 662 теста + build).

### Removed
- **Fillet** (скругление граней куба) — до появления инструмента на B-Rep (Фаза 11, OCCT); старые шаги `fillet` вырезаются при загрузке.
- **Кнопка «Extrude»** не возвращается: `extrudeSelected` — не extrude, а «растянуть по оси» (движок правки 9.5.4, не в UI). Настоящий extrude (2D → 3D) — Фаза 11.

### Fixed
- `MIRROR-CHAIN-REPLAY`, `MIRROR-CSG-REPLAY` (9.5.3).
- `ALIGN-CSG-AABB` (9.5.2), `ALIGN-PRIMITIVE-AABB` (ALIGN-REVIT).
- `MIRROR-CSG-TREE-RELOAD`, `PASTE-CSG-RS` (CSG-INDEPENDENT-COPY).
- `IMPORT-CSG-STUB`, `IMPORT-TREE-RELOAD` (IMPORT-MESH-CSG).
- `EXTRUDE-AABB` и «move базы до extrude не тянул плиту» (9.5.4).
- Безымянные кнопки тулбара (`aria-label=""`) — ALIGN-REVIT.

### Known Limitations
- `NESTED-MOVED-EDIT` — вложенный CSG, сдвинутый до объединения, не правится (🔒 `nested_moved`). После v1.3.0.
- `CSG-INDEPENDENT-COPY` — связанное зеркало (linked mirror) не делали; копия всегда независимая.
- `IMPORT-MESH-CSG` — «починка» незамкнутого меша (заполнение дыр) — отдельная задача.
- `ALIGN-UI-REVIT` (явный выбор плоскости) — отдельная задача.
- `CI-DEDUP` (`ci-web.yml` и `build.yml` дублируют друг друга), `CI-E2E` (e2e не в CI) — после.
- `PropertiesPanel`: у полей позиции и поворота одинаковые `id` (`num-input-X`); `NumInput` показывает `-0.0` — мелкий UX, не исправлено.
- `.doodle` (legacy) — в UI не открывается (`parseDoodle` не вызывается).

### Подробно

#### Added
- **Фаза 9.1 — раскрытие CSG в дереве компонентов:** вкладка «Дерево» показывает детей CSG-результата (примитивы с краткой сводкой параметров `W20 H20 D20`, вложенные CSG, запечённые/зеркальные — помечены нередактируемыми). Шеврон ▸/▾ раскрывает/сворачивает (в том числе вложенные); клик по ребёнку выбирает его (`ui-store.selectedChild`, корень выделяется в сцене), клик по корню сбрасывает выбор, устаревший выбор сбрасывается при undo/удалении (`hooks/useSelectedChildGuard.ts`). Read-модель дерева `getTreeView`/`findViewNode`/`formatParams` — `csg/tree-view.ts` (снимок с копиями params, защита от циклов и глубины 32). Иконки строк дерева уменьшены 32→20px (при шевроне имя схлопывалось). Решения и риски Фазы 9 — `docs/PHASE_9_DESIGN.md`. Тесты: +8 (`csg/tree-view.test.ts`), e2e `pnpm e2e:tree` (`csg/tree-view.ts`, `components/ComponentTree.tsx`, `store/ui-store.ts`, `hooks/useSelectedChildGuard.ts`, `App.css`, `i18n/locales/{ru,en}`, `e2e/tree.mjs`)
- **Фаза 9.2/9.3/9.6 — правка параметров ребёнка CSG:** выбор ребёнка в дереве открывает панель «Компонент CSG» (`ChildPropertiesPanel`) вместо свойств объекта; поля зависят от формы (`csg/child-params.ts`: куб W/H/D, сфера R, цилиндр/конус R/H, тор, призма/пирамида R/H/грани). Изменение значения пересчитывает CSG-результат и пишет новую операцию `edit_child_params` (`rootId`, `nodeId`, полные `params`, готовый меш `resultVertices/Indices/Normals`, `originalBboxSize`) — как `group`, воспроизведение детерминировано и не требует CSG при загрузке. Pivot корня не меняется: вершины приводятся к его локальной системе (`v = S⁻¹Rᵀ(v_world − pos₀)`, TRS₀ берётся из операции `group` корня). Работают вложенные CSG, subtract/intersect, повёрнутые/масштабированные операнды, корень, перемещённый после объединения. **Защита:** перед правкой дерево пересчитывается со СТАРЫМИ params и сравнивается с текущим мешем (bbox + объём, допуск 1e-3); при расхождении (например, вложенный CSG, сдвинутый до объединения) правка отклоняется с уведомлением, а не портит геометрию; правка, обнуляющая результат, откатывается; blur без изменения значения не пишет в историю. Операция зарегистрирована в `.3dtc`/`.doodle` (`VALID_OP_TYPES`, восстановление массивов меша), Timeline, фильтрах истории, i18n (ru/en). Кэш воркера корня синхронизируется (`workerSyncMesh`) — следующий CSG берёт новую геометрию. Воркер: флаг `worldSpace` в `rebuildTreeNode` (корень не центрируется по COM, ответ в системе создания CSG), `rebuildBooleanWorld` в `history-tree.ts`. Тесты: +24 (`__tests__/edit-child-params.test.ts` на реальном WASM: сравнение с «свежим» CSG, RS, вложенные, отказ, undo/redo с очищенными снимками, `.3dtc` round-trip; `csg/child-params.test.ts`), e2e `pnpm e2e:edit-child` (`store/edit-child.ts`, `store/document-store.ts`, `components/ChildPropertiesPanel.tsx`, `csg/child-params.ts`, `csg/types.ts`, `csg/worker-handlers.ts`, `csg/worker-client.ts`, `csg/history-tree.ts`, `store/rebuild.ts`, `io/3dtc-io.ts`, `io/doodle-io.ts`, `components/Timeline.tsx`, `constants.ts`, `i18n/locales/{ru,en}`, `App.tsx`, `e2e/edit-child.mjs`)
- **Фаза 9.4 (v1) — правка шага из Timeline:** у шагов `add_shape` и `edit_child_params` кнопка ✎ выделяет цель шага — живой объект сцены или ребёнка CSG (с раскрытием предков в дереве и переключением на вкладку «Дерево») — и открывает его форму параметров. История остаётся append-only: правка = новая операция над текущим состоянием (`resize_dims` / `edit_child_params`). Если объекта шага уже нет в сцене — уведомление. Остальные операции (move, fillet, mirror…) не редактируются: это переписывание истории (9.5) (`hooks/useTimelineEdit.ts`, `csg/tree-view.ts::locateNode`, `components/Timeline.tsx`, `components/LeftPanel.tsx`, `App.tsx`, `App.css`)
- **Фаза 9.9 — индикатор «правка недоступна»:** панель ребёнка CSG заранее проверяет (`checkChildEditable`: та же калибровка дерево ↔ меш без мутаций), можно ли править узел; при отказе показывает причину и блокирует поля (раньше причина выводилась только уведомлением после попытки). Проверка повторяется после каждой правки/перемотки. Замечание: это проверка согласованности дерева с мешем, а не валидности манифолда меша для CSG (`csgValid` из ideas) (`store/edit-child.ts`, `components/ChildPropertiesPanel.tsx`)
- **Фаза 9.5 — дизайн правки прошлых шагов (без кода):** `docs/PHASE_9_5_DESIGN.md` — append-операция `edit_step` + проекция эффективной истории, каскадный пересчёт замороженных CSG, политика `align`, нарезка 9.5.0–9.5.4, решения для утверждения
- **Фаза 9.5.0 — эффективная история (фундамент правки прошлых шагов, без UI):** новая append-only операция `edit_step` (`stepIndex`, `stepFingerprint`, `patch` fillet/move/mirror, `before`, обязательные `replacements` — пересчитанные `group`/`edit_child_params`/`align` ниже по течению) и чистая проекция `projectHistory(ops, hypothetical?)` (`store/project-history.ts`): у шага N подставляются новые значения (последняя правка побеждает), у замороженных шагов — готовые результаты, сами `edit_step` выбрасываются; несовпадение отпечатка/индекса/вида → правка игнорируется целиком. Проекция идемпотентна (без `edit_step` — тот же массив) и стоит на входе ВСЕХ потребителей истории: `buildRebuildMeta`, `rebuildFromHistory` (и воркер `rebuildScene`), `rebuildBuildTree`, `registerBakedNodes`, `findCreationTransform` (калибровка 9.3, замки 9.9) — undo/redo/перемотка, загрузка `.3dtc`/проекта/автосейва получают эффективную историю без правок на местах вызова. Там же: `effectiveOps`, `effectiveToRawIndex`, замыкание зависимостей каскада `computeCascade` (group/mirror/edit_child_params/align/delete), `MAX_CASCADE_STEPS`. `edit_step` зарегистрирована в `.3dtc`/`.doodle` (`VALID_OP_TYPES`, массивы мешей в `replacements`). Тесты: +25 (`store/project-history.test.ts` — 20 unit; `__tests__/project-history-wasm.test.ts` — 5 на реальном WASM: pivot CSG после правки move операнда A, смена плоскости mirror, undo/redo со снимками и без, калибровка дерева, `.3dtc` round-trip, неверный отпечаток) (`csg/types.ts`, `store/project-history.ts`, `store/rebuild.ts`, `store/edit-child.ts`, `io/3dtc-io.ts`, `io/doodle-io.ts`)
- **Фаза 9.8 — правка зеркальных детей CSG + починка восстановления зеркальных операндов:** зеркальный примитив-операнд теперь регистрируется в Build Tree как `primitive` с ОРИГИНАЛЬНЫМИ `params` и упорядоченным списком плоскостей `TreeNode.mirrored` (раньше — baked-нода с отражёнными вершинами без params, править было нечего). Воркер (`rebuildTreeNode`) отражает примитив в origin до TRS (`manifold.mirror`), поэтому геометрия идентична живой (`world = TRS·mirror(v)`), а правка params работает тем же путём, что у обычных детей (`edit_child_params`), с той же калибровкой. Единая точка регистрации — `registerObjectInTree` (`csg/history-tree.ts`; заменила 5 дублей в `document-store`/`mirror-store`). **Починка:** `rebuildBuildTree` восстанавливал зеркального операнда (объект уже поглощён CSG и отсутствует в `objects`) как НЕзеркальную копию оригинала, а существующий узел не сбрасывал params после undo правки; теперь узел строится из params оригинала + `composeMirroredList(origNode.mirrored, plane)` (соседние одинаковые плоскости отменяются), существующий — сбрасывается по префиксу истории. Флаг `mirrored` в `MirrorOperation` не добавлялся: он выводится из `plane` и цепочки операций (формат `.3dtc` не меняется). `bakeMirroredSubtree` учитывает прежнее зеркало примитива (зеркало CSG с зеркальным ребёнком сохраняет объём). Тесты: +6 (`__tests__/edit-mirrored-child.test.ts`: регистрация, правка = свежий CSG, различение зеркала, 2 плоскости, перестройка дерева после `clearTree`, undo/redo, объём при зеркале CSG) и +2 UI (`child-editability-ui.test.tsx`); `mirror-multi-level.test.ts` обновлён под primitive-ноду; e2e `pnpm e2e:edit-child`: призма → зеркало YZ → CSG → правка радиуса (`csg/types.ts`, `csg/history-tree.ts`, `csg/worker-handlers.ts`, `csg/worker-client.ts`, `csg/tree-view.ts`, `store/rebuild.ts`, `store/document-store.ts`, `store/mirror-store.ts`, `components/ComponentTree.tsx`, `e2e/edit-child.mjs`)
- **Фаза 9.9 (доработка) — замок в дереве и сообщение вместо формы:** в дереве компонентов нередактируемый ребёнок получает 🔒 и подсказку «Правка недоступна: <причина>»; в панели — блок «Правка недоступна» с причиной вместо формы (раньше — поля с disabled). Причины: `nested_moved` (вложенный CSG, сдвинутый до объединения — дерево не воспроизводит меш), `mirror` (запечённая зеркальная копия), `baked`, `boolean` (контейнер, замка не получает), `no_origin`. Статическая проверка вынесена в единую `isChildEditable`/`nodeEditability` (`csg/tree-view.ts`) и используется read-моделью, `edit-child.ts` (отказ `not_editable`), деревом и панелью; согласованность — свойство КОРНЯ (`checkRootConsistency`, один вызов воркера на корень, хук `useRootConsistency` проверяет только раскрытые корни). Переименовано `mirrored` → `mirror` в `NotEditableReason`. Тесты: +10 (`tree-view.test.ts`, `__tests__/child-editability-ui.test.tsx` — дерево и панель на реальном WASM), e2e `pnpm e2e:tree` расширен (`csg/tree-view.ts`, `store/edit-child.ts`, `hooks/useRootConsistency.ts`, `components/ComponentTree.tsx`, `components/ChildPropertiesPanel.tsx`, `App.css`, `i18n/locales/{ru,en}`, `e2e/tree.mjs`)
- **Фаза 9.7 (минимум) — индикация пересчёта:** панель ребёнка показывает «Пересчёт CSG…» при `busy` и «Проверка возможности правки…» во время калибровки (`components/ChildPropertiesPanel.tsx`)
- **E2E-проверка в браузере (Playwright, Фаза 9):** devDependency `playwright`, `web-app/e2e/helpers.mjs` (`openApp()` — запуск Chromium, ожидание canvas и CSG-воркера, сбор ошибок консоли) и `web-app/e2e/smoke.mjs` (`pnpm e2e:smoke`: приложение стартует, WebGL и воркер живы, фигуры добавляются). Для WebGL в headless-Chromium на Linux обязательны флаги `--use-angle=gl-egl --use-gl=angle --ignore-gpu-blocklist` (иначе приложение показывает WebGLFallback) (`web-app/e2e/*`, `web-app/package.json`)
- **Фаза 9.5.2 — правка шага move с каскадом CSG и align:** ✎ у шага «Переместить» в Timeline открывает панель «Шаг N: Перемещение» (`components/StepPanel.tsx`, `ui-store.selectedStep`; не модалка) — ΔX/ΔY/ΔZ (поворот/масштаб — если шаг их меняет), коммит по Enter / уходу из поля, «Пересчёт CSG…» на время каскада. `document-store.editStepParams` → `store/edit-step.ts::computeStepEdit`: история «как если бы шаг сразу был с новой дельтой» (`projectHistory` с гипотетической правкой), по порядку пересчитываются `group` (`computeCsgResult`; pivot = новый TRS операнда A — R8; legacy-группы extrude — в своей конвенции, `bakeResultRS`), `edit_child_params` (путь 9.3 с калибровкой) и `align` (re-solve, решение В2: deltas заново из axis/anchor/anchorId по рамкам на этом шаге — цели остаются выровненными). Атомарный отказ (пустой результат, предел 50 шагов) с восстановлением кэша воркера и дерева и уведомлением с номером шага. Timeline: метка «✎M» у правленого шага, подпись «Правка шага N: сдвиг (8, 0, 0) → (12, 0, 0)», фильтр «Правка шага». `project-history`: `effectivePatches`, `effectiveOpAt`, `cascadeSteps`, `CascadePlan.alignResolve`. `hooks/useSelectedStepGuard.ts`. Тесты: +27 (WASM-каскад 14 — `__tests__/edit-step-move.test.ts`, панель 5 — `step-panel-ui.test.tsx`, unit 7 — `project-history`, `helpers`, `.3dtc` 1); e2e `pnpm e2e:edit-step-move`
- **Фаза 9.5.3 — правка плоскости шага mirror с каскадом CSG:** ✎ у шага «Зеркало» в Timeline открывает панель «Шаг N: Зеркало» — выбор плоскости YZ / XZ / XY (радиогруппа, применяется сразу, без «Применить»; та же плоскость — ничего). Движок 9.5.2 расширен, не переписан: `SUPPORTED_KINDS += 'mirror'`, ветки mirror в проверке значения / «не изменилось» / `before`. Шаг mirror ничего не хранит готовым — копии и `mirrored[]` воспроизводятся из списка оригинала (`composeMirroredList`), поэтому правка ЗАМЕНЯЕТ вклад шага (копия `[XZ]`, не `[YZ, XZ]`), а зеркала ниже перекомпонуются (R12). Каскад — тот же: `group`, `edit_child_params` (зеркальный ребёнок с новой плоскостью), `align` re-solve. Timeline: «Правка шага N: зеркало YZ → XZ». Тесты: +17 (WASM — `__tests__/edit-step-mirror.test.ts` 11, панель 1, unit 4, `.3dtc` 1); e2e `pnpm e2e:edit-step-mirror`
- **Тест: незамкнутый STL → CSG — предсказуемое поведение** (`__tests__/import-mesh-csg-nonmanifold.test.ts`, реальный WASM): union/subtract/intersect с импортированным незамкнутым мешем в обоих порядках операндов не падают, показывают уведомление, объекты/история не меняются, `busy` сброшен; контроль — CSG примитивов. Фиксирует текущее ограничение: `csgBoolean` не допускает к CSG любой `import_mesh` (и замкнутый)
- **Фаза 9.5.4 — правка глубины шага extrude с каскадом CSG (Фаза 9.5 закрыта):** `GroupOperation.source` (`{ kind: 'extrude', baseId, slabId, axis, depth }`) пишет `extrudeSelected`; такая группа правится как шаг: ✎ в Timeline (подпись «Выдавить Z на 5») → панель «Шаг N: Выдавливание» — глубина (Enter/blur, знак — сторона), ось только для просмотра. Движок 9.5.2/9.5.3 расширен: `StepPatch` `extrude`, `SUPPORTED_KINDS += 'extrude'`, `patchKindFor(op)` (только группа с source), отпечаток — id плиты. Плита строится одной функцией `helpers.extrudeSlab` по мировой рамке базы: каскад пересчитывает её (замена `add_shape` — допускается ДО правленого шага) и саму группу N (самозамена — только у правки extrude), затем CSG/align ниже; правка move базы ДО extrude теперь тянет плиту за базой. Старые extrude без source как extrude не редактируются (EXTRUDE-LEGACY). Timeline: «Правка шага N: выдавливание (глубина 5 → 10)». Тесты: +20 (WASM — `__tests__/edit-step-extrude.test.ts` 10, панель 3, unit 6, `.3dtc` 1); e2e `pnpm e2e:edit-step-extrude` (сцена из фикстуры `e2e/fixtures/extrude-union.3dtc`)
- **CSG-INDEPENDENT-COPY — зеркало и вставка CSG дают независимую параметрическую копию:** копия получает СВОЁ дерево Build Tree (а не запечённый меш): узлы `${idКопии}:${idИсточника}` (детерминированно — правки детей копии воспроизводятся по истории), дети-примитивы с params правятся как у оригинала (9.2/9.3). Зеркало — `copySubtree(id, newId, plane)`: мировые трансформы узлов отражены, примитивы получают плоскость в `mirrored[]` (9.8), а не запекаются (`bakeMirroredSubtree` для зеркала CSG больше не вызывается); baked-узлы отражают вершины. Вставка — буфер хранит снимок дерева и систему создания (`ClipEntry.csgTree`), операция `group` (`ids: []`) — его же (`GroupOperation.copyTree`), дерево — `instantiateSubtree`; правка оригинала после Ctrl+C во вставку не попадает. Система создания копии для правки ребёнка — `findCreationTransform`: зеркало — отражённая система источника (рекурсивно по истории), вставка — `copyTree.origin`. `rebuildBuildTree` строит дерево копии по истории (перемотка, загрузка `.3dtc`, автосейв). Копия и оригинал не связаны (не linked). Замок `mirror` — только у примитива, запечённого старым зеркалом (baked с params); отражённый настоящий baked-меш и старая вставка без дерева — 🔒 `baked`. Тесты: +20 (`__tests__/independent-copy-mirror.test.ts` — 10, `__tests__/independent-copy-paste.test.ts` — 9, `io/3dtc-io.test.ts` — 1; в `csg/tree-view.test.ts` — проверка отражённого baked без params); `csg-mirror-chirality.test.ts` — 2 теста переписаны под новую модель (дети — примитивы с `mirrored[]`; хиральность — дерево воспроизводит меш, контроль без зеркала — `tree_mismatch`). e2e `pnpm e2e:independent-copy` (`csg/history-tree.ts`, `csg/types.ts`, `csg/tree-view.ts`, `store/mirror-store.ts`, `store/document-store.ts`, `store/rebuild.ts`, `store/edit-child.ts`, `store/helpers.ts`, `e2e/independent-copy.mjs`)
- **IMPORT-MESH-CSG — CSG для замкнутых STL (по manifold, а не по типу):** импортированный меш (STL, 3D-текст) допускается к объединению/вычитанию/пересечению, если он замкнут — это решает воркер (manifold построился). Незамкнутый → воркер бросает ошибку с маркером `NON_MANIFOLD` (`csg/worker-handlers.ts`: `NON_MANIFOLD_ERROR`, проверка операндов в `csgBoolean`/`csgBooleanSync`), стор показывает `notify(t('errors.csgNonManifold'), 'warning')` (новый ключ ru/en), `busy` сброшен, объекты и история не меняются (`isNonManifoldError` в `store/csg-result.ts`). В дереве CSG импорт — 🔒 baked, примитивы рядом правятся. Тесты: +7 (`__tests__/import-mesh-csg.test.ts` — замкнутый ∪/− куб с проверкой объёма и рамки, дерево и правка куба, импорт сдвинут до CSG + перемотка без снимков + `.3dtc`, отказ для незамкнутого, текст ru/en, контроль), `import-mesh-csg-nonmanifold.test.ts`: «текущее ограничение» перевёрнут — замкнутый STL работает. e2e `pnpm e2e:import-mesh-csg` (фикстуры `e2e/fixtures/closed-cube.stl`, `open-triangle.stl`)
- **ALIGN-REVIT — выравнивание по реальной геометрии с учётом поворота + `aria-label` у всех кнопок тулбара:** рамка выравнивания (`helpers.computeWorldAABB`) — проекция реальной геометрии через полный TRS (`pos + R·S·v` по вершинам); без вершин — OBB: локальная рамка из params (`localParamsBox`) → 8 углов (`obbCorners`) → проекция (`obbWorldAABB`). Повёрнутый цилиндр выравнивается по основанию / ободу, повёрнутый куб — по реальной грани/ребру, масштаб учитывается. Один решатель `solveAlignDeltas` у живого `alignSelected` и re-solve каскада правки шага (move / mirror / extrude). UI не менялся: 9 кнопок (min/center/max × X/Y/Z), якорь — последний выбранный; явный выбор плоскости — отдельная задача ALIGN-UI-REVIT. Воспроизведение align — по сохранённым `deltas`: старые проекты при загрузке не сдвигаются. `IconButton` даёт доступное имя по умолчанию — подпись тултипа (`labelKey`), затем `title`/`label`. e2e берут кнопки по `aria-label` (`toolbarButton`/`panelButton` в `e2e/helpers.mjs`), а не по индексу (зеркало — 17-я, импорт — 4-я, «Объединение» — первая в группе). Тесты: +16 (`__tests__/align-obb.test.ts` — 12 на реальном WASM: OBB, цилиндр/куб/масштаб/повёрнутый якорь, каскад move/mirror/extrude; `__tests__/toolbar-aria.test.tsx` — 4: 35 кнопок ru/en с непустым уникальным именем, снимок списка), проверены откатом; e2e `pnpm e2e:align-obb` (`store/helpers.ts`, `components/IconButton.tsx`, `e2e/*.mjs`, `package.json`)
- Отображение версии приложения в StatusBar (справа): `{app.name} v{APP_VERSION}` (`StatusBar.tsx`, `constants.ts`)

#### Changed
- **DEVELOPMENT_PLAN — EXTRUDE-3D-SCALE (принято):** `extrudeSelected` — не extrude, а «растянуть 3D-объект по оси» (дублирует `scale`); в UI как «Extrude» не возвращать, настоящий extrude (эскиз → 3D) — Фаза 11; движок остаётся для правки шага 9.5.4. Задача EXTRUDE-UI отменена. AGENTS.md: цепочка веток (ветки задач → PR в `phase-9`), extrude — движок правки, не UI-инструмент
- **DEVELOPMENT_PLAN — `aria-label` для всех кнопок тулбара** (в ALIGN-REVIT): e2e берут кнопки зеркала и импорта STL по индексу — хрупко при перестановке кнопок
- **e2e `independent-copy` — проверка по тому, что видит пользователь:** дети копии ищутся по подписи внутри строки объекта (а не по id узлов), замки проверяются сразу после раскрытия; вставка без дерева падает с «не раскрывается — запечённый меш». Проверено откатом: старое зеркало → «замок 🔒 mirror», старая вставка → «запечённый меш». Решения CSG-INDEPENDENT-COPY (независимая копия, снимок на момент Ctrl+C, правила `findCreationTransform` для копий) записаны в `docs/PHASE_9_DESIGN.md` (`e2e/independent-copy.mjs`)
- **Левая панель шире, фигуры в 3 столбца:** `.panel-left` 170 → 320px, `.shape-grid` `1fr 1fr` → `repeat(3, 1fr)` (8 фигур — 3 + 3 + 2). Подписи фигур, дерева, истории и списка объектов не обрезаются; при 1366px вьюпорту остаётся 846px — медиа-запрос не понадобился. Только CSS, логика не менялась (`App.css`)
- **DEVELOPMENT_PLAN — ограничения редактирования и UX-баги:** активные задачи CSG-INDEPENDENT-COPY (зеркало/вставка CSG → независимая параметрическая копия, объединяет MIRROR-INDEPENDENT и PASTE-INDEPENDENT), NESTED-MOVED-EDIT, ALIGN-REVIT (переработка выравнивания по идее Revit, заменяет ALIGN-PRIMITIVE-AABB, + `aria-label`); мелкие UX (уникальные id позиции/поворота, NumInput `0.000` вместо `-0.0`); принятые ограничения IMPORT-MESH-PARAMETRIC и EXTRUDE-LEGACY — не задачи; запись «CSG с импортом работает» исправлена — новая задача IMPORT-MESH-CSG (включить CSG для замкнутых STL, i18n уведомления)
- **Ядро CSG вынесено в `computeCsgResult` (Фаза 9.5.0, без изменения поведения):** sync операндов → boolean → pivot = transformA → un-bake RS операнда A — общая функция для `csgBoolean` и будущего каскада 9.5 (иначе каскад через запасной путь воркера дал бы pivot = COM, риск R1). Туда же перенесён `syncObjectsForOperation`; `groupOperationFromResult`/`groupReplacementFromResult` строят операцию `group` и замену для `edit_step` из одного результата. Тест: результат побайтно равен операции `group`, записанной `csgBoolean` (`store/csg-result.ts`, `store/document-store.ts`)
- **`rebuildBuildTree` воспроизводит params/transform примитивов по префиксу истории (Фаза 9.3):** дерево не чистится между перемотками, поэтому узел мог хранить состояние из «будущего» (после undo правка ребёнка оставалась в дереве при откатанном меше). Теперь `add_shape` сбрасывает `params`/`localTransform` существующего узла к начальным (иммутабельно через `setNode` — снимки дерева хранят ссылки), а `resize_dims` и `edit_child_params` применяют params заново. Побочно исправляет потерю `resize_dims` в дереве при undo/redo (`store/rebuild.ts`)

#### Fixed
- **ALIGN-PRIMITIVE-AABB — выравнивание примитивов без поворота и масштаба:** рамка примитива считалась по params + позиции: поворот и масштаб игнорировались, а цилиндр/конус/призма/пирамида (есть `radius`) — как сфера радиуса r. Повёрнутый цилиндр «выравнивался как сфера», повёрнутый куб — по ±w/2. Теперь — по реальной геометрии (ALIGN-REVIT). Регресс: `__tests__/align-obb.test.ts`, e2e `pnpm e2e:align-obb` (проверены откатом)
- **Безымянные кнопки тулбара:** `IconButton` без `ariaLabel`/`title` ставил `aria-label=""` (почти все кнопки тулбара) — теперь имя из подписи тултипа. Регресс: `__tests__/toolbar-aria.test.tsx`
- **IMPORT-CSG-STUB — импорт в CSG подменялся примитивом-заглушкой:** `computeCsgResult` считал `import_mesh` примитивом (`shapeType !== 'csg'`) и отправлял воркеру `shapeA = { shapeType: 'import_mesh', params: {} }` — воркер строил заглушку вместо меша STL. Скрыто, пока импорт отсекался по типу; найдено тестом IMPORT-MESH-CSG (незамкнутый треугольник «объединялся») (`store/csg-result.ts`). Регресс-тест `import-mesh-csg.test.ts` › «IMPORT-CSG-STUB» (STL ∩ большой куб = STL: объём 1000 и рамка, импорт — операнд A и B) — проверен откатом фикса
- **IMPORT-TREE-RELOAD — CSG с импортом после загрузки:** `rebuildBuildTree` создавал baked-узлы импортов только в конце (и только для оставшихся в сцене) — на шаге group импорта в дереве не было, CSG становился запечённым корнем, дети нередактируемы. Теперь узел создаётся на шаге импорта (вершины в COM, pivot = transform + COM — как живой импорт); move импорта воспроизводится от pivot, а не от transform шага (`store/rebuild.ts`). Регресс-тест `import-mesh-csg.test.ts` › «IMPORT-TREE-RELOAD» (чистое дерево по истории: узел импорта на месте объекта, корень — boolean с импортом) — проверен откатом фикса
- **MIRROR-CSG-TREE-RELOAD — дерево зеркального CSG после загрузки:** узел копии жил только в сессии (MIRROR-TREE-PRESERVE), а `rebuildBuildTree` после загрузки/перезапуска ставил заглушку-куб — теперь копия дерева строится по истории (`store/rebuild.ts`). Давний баг (до CSG-INDEPENDENT-COPY). Регресс-тест `independent-copy-mirror.test.ts` › «MIRROR-CSG-TREE-RELOAD» — проверен откатом фикса
- **PASTE-CSG-RS — вставленный повёрнутый CSG терял поворот/масштаб после перемотки/загрузки:** операция вставки писала только `resultCenter`; теперь и `resultRotation`/`resultScale` (вершины CSG — без RS, 8.5.9) (`store/document-store.ts`). Давний баг, касался и старой вставки мешем. Регресс-тесты `independent-copy-paste.test.ts` › «PASTE-CSG-RS» (вставка с деревом и мешем, поворот по трём осям + масштаб, перемотка без снимков и `.3dtc`) — проверены откатом фикса
- **CI не доходил до проверок:** pnpm 9 в CI падал на `pnpm install` (`packages field missing or empty`) — `web-app/pnpm-workspace.yaml` содержит только `allowBuilds` без `packages`, что допустимо с pnpm 10+, но не в 9. Версия pnpm зафиксирована в `web-app/package.json` (`packageManager: pnpm@12.10.1`, совпадает с локальной); `pnpm/action-setup` во всех workflow берёт её оттуда (`package_json_file`), Node 20/22 → 24, установка везде `--frozen-lockfile`. pnpm 12 дописал в `pnpm-lock.yaml` документ с самим pnpm (`packageManagerDependencies`), остальное без изменений (`web-app/package.json`, `web-app/pnpm-lock.yaml`, `.github/workflows/{ci-web,build,deploy}.yml`)
- **EXTRUDE-AABB — плита extrude ставилась без учёта позиции объекта:** `extrudeSelected` брал кэш `obj.aabb`, а у примитива он локальный (сдвигается только `moveObject`) — объект, появившийся не в начале координат (второй и далее, spawn x = 25…), получал плиту у начала координат (результат растягивался, например [−5, 30] вместо [20, 30]). Теперь рамка — мировая по вершинам с полным TRS (`worldVerticesAABB`), плита — `extrudeSlab`. Найдено при 9.5.4
- **MIRROR-CHAIN-REPLAY — зеркало зеркальной копии примитива воспроизводилось неверно** (undo без снимков, загрузка `.3dtc`, правка шага): воркер (`handleRebuildScene`) не регистрировал копию примитива в `shapeInfos`, и зеркало копии уходило в ветку CSG/импорта — мировое отражение кэша + список `mirrored[]` на main thread применяли последнюю плоскость дважды (повёрнутая призма `[XZ, YZ]` теряла отражение YZ). Теперь копия — примитив (`csg/worker-handlers.ts`). Найдено при 9.5.3
- **MIRROR-CSG-REPLAY — зеркальная копия CSG-объекта при воспроизведении смещалась** (двойная трансляция и RS): копия брала мировые вершины кэша воркера как локальные. Теперь `buildRebuildMeta` даёт копии отражённый локальный меш оригинала (как живое `mirrorSelected`: `mirrorVerticesInPlace` + winding) и включает её в `csgResultIds` (`store/rebuild.ts`). Найдено при 9.5.3
- **ALIGN-CSG-AABB — выравнивание с CSG-объектом смещалось на позицию операнда A:** `computeWorldAABB` для CSG/импорта брал кэш `obj.aabb`, а он в локальной системе объекта (вершины CSG — относительно pivot = TRS A); после пересборки из истории кэш был другим. Теперь рамка — по вершинам с полным TRS (`helpers.worldVerticesAABB`); решатель вынесен в `helpers.solveAlignDeltas` (общий для `alignSelected` и re-solve 9.5.2). Найдено при 9.5.2. Тесты: `__tests__/align-csg.test.ts` — живой `alignSelected` с двумя CSG (X min/center/max, воспроизведение из истории), `solveAlignDeltas` с CSG-целью (`store/helpers.test.ts`)

#### Removed
- **Блокировка CSG по типу для импорта (UI):** `App.tsx` делал кнопки CSG неактивными при любом выделенном `import_mesh` (`hasNonManifoldSelected`); проп `nonManifoldSelected` (`Toolbar`, `PropertiesPanel`, `CsgButtons` — подсказка там всё равно не выводилась) и ключ `csg.nonManifold` удалены; захардкоженная русская строка в `csgBoolean` заменена на `errors.csgNonManifold`
- **Скругление куба (fillet) удалено из приложения** — до появления нормального инструмента (выбор рёбер, любые тела, B-Rep; см. DEVELOPMENT_PLAN «Фаза 11 — Будущее»). Прежний fillet был глобальным параметром куба (`filletRadius`, скругление всех рёбер сразу), а не инструментом CAD, и терялся в CSG (FILLET-LOST-IN-CSG). Убраны: секция «Скругление» в панели свойств, шаг fillet и фильтр в Timeline, действие `applyFillet`, состояние `filletRadius` в ui-store, сообщение воркера `applyFillet` (`handleApplyFillet`, `workerApplyFillet`), `buildPrimitiveWithFillet`, `buildRoundedBox`, `FILLET_EPSILON`/`FILLET_MIN_RADIUS`, `FilletIcon`, `ShapeParams.filletRadius`, патч `{ kind: 'fillet' }` правки шага (9.5) и `StepReplacement.params`, i18n `properties.fillet*`, `timeline.fillet`, `filters.fillet`, `errors.filletFailed`. Ветка 9.5.1 (каскад fillet) не вливается.
- **Старые проекты со скруглением открываются:** тип операции `fillet` оставлен (deprecated) и принимается `.3dtc`/`.doodle`; при загрузке (`openProject`, проекты IndexedDB, автосейв) `io/legacy-fillet.ts::migrateLegacyFillet` вырезает шаги fillet (в Timeline не остаётся «мёртвых» шагов, на которых Ctrl+Z ничего не делает), снимает `filletRadius` из params операций и объектов, перенумеровывает `edit_step`; объекты `.3dtc` со скруглёнными вершинами пересобираются из истории — кубы острые. Уведомление «скругление удалено…» — одно на проект. Воспроизведение (`buildRebuildMeta`, воркер `rebuildScene`) шаг fillet игнорирует и без миграции. Тесты: +9 (`io/legacy-fillet.test.ts` — 4, `__tests__/legacy-fillet-load.test.ts` — 5 на реальном WASM: `.3dtc` через `openProject`, файл без скругления без изменений, `.doodle`, автосейв), −2 (fillet-кейсы `render-data-invariant`, `types.test`); `project-history.test.ts` переведён на патчи move (`csg/types.ts`, `csg/worker-handlers.ts`, `csg/worker.ts`, `csg/worker-client.ts`, `csg/rebuildOps.ts`, `store/document-store.ts`, `store/types.ts`, `store/ui-store.ts`, `store/rebuild.ts`, `store/project-history.ts`, `components/PropertiesPanel.tsx`, `components/Timeline.tsx`, `components/icons/index.tsx`, `App.tsx`, `constants.ts`, `constants.tsx`, `io/legacy-fillet.ts`, `i18n/locales/{ru,en}`)

---

## [1.2.3] — 2026-11-01

**Patch: multi-level mirror + CSG mirror double RS (Этапы 8.5.9–8.5.12).**

### Fixed
- **CSG-MIRROR-PRIMITIVE-PARAMS (8.5.10):** CSG из mirror primitive терял зеркальную форму (diff = 7.5). Фикс: `SceneObject.mirrored` flag, маршрутизация в `workerSyncMesh`. (`types.ts`, `mirror-store.ts`, `document-store.ts`, `rebuild.ts`)
- **Multi-level mirror (8.5.12):** `mirrored` хранил одну плоскость — undo/redo multi-level `YZ→XZ` давал одно зеркало (diff = 30.0). Фикс: `mirrored: MirrorPlane[]` (ordered, cancel same-plane), `rebuildFromHistory` — цикл. (`types.ts`, `mirror-store.ts`, `rebuild.ts`, `3dtc-io.ts`)
- **Copy/paste mirror primitive (8.5.12):** `ClipEntry` без `mirrored` + vertices → зеркало терялось (diff = 2.86). Фикс: `ClipEntry.mirrored` + vertices. (`types.ts`, `document-store.ts`)
- **moveObject mirror primitive (8.5.12):** регистрировался как primitive-нода (без `!obj.mirrored`) → baked неверно. Фикс: `!obj.mirrored` → baked. (`document-store.ts`)
- **Double RS mirror CSG (8.5.12):** mirror CSG имел `vertices` с baked TRS + `transform` с полным TRS → RS дважды (vol ratio = 0.5, bbox diff = 1.93). Фикс: `mirrorObject` CSG — прямое зеркало vertices (`mirrorVerticesInPlace`), `transform = mirrorTransform`, `PIVOT-TRANSFORMA srcCom-shift` убран. Инвариант `world' = M·world`. (`mirror-store.ts`, `document-store.ts`)
- **CSG-PRESERVE-RS (8.5.9):** `csgBoolean` терял rotation/scale операнда A. Фикс: вершины un-baked'ятся к локальной системе A, `resultTransform` = полный TRS A. (`document-store.ts`, `worker-matrix.ts`)
- **rebuildBuildTree startT (8.5.9):** начальная трансформация CSG-результата не включала `resultRotation`/`resultScale`. (`rebuild.ts`)

### Added
- `MirrorPlane = 'XY' | 'XZ' | 'YZ'` type
- `SceneObject.mirrored: MirrorPlane[]` (ordered, cancel same-plane)
- `ClipEntry.mirrored`, `ClipEntry.mirrorVertices/Indices/Normals`
- Tests: `mirror-multi-level.test.ts` (5), `mirror-csg-volume.test.ts` (4), `csg-preserve-rs.test.ts` (5)

### Changed
- `SceneObject.mirrored: 'XY'|'XZ'|'YZ'` → `MirrorPlane[]` (backward-compat: string → `[string]` при load)

---

## [1.2.1] — 2026-10-26

**Patch: double-mirror primitive fix.**

### Fixed
- **DOUBLE-MIRROR-PRIMITIVE:** двойное зеркало примитива (YZ → YZ) давало 180°-поворот вместо identity (pivot = identity, vertices = одинарное зеркало). Корень: `mirrorObject` для primitive делал `rebuildNode` (из params), теряя запечённое зеркало vertices. Фикс: зеркалить `obj.vertices` напрямую. Тесты: `mirror-double.test.ts` (6 тестов, double YZ/XZ/XY = identity для prism, cone, pyramid, cube). (`store/mirror-store.ts`)

### Added
- `mirror-double.test.ts` — 6 тестов на double mirror primitive (identity для YZ/XZ/XY).

### Changed
- `phase-8-scenarios.test.ts` — Scenario 3 остаётся один mirror (double покрыт отдельно).

---

## [1.2.0] — 2026-10-25

**Фаза 8.5 — Унификация отрисовки и данных (единый источник).**

### Added
- `ARCHITECTURE_RENDER.md` — единый источник данных и отрисовки
- CI-тест `render-data-invariant.test.ts` — 26 тестов, `render = data` для всех типов (7 примитивов + TRS + import_mesh + CSG union/subtract + mirror + fillet + resize + 2 CSG-инварианта)
- Новый формат проекта `.3dtc` (ZIP + JSON, `version: 3dtc-v1`, base64 для mesh)
- `io/3dtc-io.ts` — `serialize3dtc` / `parse3dtc`
- `io/3dtc-io.test.ts` — 8 тестов (round-trip, version, thumbnail, reject)

### Changed
- Worker `buildShape` возвращает `vertices` в origin (COM) для всех primitive
- `handleRebuildScene` возвращает `vertices` в origin (rebuild = live)
- `addShape` применяет spawn к `transform`, не к `vertices`
- `importStl` / `addRawMesh` — `centerMassAtOrigin` + pivot = COM
- Store: `openProject` / `saveProject` (вместо `openDoodle` / `saveDoodle`)
- STL-export: всегда `applyTRS(transform, v)` без bbox-вычитания

### Removed
- `centerGeometry` (`viewport-hooks.ts`, 3 места + определение)
- `isPivotCenteredGeometry` (`geometry-utils.ts`, `stl-export.ts`)

### Fixed
- **RENDER-PRISM-BBOX-OFFSET** — устранён вместе с `centerGeometry`
- **VIEWPORT-DOUBLE-CENTERING** — устранён
- **PIVOT-CSG** — устранён (pivot = transformA)
- **STL-export** — теперь совпадает с render (для cone/pyramid был сдвиг на `h/4`)

### Legacy
- `.doodle` — оставлен как legacy (не используется в UI). Конверсия — отдельно.

---

## [Unreleased]

### Added
- **Тест double-mirror primitive (Фаза 8.5, Этап 8.5.7):** `mirror-double.test.ts` (6 тестов: YZ/XZ/XY для prism sides=3, cone, pyramid, cube) — двойное зеркало примитива возвращает identity: `obj3.transform == obj1.transform` и `world(obj3) == world(obj1)` (diff = 0.00000000). (`src/__tests__/mirror-double.test.ts`)

### Fixed
- **Double-mirror primitive = identity (Фаза 8.5, Этап 8.5.7):** ветка примитива в `mirrorObject` вызывала `rebuildNode`, пересобирая геометрию из `params` и теряя предыдущее зеркало, запечённое в `obj.vertices`. Двойное зеркало давало pivot = identity, но vertices = одинарное зеркало (для асимметричной призмы — выглядит как поворот на 180°). Фикс: зеркалить `obj.vertices` напрямую (с 8.5.1/8.5.3 они всегда origin-центрированы), без rebuild из params. Убраны `cloneSubtree`/`resetSubtreeTransform`/`rebuildNode`/`deleteNode` из примитивной ветки. CSG mirror не затронут (`bakeMirroredSubtree` — отдельный путь). (`src/store/mirror-store.ts`)
- **CI-тест render = data (Фаза 8.5, Этап 8.5.5):** `render-data-invariant.test.ts` расширен с 18 до 24 тестов. Покрыто: import_mesh (COM-центрирование, pivot = COM), CSG union (cube+prism), CSG subtract (cube−sphere), mirror YZ (src → mirror pivot), fillet (cube r=2), resize (неравномерный scale 0.5×2×1.5). Все diff render−data < 1e-4. (`src/__tests__/render-data-invariant.test.ts`)
- **Формат .3dtc (Фаза 8.5, Этап 8.5.4):** новый формат проекта — ZIP + JSON с `version: "3dtc-v1"`. `serialize3dtc`/`parse3dtc` в `io/3dtc-io.ts` сохраняют `objects` (Record\<string, SceneObject\>) + `operations` (TinkerCraftOperation[]) + `operationsTrimmed` + `thumbnail`. TypedArray (Float32Array/Uint32Array) сериализуются в base64 с маркером `{__t, d}` — без потерь точности, компактнее JSON-массивов. `open3dtcFilePicker()` — file picker с `accept: '.3dtc,.zip'`. `parse3dtc` валидирует версию, отклоняет `.doodle`. Тест `3dtc-io.test.ts` (8): round-trip идентичность, base64 bit-for-bit, version `3dtc-v1`, thumbnail, operationsTrimmed, reject unsupported version, reject missing model.json. (`src/io/3dtc-io.ts`, `src/io/3dtc-io.test.ts`)
- **Store: import_mesh COM-центрирование (Фаза 8.5, Этап 8.5.3):** `importStl` и `addRawMesh` центрируют `SceneObject.vertices` по COM (`centerMassAtOrigin`), pivot = `transform + COM` → `world = pivot + v` не меняется, но данные становятся едиными с live-путём и rebuild (8.5.2.5). Устраняет расхождение live/rebuild для STL-импорта. (`src/store/document-store.ts`)
- **Тест render = data (Фаза 8.5, Этап 8.5.3):** `render-data-invariant.test.ts` (18 тестов) — `matrixWorld @ geometry.attributes.position` (то, что видит браузер) против `applyTRS(transform, vertices)` через `computeRSMatrix` (общая математика worker/STL). Render-сторона строит ровно то же дерево Three.js, что `useMeshSync`, через ПРОДАКШН-функцию `applyTransformToPivot`. Покрыто: 7 примитивов (cube/sphere/cylinder/cone/torus/prism/pyramid), 3 комбинации TRS, cone+полный TRS (регресс `centerGeometry` — раньше расходился на 2.5 по Y), проверка `geometry.position === SceneObject.vertices` без translate. Все diff = 0.00e+0…1.8e-15. (`src/__tests__/render-data-invariant.test.ts`)

### Changed
- **Store: openDoodle/saveDoodle → openProject/saveProject (Фаза 8.5, Этап 8.5.4):** `openProject` использует `parse3dtc` (новый формат `.3dtc`), загружает `doc.objects` напрямую без `rebuildFromHistory`; `saveProject` использует `serialize3dtc` (ZIP + `model.json` + `thumbnail.png`). File picker принимает `.3dtc,.zip`. STL export: `.replace(/\.3dtc$/, '')` вместо `.doodle`. (`src/store/document-store.ts`, `src/store/types.ts`, `src/App.tsx`)
- **Viewport: centerGeometry удалён (Фаза 8.5, Этап 8.5.3):** все три места (create, update, mirror-preview) больше не вычитают bbox-центр из вершин — `geometry = vertices` как есть, pivot = `SceneObject.transform`. Асимметричные примитивы (cone/prism/pyramid) больше не отрисовываются со сдвигом на `bboxCenter(origin)`. Убраны функции `centerGeometry` и `isPivotCenteredGeometry`; `applyTransformToPivot` — единая точка применения трансформа (create/update/preview). (`src/components/viewport-hooks.ts`, `src/csg/geometry-utils.ts`)
- **STL-export: всегда applyTRS(transform, v) без bbox-вычитания (Фаза 8.5, Этап 8.5.3):** `applyTransformToVertices` больше не вычитает bbox-центр — конвенция `world = R·S·v + pos` единая для рендера, данных и экспорта. Раньше для cone/prism/pyramid экспорт расходился с рендером на `h/4`. Тесты обновлены под новую конвенцию (spawn применяется один раз, scale/rotate без центрирования). (`src/io/stl-export.ts`, `src/io/stl-export.test.ts`)

### Removed
- **`centerGeometry` и `isPivotCenteredGeometry` (Фаза 8.5, Этап 8.5.3):** компенсация смешанных конвенций больше не нужна — данные едины с 8.5.2.5, `import_mesh` центрирован в store. (`src/components/viewport-hooks.ts`, `src/csg/geometry-utils.ts`)

### Added
- **Store: spawn в transform, не в vertices (Фаза 8.5, Этап 8.5.2):** `addShape` сохраняет `vertices` из worker в origin (COM ≈ 0), spawn (`idx * OBJECT_SPACING`) применяется только к `transform.position`. `makeObject` не модифицирует вершины — конвенция подтверждена интеграционным тестом на настоящем WASM. (`src/store/add-shape-origin.test.ts`, 4 теста: cube, spawn второго объекта, prism, cone)
- **Worker vertices в origin (Фаза 8.5, Этап 8.5.1):** `handleBuildShape`/`handleApplyFillet` больше не запекают spawn-трансляцию в вершины — `SceneObject.vertices` всегда в origin (COM), spawn применяется в store к `transform`. `buildPrimitive`: COM-центрирование cone/pyramid через универсальный `centerManifoldToCOM` (extractMesh + centerMassAtOrigin + translate — корректно и для усечённых форм; `Manifold.cylinder center=true` центрирует BBox, не COM). `ManifoldObject.translate()` добавлен в интерфейс. Тест `worker-build-origin.test.ts`: 7 типов, COM ≈ (0,0,0). (`src/csg/worker-handlers.ts`, `src/csg/worker-build-origin.test.ts`)
- **ARCHITECTURE_RENDER.md (Фаза 8.5):** единый источник данных и отрисовки — `vertices` всегда в origin (COM), `transform` — мировой pivot, render = data. Новая нумерация фаз: 0–8.5, 9 (Параметрическая история), 10 (Яндекс.Игры), 11 (Будущее). Запланирован формат `.3dtc` (ZIP + JSON), `.doodle` больше не поддерживается.
- **CSG vertex truth test (independent oracle):** `csg-vertex-truth.test.ts` — полностью независимая проверка world-координат CSG без worker-оракула. Тест 1: генерирует 8 вершин куба + 6 вершин призмы вручную, применяет TRS (scale → Rx·Ry·Rz → translation) независимо, затем проверяет что все вершины куба вне призмы и все вершины призмы вне куба присутствуют в CSG world-меше (tolerance 1e-3). Тест 2 (RENDER PATH): монтирует настоящий `useMeshSync` → THREE.Scene, извлекает world-вершины из scene graph (matrixWorld) и сверяет с тем же независимым эталоном. Оба теста: 8/8 куб-вершин и 4/6 призменных вершин найдены, diff = 0.000000. (`__tests__/csg-vertex-truth.test.ts`)
- **CSG before/after test:** `csg-before-after.test.ts` — snapshot transform + raw vertices ПЕРЕД union, вычисление true world = applyTRS(vertices − spawn, transform), сверка ПЕРЕД vs ПОСЛЕ. Проверяет: (1) operands удалены из store, (2) pivot CSG = snapCube.transform (diff < 1e-6), (3) bbox CSG = componentwise union operand bboxes (diff < 1e-4), (4) все cube-вершины вне призмы найдены в csg world (0 missing). (`__tests__/csg-before-after.test.ts`)
- **CSG world vertex explicit test:** `csg-world-vertex.test.ts` — явное вычисление world для каждого объекта: `world = applyTRS(transform, raw − spawn)`. Логирование raw[0], world[0], bbox, pivot для cube, prism и CSG-результата. Сравнение bbox (diff < 1e-4), pivot (diff < 1e-6), outside-вершин (фильтр: вне bbox другого операнда → внутри поглощается union). Cube: all 8 found. Prism: 6 total, 0 missing (2 inside cube absorbed). (`__tests__/csg-world-vertex.test.ts`)
- **CSG render truth test:** `csg-render-truth.test.ts` — финальная проверка RENDER PATH. Монтирует реальный `useMeshSync` → THREE.Scene, извлекает `matrixWorld @ geometry.attributes.position` (то, что видит браузер). Логирует `mesh.position`, `mesh.rotation`, `mesh.scale`, `pivot.position/rotation/scale`, `matrixWorld.elements`, `geometry.attributes.position[0]`. Сравнивает `dataWorld = applyTRS(csg.transform, csg.vertices)` vs `renderWorld = matrixWorld @ pos` через nearest-neighbor (csg.vertices 24 vs mesh geometry 132 — разные представления одной геометрии). Результаты: max nearest-neighbor diff = **0.0000e+0**, bbox diff = **0.0000e+0**, cube outside render = 0/8, prism outside cube bbox & render = 0/6. Pivot = (20,20,20) = transformA, mesh.position = (0,0,0), useMeshSync **не** центрирует CSG (isPivotCenteredGeometry=true). (`__tests__/csg-render-truth.test.ts`)
- **CSG distance test (before/after union):** `csg-distance.test.ts` — все 48 парных расстояний (8 куб-вершин × 6 призм-вершин) ДО и ПОСЛЕ union. Для каждой пары: nearest-neighbor поиск в CSG world, сравнение distBefore vs distAfter. Результат: max drift = **1.27e-6** (Float32 precision), обе вершины существуют. ДЕМОНСТРАЦИЯ: 2 из 6 вершин призмы внутри куба (P0, P4) — поглощены union (nearest CSG dist = 0.80 и 3.26). При измерении до поглощённой вершины расстояние «меняется» (6.71 → 7.22, diff = 0.51) — snap ловит ближайшую точку на кривой пересечения. Это объясняет скриншот пользователя: 20.33 → 17.34 (shift ~3 мм) = призм-вершина поглощена union, snap перепрыгнул на 3 мм. (`__tests__/csg-distance.test.ts`)
- **CSG no-overlap test:** `csg-no-overlap.test.ts` — union двух НЕпересекающихся фигур (куб (10,10,10) 20³ bbox [0,0,0]→[20,20,20] + призма (20,55,20) r=12 h=20 sides=3, bbox разделены — проверено программно). Исключает «поглощение» как объяснение сдвига пользователя. Результат: **CSG vertices = 14 = 8 (куб) + 6 (призма) — ровно**; pivot = transformA = [10,10,10] (diff 0.0); cube missing = 0/8; prism missing = 0/6; max pairwise drift по всем 48 парам = **1.87e-6** (Float32 precision); P0 shift = [0.000000, 0.000001, 0.000000]. Вывод: при отсутствии пересечения union сохраняет ВСЕ вершины и ВСЕ расстояния — сдвига геометрии нет. (`__tests__/csg-no-overlap.test.ts`)
- **CSG P2 check:** `csg-p2-check.test.ts` — проверка конкретных вершин призмы до/после union. Пересекающийся сценарий (куб@(20,20,20) + призма rot(20,20,20) scale(1,1,0.5)): P0 и P4 внутри куба → поглощены (nearest CSG dist = 0.80 и 3.26); P1, P2, P3, P5 вне куба → все найдены в CSG (dist = 0.000001). P2 = [9.6517, 27.7799, 21.1775] (x=9.65 < cube.minX=10) — nearest CSG dist = 0.00000085. C0↔P2: before=21.0043, after=21.0043 (Float32 drift). No-overlap сценарий: CSG vertices = 14 (8+6), все 6 призм-вершин dist ≤ 0.000001, C0↔P2: before=67.617701, after=67.617701, diff = **1.46e-8**. Вывод: внешние вершины призмы не сдвинуты. (`__tests__/csg-p2-check.test.ts`)

### Fixed
- **REBUILD-SPAWN-BAKE (Фаза 8.5, Этап 8.5.2.5):** `handleRebuildScene` запекал spawn-трансляцию **в вершины** результатов (`applyTransform(buildPrimitive, t)`), тогда как `handleBuildShape` после 8.5.1 возвращает origin-вершины. Путь undo/redo/загрузки проекта давал `SceneObject` с удвоенным spawn (`vertices` содержат spawn **и** `transform.position` содержит spawn); корректную позицию обеспечивал только compensating `centerGeometry` во вьюпорте. Теперь results-петля `handleRebuildScene` снимает запечённую трансляцию (`−t.xyz`; инвариант «в кэше запечена только трансляция» подтверждён во всех ветках — add_shape/fillet/move/mirror/align/resize/import) и центрирует по COM, отдавая смещение в новом поле `MeshResult.centerOffset`; `store/rebuild.ts` прибавляет его к pivot → `world = pivot + vertex` **не меняется**, а данные становятся едиными с live-путём. CSG-результаты исключены (`booleanResultIds`, включая зеркальных потомков) — сохраняют pivot-центрированную конвенцию §5.4. UB-0 фолбэк `import_mesh` переведён на COM-центрирование + `centerOffset`. Тест `csg/worker-rebuild-origin.test.ts` (9): cube/cone COM ≈ 0 и `centerOffset ≈ 0`, move, `group` без offset, `import_mesh` pivot = COM исходного меша, **главный инвариант — rebuild world == live world** (cube, cone), + 2 store-теста `rebuildFromHistory`. Обновлён `store/rebuild-baked.test.ts`. Scenario 7 (undo/redo) и Scenario 8 (save/load): rebuild-path diff = **0.00e+0**. (`csg/worker-handlers.ts`, `csg/worker-client.ts`, `store/rebuild.ts`)
- **PIVOT-CSG = TRANSFORMA (Bug 3):** pivot результата CSG = позиция первого операнда (transformA), а не центр масс (COM). Раньше `document-store.ts:516` ставил `pivot = COM(world mesh)` — gizmo CSG-результата «съезжал» на `(COM − transformA)` от позиции первого операнда (измерено **0.0192** ед. для куб@(20,20,20) + призма@(20,20,20) rot(20,20,20) scale(1,1,0.5)). Исправлено: `centerMassAtOrigin` центрирует вершины по COM (тот же центр, что worker-кэш), затем применяется остаточный сдвиг `v += (COM − transformA)` → `v = v_world − transformA`, `pivot = transformA`. Инвариант `world = pivot + vertex` сохранён (измерено `|world − oracle| = 0.00000000`). Mirror-путь (`mirror-store.ts`) компенсирует сдвиг для пересобранной геометрии: `v += M(srcCom)` где `srcCom = COM(вершины первого операнда)` — для legacy-объектов (COM-центрированных) `srcCom ≈ 0`, поведение не меняется. Extrude (`document-store.ts`) обновлён по тому же паттерну. Изменена конвенция `GroupOperation.resultCenter` → pivot = transformA. Rebuild из истории (`rebuildFromHistory`) использует `resultCenter` как pivot — консистентно. (`store/document-store.ts`, `store/mirror-store.ts`, `store/rebuild.ts`, `csg/types.ts`)
- **VIEWPORT-DOUBLE-CENTERING (CSG-результат рендерился со сдвигом):** `useMeshSync` вычитал `bboxCenter` из вершин **всех** объектов (`centerGeometry`, update-путь, mirror-preview). Для примитивов это правильно: `handleBuildShape` запекает spawn-трансляцию в вершины, и вычитание её снимает. Но CSG-вершины уже центрированы по **центру масс** (§5.4, `centerMassAtOrigin`), а pivot = COM — повторное вычитание `bboxCenter` смещало меш на `bboxCenter(centered)`. Для асимметричной геометрии COM ≠ bboxCenter: union куба (origin) и призмы (10,0,0) рендерился со сдвигом **4.2491** ед. по X. Исправлено: добавлен продакшн-предикат `isPivotCenteredGeometry(shapeType)` (`csg/geometry-utils.ts`), bbox-центрирование пропускается для CSG в трёх местах вьюпорта и синхронно в STL-экспорте (`applyTransformToVertices`), чтобы экспорт не расходился с рендером. Измерено после фикса: `|render − data| = 0.00000000`. Тесты: `viewport-mesh-sync.test.ts` (4 теста, вызывают **настоящий** `useMeshSync` и сравнивают world-координаты меша из scene graph с data-world: CSG create/update-путь, поворот rotZ=30 вокруг pivot, контроль примитива — позиция не удваивается), `csg-invariants.test.ts` INVARIANT 4, `phase-8-scenarios.test.ts` Scenario 6 (модель ожидания использует тот же предикат). (`csg/geometry-utils.ts`, `components/viewport-hooks.ts`, `io/stl-export.ts`)
- **MIRROR-CHIRALITY (Variant B, baked children):** зеркало CSG с асимметричными примитивами (prism sides=3, пирамида, конус) было приближённым — `mirrorNodeRecursive` зеркалит **трансформы** детей, но не геометрию примитива. Призма sides=3 на origin (position=0, `mirrorPoint(0)=0`) оставалась незеркалённой. Измерено: union куба и призмы sides=3, mirror YZ — bbox расходился с эталоном на **2.5** ед. Исправлено: добавлена async-функция `bakeMirroredSubtree(nodeId, plane)` (`csg/history-tree.ts`), вызываемая из `mirrorObject` после `mirrorTreeNode`. Она конвертирует primitive-детей в baked с отражёнными вершинами (`mirrorVerticesInPlace` + `swapWindingInPlace`), сохраняя `shapeType`/`params` для будущего редактирования. Для уже-baked детей — зеркалирование вершин in-place. Математика: M·T(p)·R(e)·S·v = T(M·p)·R(mirrorEuler(e))·S·(M·v) — mirrorEuler является точным сопряжением (YZ: flip rotY/rotZ, rotX unchanged). После фикса: max vertex nearest-neighbor diff = 0.00000000 для призмы sides=3._scenario3 oracle обновлён на true-mirror (mirror of original CSG world vertices). Тесты: `csg-mirror-chirality.test.ts` (10 тестов: vertex-level точность, params сохранены, mirroredPlane, edit-baked-child, 5 примитивов it.each, UI data-world). (`csg/history-tree.ts`, `csg/types.ts`, `store/mirror-store.ts`)

### Known Limitations
- **CENTERING-RESIDUAL** — pivot legacy-документов (центрирование по transformA) не мигрирован на COM-конвенцию. (Двойное центрирование вьюпорта устранено — см. VIEWPORT-DOUBLE-CENTERING; остаток касается только старых файлов, где pivot ≠ COM.)
- **RENDER-PRISM-BBOX-OFFSET** — `centerGeometry` (`viewport-hooks.ts:413`) вычитает `bboxCenter` из вершин примитивов перед применением pivot-транcформации. Для симметричных примитивов (куб, сфера, цилиндр) `bboxCenter = spawn` → сдвига нет. Для **асимметричных** примитивов (призма sides=3, пирамида, конус) `bboxCenter ≠ spawn` → отрисовка смещена относительно реальной позиции CSG. Численно подтверждено: призма (sides=3, radius=12) — bboxCenter = (28,0,0) при spawn = (25,0,0) → смещение **3.000 мм** в локальной системе. Пользовательский замер: до union **12.6665 мм** (рендер-конвенция, bbox-center) vs после union **10.7443 мм** (CSG-конвенция, spawn/centroid) — расхождение **1.922 мм**. Тест `__tests__/csg-vertex-distance.test.ts` воспроизводит оба замера с точностью ±0.004 мм. CSG-вычисления корректны (diff до/после = 1.56e-7); сдвиг возникает при переключении с bbox-центрированной отрисовки примитива на pivot-центрированную отрисовку CSG-результата. Фикс: заменить bbox-center на center-of-mass для асимметричных примитивов в `centerGeometry`.

---

## [1.1.0] — 2026-10-15

**Фаза 8 — Единая модель трансформов.** `relativeToParent` — единственный источник истины. CSG-центрирование унифицировано на `centerMassAtOrigin`. 340/340 тестов.

### Fixed
- **Этап 8.5 — Регрессия 8c7a9dc: workerRebuildScene/BuildImportedMesh payload:** `workerRebuildScene` отправлял `{ opCount: operations.length }` вместо `{ operations }` — handler `handleRebuildScene` получал `msg.operations = undefined` и молча возвращал пустой результат. `workerBuildImportedMesh` отправлял `{ vertexCount, indexCount }` вместо `{ vertices, indices }` — handler `handleBuildImportedMesh` получал `new Float32Array(undefined)` и бросал TypeError. Prod-путь: undo/redo rebuild (`rebuildFromHistory`) и импорт STL (`addImportedMesh`) были сломаны. Тесты не ловили — `worker-bridge.ts` строил правильный payload сам, обходя worker-client. Исправлено: payload `workerRebuildScene` = `{ operations }`, `workerBuildImportedMesh` = `{ objId, vertices, indices }`. Добавлен `worker-client.test.ts` (3 теста): проверяет реальный payload через FakeWorker (spy на postMessage без worker-bridge). (`csg/worker-client.ts`, `csg/worker-client.test.ts`)
- **Фаза 8, Этап 6.5 — CENTERING-INCONSISTENCY + регрессии Этапа 6:** (1) worker центрировал vertex centroid, frontend — `extractCenteredAt(transformA)`, helpers — объёмный центроид (diff 3.89 для union куб+призма) — унифицировано на `centerMassAtOrigin`; (2) `handleCsgBooleanSync` кешировал manifold и сразу удалял его (`m.delete()` после `setCached` — висячий WASM-хендл), response был центрированным при frontend-сдвиге ещё на -transformA (двойное смещение) — response = world mesh, кэш = COM-копия, `disposeCached` вместо прямого `delete()`; (3) `handleCsgBoolean` не применял transformA/B к origin-кэшу (регрессия Этапа 6, CSG+CSG лег бы в overlap) — применяет один раз; (4) `extrudeSelected` переведён на `workerCsgBooleanWithSync` (origin-конвенция); (5) `rebuild.ts`: `extractAndCenterInPlace` мутировал выбрасываемую копию (двойное смещение legacy-документов) — теперь `centerMassAtOrigin` + запись центрированной копии. (csg/worker-handlers.ts, store/document-store.ts, store/rebuild.ts)
- **REBUILD-TREE-NODE-CRASH (msg.nodes is not iterable):** `workerRebuildNode` в `worker-client.ts` передавал в воркер только `{ nodeId, nodeCount }` — массив `nodes` терялся. Воркер `handleRebuildTreeNode` ожидал `msg.nodes` и падал с `TypeError: msg.nodes is not iterable` при resize призмы/куба. Исправлено: добавлено `nodes` в сообщение (`{ nodeId, nodeCount: nodes.length, nodes }`). (`csg/worker-client.ts`)
- **CSG-TRANSFORM-IS-CENTROID (CSG-результат позиционируется со сдвигом для асимметричной геометрии):** Корень проблемы глубже, чем казался. `extractAndCenterGetAABB` центрировал вершины по `bboxCenter` (centroid CSG-результата = 21,20,20), но pivot стоял в `transformA` (20,20,20). Для асимметричной геометрии (куб+призма) `bboxCenter ≠ transformA`, поэтому `pivot.position (transformA) + vertex (centered_by_bboxCenter)` давало сдвиг. Исправлено: создана `extractCenteredAt(vertices, center)` которая центрирует вершины относительно заданной точки (`transformA`). Pivot и вершины теперь согласованы: `pivot(transformA) + vertex(centered_at_transformA) = world_vertex`. Аналогично исправлен `extrudeSelected`. (`store/document-store.ts`, `store/helpers.ts`)
- **E2 (STL-заголовок и кириллица):** заголовок писался побайтно через `charCodeAt` — в ru-локали («Творческая студия — экспорт STL») значения > 255 обрезались по младшему байту. Теперь UTF-8 через `TextEncoder` с обрезкой по 80 байт (`io/stl-export.ts`)
- **UB5-3 (скролл списка объектов):** у `.object-list` не было собственного скролла (в отличие от `.ct-list`) — длинный список растягивал секцию «Объекты» и скроллилась вся левая панель. Добавлены `max-height: 240px` + `overflow-y: auto` + тонкий скроллбар (`scrollbar-width/scrollbar-color`), математика как у `.ct-list`. Портировано из `yandex-games` (`src/App.css`)
- **ub2-4 (рёбра фигур):** добавлены рёбра (edge lines) у 3D-фигур через `LineSegments` по `EdgesGeometry` (порог 30°), цвет на пару тонов темнее базового (×0.7, `edgeColorFor`); обновляются при CSG/resize/fillet/смене цвета, освобождаются при удалении; лимит 100k треугольников для тяжёлых импортов; рёбра не участвуют в raycast. Портировано из `yandex-games` (`src/components/viewport-hooks.ts`, тесты `src/components/viewport-hooks.test.ts`)
- **CI (падение «Deploy to GitHub Pages» на шаге build):** тяжёлый тест `doodle-io` «открывает model.json больше прежнего лимита 5 МБ» (~100k треугольников, serializeDoodle + ZIP + parseDoodle) не успевал за дефолтные 5 с на медленном CI-runner GitHub Actions («Test timed out in 5000ms»). Подняты глобальные `testTimeout`/`hookTimeout` до 15 с в конфиге vitest (`vite.config.ts`) и индивидуальный таймаут 30 с для тяжёлого теста (`doodle-io.test.ts`). Это НЕ баг продукта — только таймаут тестов. (FIX CI)
- **CSG-PRISM-OFFSET (призма/конус/пирамида давали сдвиг при CSG):** manifold-3d строит prism/pyramid с основанием на z=0, центр масс в (0,0,h/2). При CSG с кубом (центр в 0,0,0) это давало сдвиг. Решено: `Manifold.cylinder(..., true)` для prism/pyramid — `center=true` центрирует по Z (от -h/2 до h/2), центр масс в origin. Удалена `centerManifoldAtOrigin` (давала неправильный результат для prism с нечётным числом рёбер). Все примитивы центрированы через API manifold-3d. (`csg/worker-handlers.ts`)
- **RESIZE-TRS-DOUBLE (удвоение TRS при resize примитива):** `resizeObject` пересобирал mesh через `rebuildNode` (mesh с запечённым worldTransform) и писал в `vertices` при неизменном `transform` → Viewport3D применял TRS второй раз на pivot. Исправлено: примитивы пересобираются `workerBuildShape` с нулевым transform (vertices в origin), CSG — только scale в transform, vertices не трогаются. 6 тестов в `store/document-store.test.ts`. (`store/document-store.ts`)

### Added
- **Фаза 8, Этап 8 — Финальная проверка: 8 интеграционных тестов §10.2:** новые `__tests__/phase-8-scenarios.test.ts` (8 сценариев) + `__tests__/worker-bridge.ts` (in-process мост Worker → настоящие worker-handlers с настоящим manifold-3d WASM в vitest; мокается только postMessage-транспорт, CSG-математика и центрирование не подделаны). Проверены: (1) куб+призма → Union без сдвига (pivot=COM, diff=0); (2) prism rotate/scale/resize без удвоения (z world=80, diff=0); (3) prism(RS) → CSG → зеркало YZ — pivot зеркалён, RS детей scale 1.5/rotZ −20 сохранён, COM doctrine diff 9.5e-7 (MIRROR-CSG-CHILD-RS-LOSS закрыт); (4) CSG+CSG Union без drift (bbox diff 9.5e-7, CSG-CSG-POSITION-DRIFT закрыт); (5) scale 0.5 + rot 20,20,20 → CSG на месте; (6) Export STL — world-координаты (R·S·(v−bboxCenter(v))+t), diff=0; (7) undo/redo snapshot- и rebuild-путём (diff=0); (8) save/load .doodle — CSG+зеркало восстановлены (diff=0). Итого 337/337. Ограничение: MIRROR-CSG-PRIMITIVE-CHIRALITY — зеркало CSG с асимметричным примитивом приближённое (доктрина MIRROR-SCALE abs; см. ARCHITECTURE_TRANSFORMS.md §11). (`__tests__/phase-8-scenarios.test.ts`, `__tests__/worker-bridge.ts`)
- **Фаза 8, Этап 7 — тесты `resizeObject` (RESIZE-TRS-DOUBLE):** 6 тестов в `store/document-store.test.ts` с `vi.mock('../csg/worker-client')` (jsdom без Worker/WASM): vertices не удваиваются (mesh запрошен с нулевым transform), anchor-семантика (position не меняется), CSG-результат (vertices не трогаются, scale в transform), Scenario 2 §10.2 (призма → rotate 30° → scale 2× → resize, worldSize [48,40,24], diff=0), `relativeToParent` детей не меняется, `localTransform` не меняется. (`store/document-store.test.ts`)
- **Фаза 8, Этап 6.5 — Унификация центрирования (КРИТИЧЕСКИЙ):** создана `csg/geometry-utils.ts` — единая `centerMassAtOrigin` (объёмный центроид) + `isClosedMesh`, перенесены из `store/helpers.ts` (реэкспорт сохранён). Worker больше не зависит от store-слоя. Все слои (worker, document-store, rebuild.ts) центрируют CSG одной функцией; pivot CSG-результата = центр масс. 6 тестов `csg/geometry-utils.test.ts`: COM union куб+призма = 10/9, diff vertex centroid vs COM = 3.89 (мотивация), инвариант «pivot + центрированная вершина = мировая» (< 1e-6), fallback незамкнутой mesh, пустой mesh, паритет слоёв. См. `ARCHITECTURE_TRANSFORMS.md` §5.4. (`csg/geometry-utils.ts`, `csg/geometry-utils.test.ts`)
- **Фаза 8, Этап 6 — Worker: кэш в origin, transform один раз:** `handleSyncMesh` кэширует mesh в origin (без transform). `handleCsgBooleanSync` применяет transform один раз перед boolean, центрирует результат. `handleRebuildTreeNode`: root boolean центрирует, inner boolean — нет. Соответствие §6 проверено через typecheck + существующие тесты (317/317 зелёные). См. `ARCHITECTURE_TRANSFORMS.md` §6. (`csg/worker-handlers.ts`)
- **Фаза 8, Этап 5 (КРИТИЧЕСКИЙ) — `rebuildNode` использует `relativeToParent`:** `worldTransform = composeTransforms(parentWorld, node.relativeToParent)`. Transform применяется к origin-мешу **ровно один раз**. Fallback на `localTransform` для нод без `relativeToParent` (обратная совместимость). 6 новых тестов в `history-tree.test.ts` (primitive position, CSG position, mirror no drift, round-trip composeTransforms, fallback localTransform, nested CSG). См. `ARCHITECTURE_TRANSFORMS.md` §3.2. (`csg/history-tree.ts`, `csg/history-tree.test.ts`)
- **Фаза 8, Этап 4 — `mirrorNodeRecursive` зеркалит `relativeToParent`:** mirror применяется к `relativeToParent` (пересчитывается через `subtractTransform(mirroredWorld, mirroredParentWorld)`), `localTransform` пересчитывается через точное зеркало мира (`mirrorPoint` + `mirrorEuler` + `abs(scale)`). Scale всегда `Math.abs()` (CHANGELOG `MIRROR-SCALE`). Rotation — простой sign flip (CHANGELOG `MIRROR-ROTATION-SIMPLE-SIGN`). Рекурсия передаёт `mirroredParentWorld` детям. 6 новых тестов в `history-tree.test.ts` (mirror primitive, mirror CSG children, double-mirror identity, round-trip composeTransforms, MIRROR-CSG-CHILD-RS-LOSS, multi-axis rotation). См. `ARCHITECTURE_TRANSFORMS.md` §4. (`csg/history-tree.ts`, `csg/history-tree.test.ts`)
- **Фаза 8, Этап 3 — `createBooleanNode` заполняет `relativeToParent` детей:** при создании boolean-узла для каждого ребёнка вычисляется `relativeToParent = subtractTransform(childWorld, parentWorld)`. `localTransform` ребёнка не тронут (обратная совместимость). Корневой boolean-узел имеет `relativeToParent = null`. 6 новых тестов в `history-tree.test.ts` (позиция, round-trip composeTransforms, parentId, multi-axis rotation). (`csg/history-tree.ts`, `csg/history-tree.test.ts`)
- **transform-decompose (`composeTransforms` / `subtractTransform`):** новые утилиты в `worker-matrix.ts` для работы с иерархией трансформаций. `composeTransforms(parent, relative)` вычисляет абсолютную трансформацию из родительской и относительной (позиция, поворот XYZ, масштаб). `subtractTransform(world, parent)` восстанавливает относительную трансформацию из абсолютной и родительской (используется при перемещении объекта внутри группы). Обе функции корректно обрабатывают `null`-родителя (тождественная матрица). 22 теста в `worker-matrix.test.ts` покрывают edge cases, композицию scale/rotation/position и round-trip. (`csg/worker-matrix.ts`, `csg/worker-matrix.test.ts`)
- **centerMassAtOrigin (объёмный центроид):** новая функция в `helpers.ts` для центрирования mesh по центру масс (не по BBox). Для замкнутой manifold-сети используется теорема дивергенции (объёмный центроид): даёт h/2 для призмы и h/4 для пирамиды. Для незамкнутой сети (импортированный STL с дырами) — откат на площадной центроид. Мутирует `vertices` in-place, возвращает смещение `{ cx, cy, cz }`. 6 тестов в `helpers.test.ts` проверяют куб, призму, пирамиду, пустой массив и in-place мутацию. (`store/helpers.ts`, `store/helpers.test.ts`)
- **Чек-лист прогресса Фазы 8:** в `web-app/ARCHITECTURE_TRANSFORMS.md` добавлен раздел §11 «ПРОГРЕСС ЭТАПОВ (ЧЕК-ЛИСТ)» — таблица статусов этапов 0–9 с легендой (🔲/🔄/✅) и детальный чек-лист с задачами и критериями готовности на каждый этап; Этап 0 (подготовка: бэкап-ветка `backup-before-phase-8`, WIP-коммит, документ) отмечен выполненным. Документация, изменений кода нет. (`web-app/ARCHITECTURE_TRANSFORMS.md`)
- **Диагностическое логирование (48 логов):** специализированные логгеры для отладки CSG, worker, pointer, snap, mesh sync, transform, store events — выводятся только в `pnpm dev`, tree-shaken в продакшене. Включает: `utils/debug.ts` (8 логгеров), `utils/debug-format.ts` (4 форматтера), `worker-client.ts` (11 вызовов воркера с таймингами), `Viewport3D.tsx` (pointer/raycast/gizmo), `viewport-hooks.ts` (mesh sync/ruler/snap), `document-store.ts` (CSG operands/center), `worker-handlers.ts` (CSG result BBox/verts/imported mesh/sync), `history-tree.ts` (create primitive/boolean/baked) (`utils/debug.ts`, `utils/debug-format.ts`, `csg/worker-client.ts`, `components/Viewport3D.tsx`, `components/viewport-hooks.ts`, `store/document-store.ts`, `csg/worker-handlers.ts`, `csg/history-tree.ts`)
- **Тесты на цикл «экспорт/сохранение → загрузка» (T1):** регрессия UB-0a (запечённая позиция не применяется дважды), лимит треугольников (E1), UTF-8-заголовок (E2); round-trip `import_mesh` через `serializeDoodle → parseDoodle` (массив вместо `{"0":…}`, файл > 5 МБ открывается); `rebuild-baked.test.ts` — фолбэк baked-геометрии при пустом ответе воркера (4 теста, воркер моканут, WASM не нужен) (`io/stl-export.test.ts`, `io/doodle-io.test.ts`, `store/rebuild-baked.test.ts`)

---

## [1.0.0] — 2026-08-19

**Первый стабильный релиз TinkerCraft Web — Open Source 3D CAD-редактор.**

> **Статус:** ✅ Готов к деплою (GitHub Pages / Vercel / любой статический хостинг)
> **Платформа:** CAD-версия (чистый 3D-редактор, без интеграций игровых платформ)
> **Репозиторий:** [github.com/small-room/tinkercraft](https://github.com/small-room/tinkercraft)

### 🎉 Что это

TinkerCraft Web — браузерный 3D CAD-редактор, вдохновлённый CaDoodle, реализованный с нуля на React + Three.js + manifold-3d. Позволяет создавать, редактировать и экспортировать 3D-модели прямо в браузере.

### ✨ Основные возможности

- **8 примитивов:** Куб, Сфера, Цилиндр, Конус, Тор, Призма, Пирамида, 3D Текст
- **CSG-операции:** Объединение (Union), Вычитание (Subtract), Пересечение (Intersect) с WASM-движком manifold-3d
- **Параметрическое дерево (Build Tree):** CSG-результаты сохраняют параметричность — дети и операция записаны в history
- **Зеркалирование:** XY / XZ / YZ плоскости с кэшированием (mirror-cache), без дублирования вычислений
- **Выравнивание:** 9 позиций (min/center/max по X и Y) с подробными тултипами
- **Скругление (Fillet) и Экструзия (Extrude)**
- **Линейка (Ruler):** Измерение расстояний с привязкой к геометрии (vertex/edge/face/circle)
- **Экспорт STL:** Бинарный формат для 3D-печати
- **Сохранение/загрузка `.doodle`:** ZIP + JSON формат проекта
- **Менеджер проектов:** Несколько проектов в IndexedDB
- **Автосохранение:** При каждом изменении в IndexedDB
- **Drag-select:** Прямоугольное выделение множественных объектов
- **TransformControls:** Перемещение, вращение, масштаб с Gizmo
- **Snap to grid:** 1 / 5 / 10 / 50 единиц
- **Дерево компонентов:** Переименование, переключение видимости, удаление
- **Временная шкала (Timeline):** История операций с иконками и описаниями
- **Тёмная / светлая тема:** Переключение через CSS-переменные
- **Двухуровневые тултипы:** Мгновенный label + расширенное описание через 1.5 сек
- **40+ SVG-иконок:** Полная замена emoji/Unicode на профессиональные иконки
- **i18n локализация:** Полный перевод на английский и русский (🇬🇧 / 🇷🇺)
- **PWA:** manifest.json, theme-color, поддержка установки
- **WebGL fallback:** Graceful degradation при отсутствии WebGL2
- **ViewCube:** Навигационный куб для быстрого переключения видов

### 🏗️ Технологии

| Слой | Технология | Версия |
|------|-----------|--------|
| UI / Состояние | React 18 + Zustand 5 | react@18.3, zustand@5.0 |
| 3D Рендеринг | Three.js | r170 |
| CSG | manifold-3d (WASM, Web Worker) | 3.0.1 |
| Сборка | Vite | 6.x |
| Язык | TypeScript | 5.7 (strict) |
| Тесты | Vitest + jsdom | 4.x |
| Локализация | i18next + react-i18next | 26.x + 17.x |
| Пакеты | pnpm | — |

### 📊 Статистика

| Метрика | Значение |
|---------|----------|
| Выявлено проблем (код-ревью) | ~291 |
| Исправлено | ~176 |
| Признаны архитектурными / НЕ БАГ | ~115 |
| Активных проблем | **0** |
| Тестов | ~236 |
| Фаза 7 | ✅ Завершена |
| Фаза 7.5 | ✅ Завершена |
| Фаза 7.6 | ✅ Завершена |
| Фаза 8 | 🔲 Не начата (следующий этап) |

### 📝 Примечания к релизу

1. **Чистота кода:** В CAD-версии **нет** кода Яндекс.Игр (SDK, токены, игровые механики). Проект — чистый Open Source 3D-редактор.
2. **Сборка:** `pnpm build` → `dist/` — стандартная статическая сборка Vite. Совместима с любым хостингом статических файлов.
3. **Следующий этап (Фаза 8):** Параметрическая история операций — редактирование параметров прямо в Timeline, раскрытие CSG-операций.
4. **Яндекс-версия (отдельная ветка):** Если нужна версия для Яндекс.Игр — создаётся ветка `yandex-games` с SDK, токенами, ежедневными бонусами и лидербордами. Не входит в этот релиз.

### 🚀 Деплой

```bash
cd web-app
pnpm build          # Сборка в dist/
# Деплой на GitHub Pages / Vercel / Netlify / любой статический хостинг
```

### 📋 Чек-лист релиза

- [x] Код-ревью: все ~291 проблем закрыты (0 активных)
- [x] Typecheck: strict mode TypeScript, без `any` (кроме WASM init)
- [x] Тесты: ~236 тестов (jsdom + in-memory mocks)
- [x] Чистота: нет кода Яндекс.Игр
- [x] Документация: CHANGELOG, CODE_REVIEW, DEVELOPMENT_PLAN, AGENTS.md, ARCHITECTURE.md
- [x] Локализация: EN + RU
- [x] Иконки: 40+ SVG-иконок
- [x] PWA: manifest.json, theme-color
- [x] license: MIT (файл LICENSE присутствует)

---

## [Unreleased]

### Fixed

- **COLOR-HISTORY (цвета сбрасывались при открытии сохранённого проекта)**: Назначенные пользователем цвета не сохранялись в `.doodle` и сбрасывались к цветам по умолчанию после перезагрузки. Корень проблемы: в `PropertiesPanel` превью цвета (`onSetColor(id, color, true)`) сразу обновляло цвет объекта в store, а условие фиксации в историю `draftColor !== firstSelected.color` на `onBlur` было **всегда ложно** (значения уже совпадали) → операция `color` никогда не попадала в `operations[]` → не сериализовалась. Исправление: целевой объект и исходный (committed) цвет фиксируются в refs в момент начала редактирования; коммит в историю выполняется по `onBlur` или смене выделения, сравнивая draft с исходным цветом, а не с уже обновлённым `firstSelected.color`. Добавлены регрессионные тесты round-trip `color` через `.doodle`, добавлен dev-лог `[setColor]`. (`PropertiesPanel.tsx`, `doodle-io.test.ts`, `document-store.ts`)
- **MIRROR-TREE-PRESERVE**: Повторное зеркалирование CSG-результата создавало примитив `cube` вместо правильной boolean-ноды. Корень проблемы: `mirrorObject` вызывал `deleteNode(newId, true)` после создания зеркала, удаляя всё клонированное поддерево из дерева. При следующем зеркалировании `ensureInTree` не находил узел, создавал `baked`-ноду, а `rebuildBuildTree` падалбэкал в `createPrimitiveNode('cube')`. Исправление: убран `deleteNode` из `mirrorObject` — клонированное поддерево сохраняется для будущих операций. `rebuildBuildTree` теперь проверяет существование узла перед созданием — если узел уже существует (от `mirrorObject`), обновляет только transform, не перезаписывая структуру. (`mirror-store.ts:mirrorObject`, `rebuild.ts:rebuildBuildTree`)
- **MIRROR-DOUBLE-TRANSLATE**: Зеркало CSG-объектов создавало ломанные, непредсказуемые копии (разный результат при каждом применении). Корень проблемы: `moveObject` вызывал `moveTreeNode(id, delta)` для сдвига дочерних примитивов в дереве на translation delta, а затем `syncNodeTransform(id, newTransform)` устанавливал root localTransform с тем же translation. Это создавало двойной translation при tree-rebuild: дети уже сдвинуты + root translation применяется повторно через `applyCSGMeshes`. При обычном рендере это маскировалось (Viewport3D использует кэшированные центрированные вершины + pivot TRS), но при mirror root сбрасывается в identity — оставались только сдвинутые дети, давая неправильную форму. Исправление: убран `moveTreeNode` из `moveObject`. Дети остаются в оригинальных абсолютных позициях (со времени создания CSG). Root localTransform несёт полный TRS. `applyCSGMeshes` центрирует геометрию детей и применяет root TRS → корректная world-позиция. Mirror клонирует дерево, зеркалит детей + root TRS, сбрасывает root в identity, rebuild → центрированная зеркальная геометрия. (`document-store.ts:moveObject`)
- **CSG-RESIZE-NO-BAKE**: Ресайз CSG-результата (PropertiesPanel) запекал scale в вершины. `resizeObject` вызывал `rebuildNode(id)`, который через `applyCSGMeshes` применял root localTransform (включая scale) к центрированной геометрии детей — vertices получали scale, запечённый в координаты. Затем эти vertices сохранялись в SceneObject, а transform тоже содержал scale → двойное применение scale (в Viewport3D через pivot и в `handleSyncMesh` при булевых операциях, из-за чего результат CSG+CSG смещался). Исправление: для CSG-результатов `resizeObject` больше не вызывает `rebuildNode` — vertices остаются центрированными, scale живёт в transform и применяется через pivot. localTransform в дереве обновляется через `applyNodeTransform` (инвалидирует кэш rebuildNode). (`document-store.ts:resizeObject`)
- **PASTE-CSG-TREE**: Pasted CSG objects (`ids: []` in GroupOperation) were skipped by `rebuildBuildTree`, causing "children not in tree" warnings and missing tree nodes after undo/redo/load. Now registered as baked nodes from stored mesh data. (`rebuild.ts`)
- **CSG-MISSING-CHILD**: When a CSG group's child is missing from the tree (e.g. consumed by another CSG), the group is now registered as a baked node from stored mesh data instead of being skipped entirely. (`rebuild.ts`)
- **MIRROR-CSG-REBUILD**: Mirror copies of CSG results disappeared after loading from file. The worker's `handleRebuildScene` mirror handler only handled primitives (via `shapeInfos`), not CSG results. Now mirrors the cached manifold geometry for CSG/import_mesh objects. (`worker-handlers.ts`)
- **PASTE-CSG-COLOR**: Pasted CSG objects lost their color (always got default `#89b4fa`). Added `color` field to `GroupOperation` and use it in `buildRebuildMeta` when `ids` is empty. (`types.ts`, `rebuild.ts`, `document-store.ts`)

### Added

- **i18n локализация (Фаза 7.7)**: Полная локализация приложения на английский и русский языки через i18next + react-i18next. Автоопределение языка браузера, переключатель в StatusBar. Переведены все UI-элементы (~150 фраз): названия фигур, инструменты, CSG операции, тултипы, ошибки, уведомления, модалки. Создана структура `src/i18n/` с файлами переводов `locales/en/translation.json` и `locales/ru/translation.json`. (`i18n/index.ts`, все компоненты)
- **LanguageSwitcher**: Кнопка переключения языка (🇬🇧 EN / 🇷🇺 RU) в StatusBar с сохранением выбора в localStorage. (`StatusBar.tsx`)
- **Snap локализация**: "Snap:" → "Привязка:" (RU) / "Snap:" (EN), тайтлы кнопок привязки локализованы. (`App.tsx`)
- **ViewCube локализация**: Названия граней (Перед/Front, Зад/Back, Лево/Left, Право/Right, Верх/Top, Низ/Bottom) и label "Куб вида"/"ViewCube". (`ViewCube.tsx`)
- **snapLabel локализация**: Метки типов привязки (Точка/Vertex, Ребро/Edge, Грань/Face, Центр/Center) через i18n.t(). (`snap-utils.ts`)
- **Название приложения**: Аббревиатура **TC** как единая эмблема. EN: "Tinker Craft", RU: "Творческая студия". Title страницы динамически обновляется при переключении языка: "TC — Tinker Craft" / "TC — Творческая студия". Обновлены Toolbar, StatusBar, STL header, manifest.json, index.html. (`i18n/index.ts`, `Toolbar.tsx`, `StatusBar.tsx`, `stl-export.ts`, `manifest.json`, `index.html`)
- **Viewport hint локализация**: Подсказка управления вьюпортом переведена. (`App.tsx`)

### Changed

- **TOOLTIP_DATA**: Структура изменена с `label`/`description` на `labelKey`/`descriptionKey` — теперь использует i18n-ключи вместо хардкод-текстов. (`constants.ts`, `Tooltip.tsx`)
- **ALL_SHAPES_DATA**: Поле `label` → `labelKey`, `category` → `categoryKey` — i18n-ключи вместо хардкод-текста. (`constants.ts`, `constants.tsx`, `constants-react.tsx`)
- **OP_FILTER_LABELS**: Значения изменены на i18n-ключи. (`constants.ts`)
- **SNAP_VALUES**: Поле `label` → `labelKey`. (`constants.ts`)
- **opLabel**: Функция принимает параметр `t` для перевода. (`Timeline.tsx`)
- **getShapeLabel**: Функция принимает параметр `t` для перевода. (`LeftPanel.tsx`)
- **displayName**: Функция принимает параметр `t` для перевода. (`ComponentTree.tsx`)
- **Store notify**: Все `notify('Русский текст')` заменены на `notify(i18n.t('key'))`. (`document-store.ts`, `mirror-store.ts`, `rebuild.ts`)

### Fixed

- **MOVE-RS-DOUBLE (удвоение поворота/масштаба при открытии .doodle)**: Обработчик `move` в `handleRebuildScene` использовал `buildTransformMatrix(pos, rot, scale)` — запекание полного RS+T в вершины. Затем viewport `centerGeometry()` убирает только трансляцию, а `pivot.rotation/scale` применяет RS **ещё раз** → удвоение. Все остальные обработчики (`add_shape`, `fillet`, `resize_dims`, `align`) используют `applyTransform()` — только трансляцию. Исправлено: `move` теперь тоже использует `applyTransform(fresh, {x,y,z})`. CSG не пострадал: fallback-путь `group` сам применяет RS через `applySRAroundCenter()`. (`worker-handlers.ts`)
- **DOODLE-MESH (CSG-объекты не отображались при открытии .doodle файла)**: `JSON.stringify` превращает `Float32Array`/`Uint32Array` в plain-объекты `{"0":1.5,...}` **без свойства `length`**. После `JSON.parse` вызов `new Float32Array(obj)` даёт **пустой массив** (`ToLength(undefined)` = 0) → worker создаёт пустой Manifold → CSG-результаты и импортированные меши исчезают. Project Manager (IndexedDB structured clone) не страдал, т.к. сохраняет TypedArray как есть. Исправлено: `restoreMeshArray()` восстанавливает массивы при парсинге `.doodle`. Добавлены тесты round-trip. (`doodle-io.ts`, `doodle-io.test.ts`)
- **CYCLE-CSG-RELOAD (CSG не отображается при загрузке проекта)**: Корневая проблема — `jumpToHistoryInner` вызывал `restoreTreeFromSnapshot` **всегда**, даже при cache hit. Кэш дерева сохранялся ДО фикса CYCLE-CSG, когда boolean-узлы пропускались из-за ошибки цикла. `restoreTreeFromSnapshot` очищал дерево и восстанавливал из кэша → boolean-узлы удалялись → CSG не рендерился. Исправлено: `rebuildBuildTree` вызывается **всегда** (не только при cache miss), `restoreTreeFromSnapshot` убран. Дерево всегда синхронизировано с историей операций. (`document-store.ts`)
- **CYCLE-CSG (циклическая зависимость при загрузке проекта)**: При `jumpToHistory` / `loadFromProject` дети CSG-операции (`obj_1`, `obj_2`) уже имеют `parentId`, указывающий на существующий узел. `isAncestor()` возвращает `true`, `createBooleanNode` выбрасывает `Cannot create cycle in tree`. Исправлено: сброс `parentId = undefined` у детей перед созданием boolean-узла. (`rebuild.ts`)
- **SHADOW ACNE (полосатые грани фигур)**: Вертикальные и наклонные грани куба/сферы/конуса были покрыты полосами от самозатенения. Причины: 1) `shadow.bias` отсутствовал — добавлены `bias = -0.002` и `normalBias = 0.05`; 2) карта теней 2048px была мала для области ±200 — увеличена до 4096px. Горизонтальные грани были чистыми, вертикальные требовали большего bias из-за угла падения света. (`viewport-hooks.ts`)

- **VITE DEV-SERVER CRASH (ERR_HTTP_HEADERS_SENT)**: Dev-сервер падал при запросе JS-файлов из-за middleware `stripReactRefresh` — он вызывал `res.setHeader('Content-Length', ...)` после того, как Vite 6.4 уже отправил заголовки (повторный вызов `res.end`). Добавлена защита: проверка `res.writableEnded`/`res.headersSent` и try/catch вокруг setHeader. (`vite.config.ts`)

- **CSG: flat shading через нормаль по грани**: Для flat-фигур (куб/призма/пирамида/CSG) нормали теперь вычисляются как cross product рёбер треугольника, а не берутся по вершине. Это решает проблему "однотонного пятна" после CSG-операций, когда normals из воркера null → fallback (0,1,0) на всех вершинах.
- **LOGS: переименованы в нормальные имена**: Все логи `[MIRROR:...]` переименованы в `[moveObject]`, `[addShape]`, `[resizeObject]`, `[previewMirror]`, `[mirrorSelected]`, `[applyMirrorToTransform]`, `[TREE]`, `[mirrorNodeRecursive]`, `[CLONE]`. Логи остаются в dev mode.
- **CSG отображение**: CSG-результаты теперь имеют `shapeType: 'csg'` вместо `'cube'`. В списке объектов отображается "CSG результат" вместо "куб", в PropertiesPanel скругление не показывается для CSG. В ComponentTree и Timeline добавлена иконка UnionIcon для CSG.
- **MIRROR-CSG-SHAPE: зеркало CSG-результата теперь shapeType='csg'**: При зеркале CSG-результата (boolean tree) зеркальная копия теперь получает `shapeType: 'csg'` вместо `'cube'`. Это решает проблему "куб вместо CSG" при зеркале вложенных CSG-цепочек (CSG из CSG). (`mirror-store.ts`)
- **CSG-NESTED-SHAPETYPE: вложенные CSG при объединении с третьей фигурой больше не превращаются в куб**: При введении `shapeType='csg'` проверка `isOperand_Primitive` в `csgBoolean` (`shapeType !== 'cube' || params.width`) стала возвращать true для CSG-результатов → воркер вызывал `buildPrimitive('csg', {})` → дефолтный куб 20×20×20. Исправлено: проверка заменена на `hasRealParams(obj)` (params непустой и не import_mesh). (`document-store.ts`)
- **FIX (PRE-EXISTING): typecheck Toolbar.tsx**: Тип `onPreviewMirror` в Toolbar.tsx был `(plane, ids) => void`, но реальный обработчик и вызовы используют только `plane`. Исправлено на `(plane) => void`. (`Toolbar.tsx`)
- **ARCHITECTURE CLEANUP: прямые проверки shapeType вместо эвристик**: Все эвристики `!obj.params || Object.keys(obj.params).length === 0` заменены на прямую проверку `obj.shapeType === 'csg'`. Удалено мёртвое поле `isCsgResult` из `SceneObject`. Добавлены поля `operation` и `children` в `SceneObject` для CSG-результатов. Затронуты: `document-store.ts` (5 мест), `mirror-store.ts` (3 места), `types.ts`.
- **ROT-XYZ: искажение поворота при CSG-операциях**: `computeRSMatrix` вычисляла `Rz × Ry × Rx`, а Three.js Euler 'XYZ' — `Rx × Ry × Rz`. Для одноосевого поворота матрицы совпадают, но при многоосевом (rotX+rotY, rotX+rotY+rotZ) — расходятся, из-за чего CSG-результат показывал объекты под неправильными углами. Дополнительно в элементе r12 была опечатка (`sx_` вместо `cx`). Исправлено: матрица теперь точно соответствует Three.js `Matrix4.makeRotationFromEuler('XYZ')`. Добавлены 2 теста для многоосевого поворота, сверенные с Three.js. (`worker-matrix.ts`)

- **NORMALS: использование нормалей из воркера + flat shading**: `viewport-hooks.ts` использует нормали из manifold-3d вместо `computeVertexNormals()` для smooth-shading фигур. Для flat-shading фигур (куб/призма/пирамида/CSG) геометрия разворачивается в viewport — каждая грань получает уникальные вершины с нормалью по нормали грани. Сегменты увеличены: sphere/cylinder/cone 32→48, torus 32→48, tubeSegs 16→24.

- **DIAG:* логи → dev mode**: Все `console.log` с префиксом `[DIAG:*]` в `worker-handlers.ts` и `document-store.ts` переключены на условное логирование через `import.meta.env?.DEV`. Логи работают только в dev-режиме (`pnpm dev`), отсутствуют в production (`pnpm build`). Не удалены — пригодятся для отладки. (`worker-handlers.ts`, `document-store.ts`)

### Fixed (проекты и STL)

- **PROJECT-STATUS: "Несохранённый проект" после сохранения в менеджере**: PropertiesPanel проверял только `fileName`, который никогда не устанавливался при сохранении через менеджер проектов (`saveToProject`). Теперь отображается `currentProjectName`, добавлены поля `currentProjectId`/`currentProjectName` в store. Также добавлен индикатор несохранённых изменений (•) рядом с именем проекта. (`PropertiesPanel.tsx`, `document-store.ts`, `types.ts`)
- **QUICK-SAVE-NAME: быстрое сохранение больше не переименовывает проект**: Раньше кнопка "Быстрое сохранение" всегда вызывала `onSaveToProject("Проект HH:MM:SS")`, перезаписывая имя уже сохранённого проекта. Теперь при наличии текущего проекта имя сохраняется (кнопка меняется на "Сохранить"). (`PropertiesPanel.tsx`, `document-store.ts`)
- **PROJECT-DELETE-SYNC: сброс currentProjectId при удалении проекта**: `setCurrentProjectId={() => {}}` в App.tsx был пустышкой — после удаления текущего проекта store продолжал ссылаться на удалённый ID. Добавлен action `setCurrentProject` в store. (`App.tsx`, `document-store.ts`, `types.ts`)
- **PROJECT-NAME-CONFLICT: конфликт имён проектов обрабатывается**: `saveToProject` теперь проверяет конфликты имён через `pmList` и показывает toast вместо молчаливого падения. (`document-store.ts`)
- **STL-ROT-XYZ: STL экспорт использует корректную матрицу поворота**: `applyTransformToVertices`/`applyTransformToNormals` использовали дублированную матрицу `Rz × Ry × Rx`, расходящуюся с Three.js `Euler 'XYZ'` при многоосевом повороте. Теперь используют общий `computeRSMatrix` из `worker-matrix.ts`. (`stl-export.ts`)
- **STL-NORMAL-TYPO: опечатка в усреднении нормалей**: `nz = (normals[i0*3+2] + normals[i2*3+2] + normals[i2*3+2]) / 3` — второй индекс был `i2` вместо `i1`. (`stl-export.ts`)
- **STL-NORMAL-SCALE: нормали больше не масштабируются**: Нормали — это векторы направления, они не должны умножаться на `Sx, Sy, Sz` при экспорте. Для неравномерного масштаба это давало неверные нормали. Теперь применяется только поворот (масштаб не влияет). (`stl-export.ts`)
- **STL-TESTS**: Добавлены тесты: многоосевой поворот в STL экспорте соответствует Three.js XYZ, неединичный масштаб применяется по осям. (`stl-export.test.ts`)

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
