# Проверки TinkerCraft

## Базовые команды

Все команды — из `web-app/`.

```bash
pnpm install --frozen-lockfile
pnpm typecheck                  # tsc --noEmit, ожидается 0
pnpm test                       # vitest, все файлы
pnpm vitest run src/...test.ts  # точечно
pnpm build                      # tsc && vite build (base /tinkercraft/)
pnpm dev --host 127.0.0.1 --port 5000
```

Версия Node — 24, pnpm — 12.10.1 (`packageManager` в `web-app/package.json`).
Счётчики на v1.3.34: **1144 теста / 107 файлов**, **47** e2e-скриптов. Всегда сверяйся с фактическим выводом.

## E2E

Запуск: dev-сервер уже работает, затем

```bash
pnpm e2e:<name>
```

`APP_URL` по умолчанию `http://localhost:5000/tinkercraft/`; для локального сервера удобнее
`APP_URL=http://127.0.0.1:5000/tinkercraft/`.

### Обязательный регресс (базовый набор)

```
smoke tree plug-and-play dimensions ux-viewport selection-outline
ux-polish ortho-raycast ux-formats-settings modeling-tools
view-modes clean-wireframe fix-curved-wireframe
child-view-copy csg-child-view fix-view-modes-child
```

Дополнительно по теме задачи:

- CSG/дерево/правка: `n-ary-csg csg-group-fix edit-child edit-step-move edit-step-mirror edit-step-extrude nested-moved-edit independent-copy`
- Выравнивание: `align-ui-revit align-obb align-plane-resolve`
- Импорт/форматы/текст: `import-mesh-csg ux-audit-3 ux-audit-4`
- Резьба/фигуры: `thread-generator thread-extend thread-parametric thread-polish thread-in-csg svg-extrude`
- UX-прогоны: `ux-audit ux-audit-2 … ux-audit-7`
- Производительность/сеть: `double-click-timing selection-outline ux-viewport`

### CI (`.github/workflows/ci-web.yml`)

Два job-а: `ci` (install + typecheck + test + build) и `e2e` — 4 группы матрицы.
В CI `E2E_SOFT_PERF=1`: пороги FPS/времени не падают, а печатают `[SOFT PERF]`.
Локально `assertPerf` — строгий. Не меняй пороги ради зелёного прогона.

### Правила и грабли

- **Не редактируй файлы во время e2e** — HMR перезагрузит страницу, и прогон упадёт (например, «пропал шеврон» или state).
- WebGL в headless: флаги `--use-angle=gl-egl --use-gl=angle --ignore-gpu-blocklist` (см. `e2e/helpers.mjs`). Если приложение показало «WebGL недоступен» (нет `.viewport-canvas`), перезапусти браузер/контекст: инициализация GPU иногда сбоит.
- Фигуры ставь через `placeShape(page, 'Куб')` (клик по иконке → Enter), а не по координатам канваса.
- Кнопки ищи по `aria-label` — `toolbarButton`, `panelButton`; не по индексу.
- Для CSG-режима: `panelButton(page, 'Объединение')`, ожидание уменьшения числа `.ct-item[data-object-id]`.
- Пороги производительности — только `assertPerf`, не `fail`.
- После e2e останови dev-сервер: `kill $(pgrep -f "vite.js --host")` (или свой PID) — не оставляй процесс.
- Созданные логи/скриншоты — во временную папку, не в репозиторий; проверь `git status`.

### Известные особенности

- Child-View рисуется на основном renderer в scissor-области; в e2e это `[data-testid=child-view-scene]` (drag по нему).
- Режим «Каркас»: гладкие фигуры — `curved-wireframe.ts`, не треугольная сетка.
- Скрытые линии: рёбра с `depthTest`; в реалистичном они остаются, но не просвечивают.
- Для сборки архива itch.io: `pnpm build --base=./` (вариант `pnpm build -- --base=./` НЕ применяет base).

## Документация (обязательно)

- `CHANGELOG.md` — всегда; секция версии/`[Unreleased]`, `Added`/`Changed`/`Removed`/`Fixed`.
- `AGENTS.md` — ключевые файлы, конвенции, актуальные счётчики тестов/e2e.
- `DEVELOPMENT_PLAN.md` — статусы задач/фаз, известные проблемы.
- `CODE_REVIEW.md` — если исправлена проблема ревью.
- `ARCHITECTURE_TRANSFORMS.md` — при изменении `TreeNode`/`SceneObject`/трансформов.
- `ARCHITECTURE_RENDER.md` — при изменении единого источника данных/отрисовки.
- `README.md` — при изменении возможностей, стека, команд.

## Тесты

- Имена: `describe('FunctionName')` → `it('описание')`.
- Известный баг: `it.fails('...')` + `it('... реальность ...')`; после фикса — `it`, «реальность» удалить.
- jsdom + мок IndexedDB: `src/__mocks__/indexeddb.ts`.
- i18n: любой литерал с кириллицей в JSX/строках вне `console`/`devLog` ломает `i18n-coverage.test.ts`; ключи должны быть в `ru` и `en`.

## Типичные сбои

| Симптом | Причина / что делать |
|---|---|
| e2e падает на середине, state «съехал» | Правились файлы во время прогона (HMR) — перезапусти e2e без правок |
| Нет `.viewport-canvas`, «WebGL недоступен» | GPU-контекст не поднялся — новый браузер/контекст, подождать 1–2 с |
| `pnpm build -- --base=./` оставил `/tinkercraft/` | Используй `pnpm build --base=./` |
| Тестов стало меньше | Не удаляй тесты; найди причину или оставь `it.fails` |
| `obj.color.replace is not a function` | В `setColor` передан не цвет (например, трансформ) — проверь аргументы |
| e2e «залипает» после drag | OrbitControls захватывает канвас; не вешай pointer capture на контейнер |
