# Ветки, PR, CI, релиз

## Модель веток

- `main` — production, Open Source CAD. Push в `main` (merge PR) сразу запускает деплой GitHub Pages.
- Ветка задачи — от актуального `main`, имя короткое: `svg-extrude`, `fix-child-view-final`, `thread-in-csg`.
- `yandex-games` — отдельная версия (SDK Яндекса, экономика). Не трогать, не мержить в неё.

## Версия и CHANGELOG

Перед PR (значимый merge — фича/фикс) — patch-релиз:

1. `web-app/package.json` → `"version": "x.y.z"`.
2. `web-app/src/constants.ts` → `APP_VERSION = 'x.y.z'`.
3. `CHANGELOG.md` → `## [x.y.z] — YYYY-MM-DD` с `Added` / `Changed` / `Removed` / `Fixed`.
4. При необходимости — `AGENTS.md` (счётчики, ключевые файлы), `README.md`.

Проверка соответствия:

```bash
node -e "console.log(require('./web-app/package.json').version)"
grep -n APP_VERSION web-app/src/constants.ts
grep -n "x.y.z" CHANGELOG.md
```

## Коммиты

- Сообщение: `feat: ...`, `fix: ...`, `docs: ...` (кратко, по-русски или по-английски — как в истории).
- Один логичный коммит на задачу или несколько по шагам; не коммить `dist/`, логи, временные файлы.
- Не коммить без запроса, если задача явно просит «только собрать/проверить».

```bash
git add -A
git status --short          # проверить, что попадает
git commit -m "fix: <кратко>"
```

## PR и CI

```bash
git push -u origin <ветка>
gh pr create --base main --head <ветка> \
  --title "<feat|fix>: <кратко>" \
  --body "<что, зачем, проверки>"
gh pr checks <PR>              # снапшот
gh pr checks <PR> --watch      # ждать завершения (может уйти в фон)
```

CI: `.github/workflows/ci-web.yml`, jobs `ci` и 4 группы `e2e`. Зелёный CI — обязательное условие merge.
Если CI красный — правь в ветке и пуш снова; не мержи красный PR и не отключай тесты.

## Merge, deploy, тег

Проект использует merge-коммит (не squash), ветка удаляется:

```bash
gh pr merge <PR> --merge --delete-branch
git checkout main
git pull --ff-only origin main
gh run list --limit 3         # дождаться Deploy to GitHub Pages: success
git tag -a vX.Y.Z -m "vX.Y.Z — <кратко>"
git push origin vX.Y.Z
```

Проверка после merge:

```bash
git log --oneline -3
git describe --tags
git status --short
```

## Типичные проблемы

| Проблема | Решение |
|---|---|
| `gh pr checks` долго `pending` | e2e в CI идёт ~10–15 мин; дождись или проверь `gh run list` |
| CI упал на e2e, локально зелёный | CI без GPU (`E2E_SOFT_PERF=1`), другие тайминги; смотри лог job-а |
| Deploy не стартовал | push в `main` был не merge-коммитом? Проверь `deploy.yml` и Actions |
| Тег уже существует | Не перезаписывай; подними версию или удали только по согласованию |
| Случайно закоммичен артефакт | Убери из индекса, добавь в `.gitignore`, не переписывай историю `main` |
