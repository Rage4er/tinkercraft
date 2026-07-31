# TinkerCraft Web — План разработки

**Дата:** 2025-07-15
**Версия:** 0.0.1

---

## Краткая сводка

| Фаза | Статус |
|------|--------|
| Фаза 0 — Подготовка и прототип | ✅ Завершена |
| Фаза 1 — Базовый 3D вьюпорт | ✅ Завершена |
| Фаза 2 — Примитивные фигуры (CSG Worker) | ✅ Завершена |
| Фаза 3 — Управление сценой и выделение | ✅ Завершена |
| Фаза 4 — Булевы операции CSG | ✅ Завершена |
| Фаза 5 — Продвинутые операции | ✅ Завершена |
| Фаза 6 — Полировка UI и финальные штрихи | ✅ Завершена |
| Фаза 7 — Исправления и улучшения | 🔄 В процессе |

---

## Чеклист фаз

### ✅ Фаза 0 — Подготовка и прототип

- [x] Инициализация Vite + React + TypeScript
- [x] Настройка Three.js (WebGL2 рендерер, OrbitControls, сцена)
- [x] Интеграция manifold-3d (WASM сборка, Web Worker)
- [x] Базовая архитектура: Zustand store + worker-client
- [x] Конфигурация Vite: COOP/COEP заголовки для SharedArrayBuffer
- [x] PWA manifest.json + иконки

---

### ✅ Фаза 1 — Базовый 3D вьюпорт

- [x] Рендеринг сцены (PerspectiveCamera, WebGLRenderer, OrbitControls)
- [x] Поддержка ортографической камеры (переключение)
- [x] ViewCube (навигационный куб)
- [x] Адаптивный ресайз (ResizeObserver)
- [x] WebGL fallback (проверка WebGL2 при монтировании)
- [x] Индикатор загрузки WASM

---

### ✅ Фаза 2 — Примитивные фигуры (CSG Worker)

- [x] Cube, Sphere, Cylinder, Cone, Torus через manifold-3d
- [x] Параметры фигур (width/height/depth, radius, segments и т.д.)
- [x] Web Worker для CSG операций (не блокирует UI)
- [x] Типобезопасный интерфейс worker-client (Promise-based)
- [x] Валидация параметров (sanitizeParams, clamp)
- [x] 3D Текст (TextGeometry через Three.js → manifold mesh)

---

### ✅ Фаза 3 — Управление сценой и выделение

- [x] Клик для выделения (Raycaster)
- [x] Drag-select (прямоугольное выделение)
- [x] Множественное выделение (Shift+клик)
- [x] TransformControls (перемещение, вращение, масштаб)
- [x] Подсветка выделенного (эмиссивный цвет)
- [x] GizmoMode: translate / rotate / scale
- [x] Snap to grid (1/5/10/50)

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
| | MIRROR-3 | Baked nodes: rotation не инвертируется при mirror | HIGH | ✅ |
| | MIRROR-5 | Boolean → baked: потеря параметричности при mirror | HIGH | ✅ |
| | MIRROR-8 | Scale не инвертируется при mirror | HIGH | ✅ |
| | MIRROR-1 | Плоскость mirror через origin вместо BBox | MEDIUM | ✅ |
| | MIRROR-6 | Fallback-ноды не удаляются после mirror | MEDIUM | ✅ |
| | MIRROR-7 | Трансформ boolean ноды из первого child | MEDIUM | ✅ |
| | MIRROR-10 | Нет проверки успешности sync перед mirror | MEDIUM | ✅ |
| | MIRROR-2 | Отсутствие предпросмотра mirror | MEDIUM | ✅ |
| | MIRROR-4 | 3D хендлы для выбора плоскости | LOW | ✅ |
| | MIRROR-9 | Двойная синхронизация import_mesh | LOW | ✅ |
| | CRIT-R16-3 | `any` в `collectSubtreeForWorker` / `applyCSGMeshes` | WARN | ✅ |
| | TEST-R16-3 | Нет тестов для `snap-utils.ts` (468 строк) | WARN | ✅ |
| | CODE-R16-1 | Дублирование матричной математики | COSM | ✅ |
| | CODE-R16-2 | Магические числа в Viewport3D | COSM | ✅ |
| | CODE-R16-3 | Смешение русского и английского в комментариях | COSM | ✅ |
| | PERF-R16-4 | `computeVertsHash` — возможны коллизии | PERF | ✅ |

#### Планируемые функции

