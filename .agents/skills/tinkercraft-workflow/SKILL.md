---
name: tinkercraft-workflow
description: Полный цикл задачи TinkerCraft Web — ветка от main, реализация, typecheck/тесты/e2e-регресс, документация и версия, PR → CI → merge → deploy → тег и стандартный отчёт.
type: prompt
whenToUse: Когда нужно реализовать фичу или исправить баг в TinkerCraft, прогнать проверки или e2e-регресс, оформить стандартный отчёт, сделать скриншоты/видео-демо либо выполнить работу с репозиторием (ветка, PR, CI, merge, deploy, тег).
---

# TinkerCraft: рабочий цикл задачи

Текущая задача: $ARGUMENTS

Если задача не передана — сначала уточни её у пользователя, не начинай менять код.

`AGENTS.md` в корне — главный источник контекста проекта. Прочитай его перед работой.
При расхождении этого skill и `AGENTS.md`/задания пользователя приоритет у `AGENTS.md` и задания.
Если в задании дан свой шаблон отчёта — используй его дословно, а не шаблон ниже.

## Жёсткие правила

- `main` — production: только через PR после зелёного CI. Прямых коммитов в `main` нет.
- Не трогать ветку `yandex-games` (v1.4.0, модерация) и её файлы.
- Не ломать существующие тесты и e2e. Регресс важнее новой функциональности.
- Не «чинить» чужие падения и не удалять тесты, чтобы получить зелёный прогон. Не прошло — стоп и отчёт.
- Любое изменение кода документируется: `CHANGELOG.md` обязателен; `AGENTS.md`, `DEVELOPMENT_PLAN.md`, `CODE_REVIEW.md`, `ARCHITECTURE_*.md` — если затронуты.
- Строки интерфейса — только через i18n (`ru` и `en`), иначе падает `i18n-coverage.test.ts`.
- Версия — patch-бамп в `web-app/package.json` и `web-app/src/constants.ts` (`APP_VERSION`) + запись в `CHANGELOG.md`.
- Временные файлы (логи, скриншоты проверок, `dist/`) не коммитить; артефакты демо — только по запросу.

## Шаг 0. Базовая линия

```bash
cd /path/to/tinkercraft
git checkout main
git pull --ff-only origin main
git log --oneline -1
node -e "console.log(require('./web-app/package.json').version)"
git status --short          # должно быть чисто
cd web-app
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

Ожидаемо: `typecheck` — 0 ошибок, тесты — все зелёные. На момент v1.3.34 это **1144 теста / 107 файлов**, e2e-скриптов **47**; числа меняются — ориентируйся на фактический вывод, а не на эти цифры.

Если базовая линия красная — **СТОП**, зафиксируй ошибку и отчёт, не начинай задачу.

## Шаг 1. Ветка

```bash
git checkout -b <короткое-имя-задачи>   # feat-..., fix-..., например csg-child-view
```

Ветка — от актуального `main`. Одна задача — одна ветка.

## Шаг 2. Реализация

1. Найди затронутые файлы по `AGENTS.md` (таблица «Ключевые файлы») и `ARCHITECTURE_*.md`.
2. Следуй существующим паттернам: Zustand-сторы, `relativeToParent` как источник истины, вершины в origin, `notify` вместо `alert`, `ConfirmModal` вместо `confirm`.
3. Новые фигуры/поля: тип в `ShapeType`, `buildPrimitive`, `getParamFields`, `defaultShapeParams`, палитра `ALL_SHAPES_DATA`, обе карты иконок, `shapes.*`/`shapesAcc.*` в `ru`/`en`.
4. Новые действия с объектами проверяют `obj.locked`; новые шаги истории читают `projectHistory(operations)`, а не сырые `operations`.
5. Тесты — рядом с кодом (`*.test.ts`) или в `src/__tests__/`; e2e — `web-app/e2e/<name>.mjs` + скрипт `e2e:<name>` в `web-app/package.json`.
6. Известный баг, который пока не исправляется: `it.fails(...)` + `it(...)` «реальность» (не `skip`), в e2e — `knownBug(...)`.

## Шаг 3. Проверки

```bash
cd web-app
pnpm typecheck
pnpm vitest run <затронутые.test.ts>   # быстрый целевой прогон
pnpm test                              # полный прогон
pnpm build
```

E2E (нужен запущенный dev-сервер):

```bash
pnpm dev --host 127.0.0.1 --port 5000   # в отдельном терминале/фоне
pnpm e2e:<новый-или-затронутый>
pnpm e2e:smoke
# затем регресс из references/checks.md
```

Правила e2e:

- **Не редактируй файлы, пока идёт e2e** — Vite/HMR перезагрузит страницу и прогон упадёт.
- Запускай через `e2e/helpers.mjs`: `openApp`, `placeShape`, `panelButton`, `toolbarButton`, `setTheme`, `assertPerf`.
- Кнопки ищи по `aria-label`/роли, а не по индексу; фигуры ставь `placeShape`; пороги FPS/времени — только `assertPerf`.
- Для проверки WebGL дождись `.viewport-canvas`; при fallback «WebGL недоступен» перезапусти контекст (см. `references/checks.md`).
- После прогона останови dev-сервер и удали временные логи/скриншоты.

## Шаг 4. Документация и версия

1. `CHANGELOG.md`: секция `## [x.y.z] — YYYY-MM-DD` (или `[Unreleased]` до релиза), подразделы `Added` / `Changed` / `Removed` / `Fixed`.
2. `AGENTS.md`: ключевые файлы, конвенции, счётчики тестов/e2e — если изменились.
3. `DEVELOPMENT_PLAN.md`: статус задачи/фазы и «Известные проблемы», если затронуты.
4. `CODE_REVIEW.md`: `✅ ИСПРАВЛЕНО` / `✅ НЕ БАГ` и таблица статусов, если исправлялась проблема ревью.
5. `ARCHITECTURE_TRANSFORMS.md` / `ARCHITECTURE_RENDER.md`: при изменении модели трансформов/отрисовки.
6. `README.md`: при изменении возможностей, стека или команд.
7. Версия: patch-бамп в `web-app/package.json` и `web-app/src/constants.ts` (`APP_VERSION`).

