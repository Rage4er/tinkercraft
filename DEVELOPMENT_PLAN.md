# TinkerCraft Web — План разработки

> Референс архитектуры и UX: CaDoodle (Java/JavaFX). Реализация с нуля на браузере: **React + TypeScript + Three.js + manifold-3d WASM**.

---

## Краткая сводка

| Метрика | Значение |
|---|---|
| Референс (CaDoodle) | ~17 600 строк Java (оригинал для вдохновения) |
| Зависимость BowlerStudio | ~100 000+ строк Java (оригинал) |
| Текущий объём TS/TSX кода | ~6 700 строк (18 файлов) |
| Прогресс | **Фазы 0–6 завершены, Фаза 7 — код-ревью раунды 1–16** ✅ |
| Статус | MVP готов, Фаза 7 — исправления и улучшения |

---

## Чеклист фаз

---

### ✅ Фаза 0 — Подготовка и прототип

- [x] Vite + React + TypeScript шаблон в `web-app/`
- [x] pnpm workspace, порт 5000
- [x] Three.js r170 зависимость
- [x] manifold-3d 3.0.1 WASM зависимость
- [x] Zustand 5 для управления состоянием
- [x] COOP/COEP заголовки для SharedArrayBuffer (WASM worker)

---

### ✅ Фаза 1 — Базовый 3D вьюпорт

- [x] Компонент `Viewport3D.tsx` (Three.js рендерер, OrbitControls, освещение, сетка)
- [x] Компонент `App.tsx` (главный layout, клавиатурные сокращения)
- [x] Компонент `Toolbar.tsx` (панель инструментов)
- [x] Компонент `StatusBar.tsx` (строка состояния)
- [x] Навигационный куб `ViewCube.tsx`
- [x] Адаптивный layout (левая панель, вьюпорт, правая панель)

---

### ✅ Фаза 2 — Примитивные фигуры (CSG Worker)

- [x] Web Worker (`csg/worker.ts`) с типобезопасным интерфейсом
- [x] Примитивы: куб, цилиндр, конус, тор, призма, пирамида
- [x] Скругление (fillet) для куба
- [x] Импорт STL (бинарный + ASCII)
- [x] 3D текст (TextGeometry + opentype.js)
- [x] Палитра фигур (`LeftPanel.tsx`)

---

### ✅ Фаза 3 — Управление сценой и выделение

- [x] Выделение объектов (клик, drag-select, Ctrl+клик)
- [x] Гизмо перемещения/вращения/масштаба
- [x] Панель свойств (`PropertiesPanel.tsx`): трансформ, resize, цвет
- [x] Undo/Redo (Zustand history + snapshot cache)
- [x] Копировать/вставить (clipboard)
- [x] Удаление (Del, контекстное меню)
- [x] Переименование (двойной клик в дереве)

---

### ✅ Фаза 4 — Булевы операции CSG

- [x] Union / Subtract / Intersect через manifold-3d
- [x] Цепочка CSG операций (результат → новая операция)
- [x] Группировка (Group → CSG результат)
- [x] Разгруппировка (Ungroup)
- [x] Кнопки CSG в тулбаре и панели свойств

---

### ✅ Фаза 5 — Продвинутые операции

- [x] Зеркалирование (Mirror: XY/XZ/YZ плоскости)
- [x] Выравнивание (Align: 9 позиций)
- [x] Инструмент скругления (Fillet)
- [x] Инструмент экструзии (Extrude)
- [x] Экспорт STL (бинарный, все видимые объекты объединены)
- [x] Сохранение/загрузка `.doodle` (сериализация JSON через JSZip)
- [x] Автосохранение в IndexedDB (восстановление сессии при перезагрузке)

---

### ✅ Фаза 6 — Полировка UI и финальные штрихи

- [x] Дерево компонентов (переименование по двойному клику, переключение видимости, удаление)
- [x] Вкладки списка объектов: плоский список ↔ Дерево компонентов
- [x] Модальное окно менеджера проектов (IndexedDB: создание/открытие/удаление)
- [x] Линейка (измерение расстояния по двум кликам, Three.js линия, автоочистка через 4 с)
- [x] Горячие клавиши: Ctrl+Z/Y, Del, F, H, G, R, S, Ctrl+A, Ctrl+C/V/S/O, Esc
- [x] Переключение тёмной / светлой темы
- [x] PWA манифест manifest.json + meta-тег theme-color
- [x] Строка состояния: статус CSG, количество объектов, количество треугольников, история, FPS, режим линейки, статус проекта

