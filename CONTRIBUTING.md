# Contributing to TinkerCraft

Спасибо за интерес к проекту! Этот файл описывает процесс настройки окружения, правила кода и процесс Pull Request.

---

## Настройка окружения

### Требования

- **Node.js** 20+
- **pnpm** 9+ (`npm install -g pnpm`)
- **Git** с поддержкой субмодулей

### Установка

```bash
git clone --recursive https://github.com/Rage4er/tinkercraft.git
cd tinkercraft/web-app
pnpm install
```

### Проверка что всё работает

```bash
pnpm dev          # dev-сервер на http://localhost:5000
pnpm test         # 35 тестов должны пройти
pnpm typecheck    # 0 ошибок типов
pnpm build        # production-сборка без ошибок
```

---

## Структура проекта

```
web-app/src/
├── App.tsx              # Главный компонент (тулбар, панели, модалки)
├── csg/                 # CSG-движок: worker.ts, worker-client.ts, types.ts
├── store/               # Zustand: document-store.ts, notifications.ts
├── components/          # React-компоненты: Viewport3D, ViewCube, ComponentTree и др.
└── io/                  # Импорт/экспорт: STL, .doodle, autosave, project-manager
```

Подробности: [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Правила кода

### TypeScript

- **Strict mode** — без `any`. Единственное исключение — точка инициализации WASM (`as unknown as ManifoldAPI`).
- Интерфейсы (`interface`) — для внешних API (WASM, Three.js). Типы (`type`) — для доменных сущностей.
- Экспортируйте функции, которые нужно тестировать. Не тестируйте через приватные.

### React

- `useMemo` для производных значений (Set, reduce, фильтрации из store).
- `useRef` для стабилизации `useEffect` (см. паттерн `kbRef` в `App.tsx`).
- Zustand store функции стабильны — используйте в deps без пересоздания.

### Состояние

- Один Zustand store: `document-store.ts`.
- Actions, вызывающие воркер, возвращают `Promise`.
- История операций — массив `history[]` с фильтрацией.
- Undo/redo = полный rebuild через `rebuildFromHistory()`.

### CSS

- Тёмная/светлая темы через CSS-переменные в `App.css`.
- Инлайн-стили допустимы только для динамических значений (position, color из объекта).

### Toast вместо alert

Используйте `notify(message, type)` из `store/notifications.ts`. **Не используйте `alert()`.**

---

## Тестирование

### Перед каждым PR

```bash
pnpm test         # все 35 тестов проходят
pnpm typecheck    # 0 ошибок
```

### Правила тестов

- Имена: `describe('FunctionName')` → `it('описание')`
- Среда: jsdom (настроено в `vite.config.ts`)
- Unit-тесты: рядом с тестируемым файлом (`foo.ts` → `foo.test.ts`)
- Type-level тесты: в `src/csg/types.test.ts`

### Что покрывать тестами

| Приоритет | Что |
|---|---|
| Обязательно | Чистые функции (io, utils, вычисления) |
| Обязательно | Валидация (sanitizeParams, clamp) |
| Желательно | Store actions (через mock воркера) |
| Не нужно | Three.js рендеринг, WASM-операции |

---

## Процесс Pull Request

### 1. Создание ветки

```bash
git checkout -b feature/my-feature     # фича
git checkout -b fix/issue-123          # багфикс
git checkout -b refactor/app-split     # рефакторинг
```

### 2. Коммиты

Используйте [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: добавить тор как примитив
fix: исправить двойное центрирование CSG
refactor: вынести панель свойств в отдельный компонент
test: добавить тесты для stl-export
docs: обновить README
chore: обновить зависимости
```

### 3. Перед отправкой PR

- [ ] `pnpm typecheck` — 0 ошибок
- [ ] `pnpm test` — все тесты проходят
- [ ] `pnpm build` — сборка успешна
- [ ] Нет `console.log` в продакшен-коде
- [ ] Нет `any` (кроме WASM-инициализации)
- [ ] Нет `alert()` (используйте `notify()`)
- [ ] Новые функции покрыты тестами
- [ ] CHANGELOG.md обновлён (если нужно)

### 4. Описание PR

Заполните шаблон (см. `.github/PULL_REQUEST_TEMPLATE.md`).

---

## Сообщество

- **Issues:** [github.com/Rage4er/tinkercraft/issues](https://github.com/Rage4er/tinkercraft/issues) — баги и фичи
