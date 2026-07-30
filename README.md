# TinkerCraft Web

TinkerCraft — браузерный 3D CAD-редактор. Параметрический 3D-редактор для образования и хобби, работающий прямо в браузере.

> Вдохновлён [CaDoodle](https://cadoodlecad.com) — оригинальное Java-приложение использовано как референс архитектуры и UX.
> Стек: **React + TypeScript + Three.js + manifold-3d (WASM)**.

---

## Возможности

- **7 примитивов** — куб, сфера, цилиндр, конус, тор, призма, пирамида
- **3D-текст** — генерация через TextGeometry с настройкой размера и глубины
- **Булевы операции CSG** — Union, Subtract, Intersect (manifold-3d в Web Worker)
- **Инструменты** — перемещение, вращение, масштаб (гизмо), зеркало, выравнивание, скругление (fillet), экструзия
- **История операций** — полный undo/redo с таймлайном и фильтрацией
- **Импорт/экспорт** — STL (бинарный), `.doodle` (ZIP + JSON)
- **Автосохранение** — IndexedDB, восстановление сессии при перезагрузке
- **Менеджер проектов** — несколько проектов в IndexedDB
- **Линейка** — измерение расстояний в 3D
- **ViewCube** — навигационный куб с drag-вращением
- **Темы** — тёмная/светлая
- **PWA** — манифест, COOP/COEP для SharedArrayBuffer

---

## Технологии

| Уровень | Технология |
|---|---|
| UI / Состояние | React 18 + Zustand 5 |
| 3D Рендеринг | Three.js r170 |
| CSG | manifold-3d (WASM, выделенный Web Worker) |
| Персистентность | IndexedDB + JSZip (.doodle) |
| Сборка | Vite 6 + pnpm |
| Тестирование | Vitest (104 теста) |
| Язык | TypeScript 5.7 (strict) |

---

## Быстрый старт

```bash
git clone https://github.com/Rage4er/tinkercraft.git
cd tinkercraft/web-app

pnpm install
pnpm dev          # dev-сервер на http://localhost:5000
```

```bash
pnpm build        # production-сборка в dist/
pnpm test         # запуск тестов (104 теста)
pnpm typecheck    # проверка типов TypeScript
```

---

## Текущий статус

| Фаза | Описание | Статус |
|---|---|---|
| 0 | Подготовка и прототип | ✅ Завершена |
| 1 | Базовый 3D вьюпорт | ✅ Завершена |
| 2 | Примитивные фигуры (CSG Worker) | ✅ Завершена |
| 3 | Управление сценой и выделение | ✅ Завершена |
| 4 | Булевы операции CSG | ✅ Завершена |
| 5 | Продвинутые операции | ✅ Завершена |
| 6 | Полировка UI и финальные штрихи | ✅ Завершена |
| 7 | Исправления и улучшения | 🔄 В процессе |

Подробности: [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) · Активные проблемы: [CODE_REVIEW.md](./CODE_REVIEW.md) · Архив ревью: [CODE_REVIEW_ARCHIVE.md](./CODE_REVIEW_ARCHIVE.md)

---

## Структура репозитория

```
tinkercraft/
├── web-app/               # Веб-приложение (Vite + React)
│   └── src/
│       ├── App.tsx        # Главный компонент
│       ├── csg/           # manifold-3d worker + типы
│       ├── store/         # Zustand store + notifications
│       ├── components/    # Viewport3D, ViewCube, ComponentTree и др.
│       └── io/            # STL/Doodle импорт-экспорт, autosave, проекты
├── reference/             # Оригинальный Java-проект CaDoodle (вдохновение)
├── CODE_REVIEW.md         # Активные проблемы код-ревью
├── CODE_REVIEW_ARCHIVE.md # Архив завершённых код-ревью
├── DEVELOPMENT_PLAN.md    # План разработки (Фазы 0–7)
├── CHANGELOG.md           # История изменений
├── CONTRIBUTING.md        # Правила контрибуции
├── ARCHITECTURE.md        # Описание архитектуры
└── SECURITY.md            # Политика безопасности
```

---

## Вдохновение

Проект CaDoodle (cadoodlecad.com) был использован как референс архитектуры и UX.
Его исходники лежат в папке `reference/`.

## Лицензия

См. [LICENSE](./LICENSE).