---

### 🔄 Фаза 7 — Исправления и улучшения (в процессе)

#### Активные проблемы

Полный список активных проблем с деталями: [`CODE_REVIEW.md`](CODE_REVIEW.md)

| # | Проблема | Severity | Статус |
|---|----------|----------|--------|
| MIRROR-3 | Baked nodes: rotation не инвертируется при mirror | HIGH | 🔲 |
| MIRROR-5 | Boolean → baked: потеря параметричности при mirror | HIGH | 🔲 |
| MIRROR-8 | Scale не инвертируется при mirror | HIGH | 🔲 |
| MIRROR-1 | Плоскость mirror через origin вместо BBox | MEDIUM | 🔲 |
| MIRROR-6 | Fallback-ноды не удаляются после mirror | MEDIUM | 🔲 |
| MIRROR-7 | Трансформ boolean ноды из первого child | MEDIUM | 🔲 |
| MIRROR-10 | Нет проверки успешности sync перед mirror | MEDIUM | 🔲 |
| CRIT-R16-3 | `any` в `collectSubtreeForWorker` / `applyCSGMeshes` | WARN | 🔲 |
| TEST-R16-3 | Нет тестов для `snap-utils.ts` (468 строк) | WARN | 🔲 |
| CODE-R16-1 | Дублирование матричной математики | COSM | 🔲 |
| CODE-R16-2 | Магические числа в Viewport3D | COSM | 🔲 |
| CODE-R16-3 | Смешение русского и английского в комментариях | COSM | 🔲 |
| PERF-R16-4 | `computeVertsHash` — возможны коллизии | PERF | 🔲 |
| MIRROR-2 | Отсутствие предпросмотра mirror | MEDIUM | 🔲 |
| MIRROR-4 | 3D хендлы для выбора плоскости | LOW | 🔲 |
| MIRROR-9 | Двойная синхронизация import_mesh | LOW | 🔲 |

#### Планируемые функции

| Задача | Приоритет | Сложность | Статус |
|--------|-----------|-----------|--------|
| Импорт SVG (2D → 3D экструзия) | Средний | Средняя | 🔲 |
| Импорт 3MF | Средний | Средняя | 🔲 |
| Экспорт STEP / IGES (OpenCascade.js) | Низкий | Высокая | 🔲 |
| Размеры / аннотации поверх 3D | Средний | Средняя | 🔲 |
| Физическая симуляция (Rapier WASM) | Низкий | Высокая | 🔲 |
| Коллаборативное редактирование (CRDT / WebSocket) | Низкий | Очень высокая | 🔲 |
| Robot Lab (конструктор роботов) | Отложено | Высокая | 🔲 |

---

## Архитектурные заметки

| Уровень | Технология |
|---|---|
| UI / Состояние | React 18 + Zustand 5 |
| 3D Рендеринг | Three.js r170 |
| CSG | manifold-3d 3.0.1+ (WASM, выделенный Worker, типобезопасный интерфейс) |
| Персистентность | IndexedDB (автосохранение + несколько проектов), JSZip (.doodle) |
| PWA | Vite + manifest.json + COOP/COEP заголовки |

---

## Структура файлов