## Шаг 5. Отчёт

Пиши отчёт по шаблону из `references/report-template.md` (русский, строго по разделам).
В отчёте обязательны: контекст (ветка, HEAD, версия, `git status`), что сделано, тесты (фактические числа), регресс e2e, `typecheck`, коммит, PR/CI/merge/deploy/тег, UX-проверка, что не сделано.
Не выдавай непроверенное за проверенное: если e2e не запускался — так и напиши.

## Шаг 6. Репозиторий и релиз

```bash
git add -A
git commit -m "feat: <кратко>"          # или fix: ...
git push -u origin <ветка>
gh pr create --base main --head <ветка> --title "<...>" --body "<...>"
gh pr checks <PR> --watch              # ждать зелёный CI
gh pr merge <PR> --merge --delete-branch
git checkout main
git pull --ff-only origin main
# дождаться зелёного Deploy to GitHub Pages
git tag -a vX.Y.Z -m "vX.Y.Z — <кратко>"
git push origin vX.Y.Z
```

Подробности (merge-commit, деплой, тег, типичные ошибки) — `references/repo-release.md`.

## Финальный чек-лист

- [ ] Ветка от `main`, `main` не тронут напрямую
- [ ] `pnpm typecheck` — 0
- [ ] `pnpm test` — все зелёные (число не уменьшилось)
- [ ] `pnpm build` — успешно
- [ ] Новый/затронутый e2e — зелёный
- [ ] Регресс e2e — зелёный (или явно указано, что не запускался)
- [ ] CHANGELOG + версия + APP_VERSION
- [ ] AGENTS/DEVELOPMENT_PLAN/CODE_REVIEW/ARCHITECTURE — если затронуты
- [ ] `git status` чист (кроме намеренных артефактов демо)
- [ ] Коммит, PR, CI зелёный, merge, deploy, тег
- [ ] Отчёт по шаблону

## Справочники

- `references/checks.md` — команды, регресс-набор e2e, CI-группы, типичные сбои.
- `references/report-template.md` — шаблон отчёта.
- `references/repo-release.md` — git/PR/CI/merge/deploy/tag.
- `references/media-demos.md` — скриншоты и видео-демо (Playwright, ffmpeg).
- `scripts/verify.sh` — typecheck + test + build.
- `scripts/e2e-regression.sh` — dev-сервер + регресс-набор e2e.