| Задача | Приоритет | Сложность | Статус |
|--------|-----------|-----------|--------|
| | Импорт SVG (2D → 3D экструзия) | Средний | Средняя | 🔲 |
| | Импорт 3MF | Средний | Средняя | 🔲 |
| | Экспорт STEP / IGES (OpenCascade.js) | Низкий | Высокая | 🔲 |
| | Размеры / аннотации поверх 3D | Средний | Средняя | 🔲 |
| | Физическая симуляция (Rapier WASM) | Низкий | Высокая | 🔲 |
| | Коллаборативное редактирование (CRDT / WebSocket) | Низкий | Очень высокая | 🔲 |
| | Robot Lab (конструктор роботов) | Отложено | Высокая | 🔲 |

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
│   │   ├── MirrorButtons.tsx   # Кнопки зеркала
│   │   ├── AlignButtons.tsx    # Кнопки выравнивания
│   │   ├── CsgButtons.tsx      # Кнопки CSG
│   │   ├── TextModal.tsx       # Модалка 3D текста
│   │   ├── ProjectManagerModal.tsx # Менеджер проектов
│   │   ├── Timeline.tsx        # История операций
│   │   ├── StatusBar.tsx       # Строка состояния
│   │   ├── NumInput.tsx        # Numeric input
│   │   ├── Section.tsx         # Collapsible section
│   │   ├── ViewCube.tsx        # Навигационный куб
│   │   ├── ComponentTree.tsx   # Дерево компонентов
│   │   ├── snap-utils.ts       # Snap-to-geometry
│   │   ├── ErrorBoundary.tsx   # Error boundary
│   │   ├── WebGLFallback.tsx   # WebGL fallback
│   │   └── ToastContainer.tsx  # Toast-уведомления
│   ├── store/
│   │   ├── document-store.ts   # Zustand store (документ/сцена)
│   │   ├── ui-store.ts         # Zustand store (UI state)
│   │   ├── types.ts            # DocumentStore interface
│   │   ├── helpers.ts          # Утилиты (extractAndCenter, computeAABB, и т.д.)
│   │   ├── rebuild.ts          # rebuildFromHistory
│   │   ├── snapshots.ts        # Snapshot cache
│   │   └── notifications.ts    # Toast-уведомления
│   ├── csg/
│   │   ├── worker.ts           # WASM worker (manifold-3d операции)
│   │   ├── worker-client.ts    # Promise-обёртка над воркером
│   │   ├── worker-handlers.ts  # Обработчики сообщений воркера
│   │   ├── worker-matrix.ts    # Матричная математика
│   │   ├── types.ts            # Типы операций
│   │   ├── history-tree.ts     # Build Tree (параметрическое дерево)
│   │   ├── rebuildOps.ts       # Операции над деревом (mirror, move, rotate)
│   │   └── BUILD_TREE_SPEC.md  # Спецификация Build Tree
│   └── io/
│       ├── stl-import.ts       # Импорт STL
│       ├── stl-export.ts       # Экспорт STL
│       ├── doodle-io.ts        # Формат .doodle
│       ├── autosave.ts         # Автосохранение
│       └── project-manager.ts  # Менеджер проектов
```

---

## Бенчмарки производительности

| Операция | Среднее время | Примечание |
|----------|---------------|------------|
| Создание куба | < 5ms | WASM, без синхронизации |
| CSG Union (2 куба) | < 20ms | WASM, ~1000 треугольников |
| CSG Subtract (2 куба) | < 25ms | WASM |
| Mirror (простой объект) | < 30ms | clone + mirror + rebuild |
| Undo/Redo (с кэшем) | < 1ms | Snapshot cache |
| Undo/Redo (без кэша) | < 100ms | Полный rebuild через WASM |
| Импорт STL (10K tris) | < 50ms | Парсинг + создание mesh |
| Экспорт STL (10K tris) | < 20ms | Бинарный STL |

---

## Известные проблемы и технический долг

| # | Проблема | Приоритет | Статус |
|---|----------|-----------|--------|
| | Все MIRROR-проблемы (1-10) | HIGH/MEDIUM/LOW | ✅ Все исправлены |
| | CRIT-R16-3: `any` в worker | WARN | ✅ Исправлено |
| | TEST-R16-3: snap-utils тесты | WARN | ✅ Исправлено |
| | CODE-R16-1: дублирование матриц | COSM | ✅ Исправлено |
| | CODE-R16-2: магические числа | COSM | ✅ Исправлено |
| | CODE-R16-3: смешение языков | COSM | ✅ Исправлено |
| | PERF-R16-4: коллизии хеша | PERF | ✅ Исправлено |
| | **CRIT-17-1: boolean hash без localTransform** | **CRITICAL** | 🔄 Активна |
| | **CRIT-17-2: resizeObject без try/catch** | **CRITICAL** | 🔄 Активна |
| | **HIGH-1: Дублирование sync-логики** | **HIGH** | 🔄 Активна |
| | **HIGH-2: alignSelected rebuild** | **HIGH** | 🔄 Активна |
| | **HIGH-3: computeBakedBBox без R/S** | **MEDIUM** | 🔄 Активна |
| | **HIGH-4: pasteClipboard build tree** | **MEDIUM** | 🔄 Активна |
| | **HIGH-5: rebuildBuildTree не вызывается** | **HIGH** | 🔄 Активна |
| | **LOW-1: circle-snap не работает** | **MEDIUM** | 🔄 Активна |
| | **LOW-2: мёртвый код getWorldPointFromPointer** | **LOW** | 🔄 Активна |
| | **LOW-3: console.error вместо notify** | **LOW** | 🔄 Активна |
| | **LOW-4: slabId утечка в worker** | **LOW** | 🔄 Активна |
| | **LOW-5: неограниченный snapshot cache** | **LOW** | 🔄 Активна |
| | **LOW-6: sequential await syncOperand** | **LOW** | 🔄 Активна |
| | **LOW-7: рекурсия invalidateCache** | **LOW** | 🔄 Активна |
| | **LOW-8: смешение языков в константах** | **LOW** | 🔄 Активна |

---

## Быстрый старт

```bash
# Клонировать репозиторий
git clone https://github.com/your-org/tinkercraft.git
cd tinkercraft/web-app

# Установить зависимости
pnpm install

# Запустить dev-сервер
pnpm dev

# Проверка типов
pnpm typecheck

# Запуск тестов
pnpm test
```

---

## Команды

```bash
pnpm dev          # Dev-сервер (порт 5000)
pnpm build        # Production-сборка
pnpm test         # Запуск тестов (104 теста)
pnpm typecheck    # tsc --noEmit