```
web-app/
├── src/
│   ├── App.tsx              # Главный компонент (layout, shortcuts)
│   ├── App.css              # Глобальные стили, темы
│   ├── constants.ts         # Константы (ALL_SHAPES, SNAP_VALUES, и т.д.)
│   ├── main.tsx             # Точка входа
│   ├── components/
│   │   ├── Viewport3D.tsx   # Three.js вьюпорт (936 строк)
│   │   ├── Toolbar.tsx      # Панель инструментов
│   │   ├── LeftPanel.tsx    # Палитра фигур + список объектов
│   │   ├── PropertiesPanel.tsx # Панель свойств
│   │   ├── ViewCube.tsx     # Навигационный куб
│   │   ├── StatusBar.tsx    # Строка состояния
│   │   ├── TextModal.tsx    # Модалка 3D текста
│   │   ├── Timeline.tsx     # История операций
│   │   ├── ComponentTree.tsx # Дерево компонентов
│   │   ├── NumInput.tsx     # Numeric input
│   │   ├── Section.tsx      # Collapsible section
│   │   ├── MirrorButtons.tsx # Кнопки зеркала
│   │   ├── CsgButtons.tsx   # Кнопки CSG
│   │   ├── AlignButtons.tsx # Кнопки выравнивания
│   │   ├── snap-utils.ts    # Привязка к геометрии (468 строк)
│   │   ├── ErrorBoundary.tsx
│   │   ├── WebGLFallback.tsx
│   │   ├── ToastContainer.tsx
│   │   └── ProjectManagerModal.tsx
│   ├── store/
│   │   ├── document-store.ts # Zustand store (1014 строк)
│   │   ├── ui-store.ts      # UI state (тема, камера, модалки)
│   │   ├── helpers.ts       # AABB, центрирование, makeObject
│   │   ├── types.ts         # DocumentStore interface
│   │   ├── rebuild.ts       # rebuildFromHistory + buildRebuildMeta
│   │   ├── snapshots.ts     # Snapshot cache
│   │   └── notifications.ts # Toast-уведомления
│   ├── csg/
│   │   ├── worker.ts        # Web Worker dispatcher
│   │   ├── worker-handlers.ts # Обработчики (1259 строк)
│   │   ├── worker-client.ts # Promise-обёртка над Worker
│   │   ├── worker-matrix.ts # Матричная математика
│   │   ├── history-tree.ts  # Build Tree (842 строки)
│   │   ├── rebuildOps.ts    # Общая логика трансформаций
│   │   ├── types.ts         # Все типы
│   │   ├── BUILD_TREE_SPEC.md
│   │   ├── types.test.ts
│   │   ├── history-tree.test.ts
│   │   ├── worker-matrix.test.ts
│   │   ├── worker-sanitize.test.ts
│   │   ├── worker-sync.test.ts
│   │   └── rebuildOps.test.ts
│   └── io/
│       ├── stl-import.ts    # Импорт STL
│       ├── stl-export.ts    # Экспорт STL
│       ├── doodle-io.ts     # Формат .doodle
│       ├── autosave.ts      # Автосохранение
│       ├── project-manager.ts # Менеджер проектов
│       ├── stl-import.test.ts
│       ├── stl-export.test.ts
│       ├── project-manager.test.ts
│       └── document-store.test.ts
```

---

## Бенчмарки производительности

| Сценарий | До оптимизации | После | Ускорение |
|---|---|---|---|
| Undo/Redo (50 операций) | ~500ms (WASM rebuild) | ~5ms (snapshot cache) | **100x** |
| Рендер списка объектов (100) | ~15ms (reduce каждый кадр) | ~2ms (useMemo) | **7.5x** |
| CSG Boolean (два куба) | ~50ms | ~50ms (без изменений) | — |
| Импорт STL (100K треугольников) | ~200ms | ~200ms (без изменений) | — |

---

## Известные проблемы и технический долг

| Проблема | Статус | План |
|---|---|---|
| Скругление работает только для кубов | ⚠️ Ограничение | Расширить на цилиндры/сферы в Фазе 7 |
| Нет импорта SVG | 🔲 | Фаза 7 |
| Нет импорта 3MF | 🔲 | Фаза 7 |
| Нет Robot Lab | 🔲 | Фаза 7 (опционально) |

Активные проблемы код-ревью (MIRROR-1..10, Раунд 16) — см. [`CODE_REVIEW.md`](CODE_REVIEW.md).

---

## Быстрый старт

```bash
# Клонировать репозиторий
git clone https://github.com/Rage4er/tinkercraft.git
cd tinkercraft/web-app

# Установить зависимости
pnpm install

# Запустить dev-сервер (порт 5000)
pnpm dev

# Собрать production-версию
pnpm build

# Запустить тесты (104 теста)
pnpm test

# Проверка типов
pnpm typecheck
```

---
