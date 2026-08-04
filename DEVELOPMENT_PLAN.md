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
| Фаза 8 — Параметрическая история операций | 🔲 Не начата |

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
| | **MIRROR-19-1** | mirrorCenter из локальных координат вместо мировых | **CRITICAL** | ✅ |
| | **MIRROR-19-2** | Preview только для первого объекта (multi-select) | **CRITICAL** | ✅ |
| | **MIRROR-19-3** | Утечка preview-узлов в build tree | **HIGH** | ✅ |
| | **MIRROR-19-4** | Race condition в preview (нет debounce) | **HIGH** | ✅ |
| | **MIRROR-19-5** | Preview-узлы не очищаются после confirm | **HIGH** | ✅ |
| | **MIRROR-19-6** | Хрупкая эвристика детекции CSG-результата | **HIGH** | ✅ |
| | **MIRROR-19-7** | baked без localTransform молча пропускается | **MEDIUM** | ✅ |
| | **MIRROR-19-8** | boolean без children молча пропускается | **MEDIUM** | ✅ |
| | **MIRROR-19-9** | treeTransform устаревает после rebuildNode | **MEDIUM** | ✅ |
| | **MIRROR-19-10** | Fallback-логика не совпадает с mirrorTreeNode | **MEDIUM** | ✅ |
| | **MIRROR-19-11** | as unknown as в rebuild.ts для mirror | **MEDIUM** | ✅ НЕ БАГ |
| | **MIRROR-19-12** | Matrix4.compose с отражёнными углами Euler | **LOW** | ✅ |
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

### 🔮 Фаза 8 — Параметрическая история операций (Parametric History)

> **Концепция:** Каждая операция в истории — это параметрический объект. Изменяя параметры на любом шаге, мы перестраиваем всё, что было после него.

```
История операций → Шаг 1: Куб 20x20x20 → Шаг 2: Скругление R=2 → Шаг 3: Union с цилиндром → Шаг 4: Зеркало YZ → Текущий результат
                                                                 ↓
                                                              Редактируем R=2 → R=5
                                                                 ↓
                                                              Перестраиваем шаги 3-4
                                                                 ↓
                                                              Новый результат
```

#### Цели

- Редактирование параметров примитивов прямо в Timeline (размеры, радиусы, сегменты)
- Раскрытие и редактирование CSG-операций (union/subtract/intersect) — изменение состава и типа
- Редактирование параметров mirror, fillet, extrude в истории
- Перестроение цепочки при изменении любого шага (rebuildFromHistory с нужного индекса)
- Drag & drop для изменения порядка операций (будущее)

#### Подзадачи

| # | Задача | Приоритет | Сложность | Статус |
|---|--------|-----------|-----------|--------|
| 8.1 | **Timeline edit** — UI для редактирования параметров операции в Timeline | Высокий | Средняя | 🔲 |
| | | Добавлена кнопка «✏️» в TimelineItem для операций с редактируемыми параметрами | | |
| | | При клике — модалка с формой параметров (размеры куба, радиус скругления и т.д.) | | |
| | | Для CSG — модалка с выбором типа операции и списка operand-ов | | |
| 8.2 | **Edit modal для примитивов** — форма редактирования параметров примитива | Высокий | Низкая | 🔲 |
| | | Cube: width/height/depth | | |
| | | Sphere: radius, segmentsX, segmentsY | | |
| | | Cylinder: radiusTop, radiusBottom, height, segments | | |
| | | Cone, Torus, Prism, Pyramid — аналогично | | |
| 8.3 | **Edit modal для CSG** — раскрытие и редактирование boolean операций | Высокий | Средняя | 🔲 |
| | | Выбор типа операции: union / subtract / intersect | | |
| | | Список operand-ов с возможностью добавить/удалить | | |
| | | Визуальная индикация CSG-результата в Timeline | | |
| 8.4 | **Rebuild on edit** — перестроение цепочки после изменения параметра | Высокий | Средняя | 🔲 |
| | | `editOperation(index, newParams)` — обновление операции в истории | | |
| | | Вызов `rebuildFromHistory(ops.slice(0, index + 1))` | | |
| | | Обновление объектов и build tree | | |
| | | Toast-уведомление об успехе/ошибке | | |
| 8.5 | **Edit modal для fillet/extrude/mirror** — редактирование продвинутых операций | Средний | Средняя | 🔲 |
| | | Fillet: radius | | |
| | | Extrude: depth, direction | | |
| | | Mirror: plane (XY/XZ/YZ) | | |
| 8.6 | **Undo для edit** — запись изменений в историю undo/redo | Средний | Низкая | 🔲 |
| | | При редактировании операции — запись предыдущего состояния в историю | | |
| | | Ctrl+Z откатывает к состоянию ДО редактирования | | |
| 8.7 | **Visual feedback** — визуальная индикация редактируемого шага | Низкий | Низкая | 🔲 |
| | | Подсветка текущего редактируемого элемента в Timeline | | |
| | | Индикатор «rebuilding...» при перестроении цепочки | | |

#### Зависимости

- ✅ История операций — уже есть (`document-store.ts`)
- ✅ Build Tree — уже есть (`history-tree.ts`)
- ✅ Rebuild из истории — уже есть (`rebuild.ts`)
- ❌ UI для редактирования — нужно добавить (Фаза 8)
- ❌ Модалки редактирования — нужно добавить (Фаза 8)

#### Сравнение с профессиональными CAD

| Возможность | TinkerCraft (сейчас) | TinkerCraft (после Фазы 8) | Fusion 360 |
|-------------|---------------------|---------------------------|------------|
| История операций | ✅ Есть | ✅ Есть | ✅ Есть |
| Раскрытие CSG | ❌ Нет | ✅ Да | ✅ Да |
| Редактирование параметров | ✅ Для примитивов | ✅ Для всех | ✅ Для всех |
| Перестроение цепочки | ❌ Только undo/redo | ✅ Да | ✅ Да |
| Изменение порядка | ❌ Нет | ❌ (будущее) | ✅ Да |

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
| | ~~MIRROR-19-11: as unknown as в rebuild.ts~~ | **MEDIUM** | ✅ НЕ БАГ |
| | CRIT-R16-3: `any` в worker | WARN | ✅ Исправлено |
| | TEST-R16-3: snap-utils тесты | WARN | ✅ Исправлено |
| | CODE-R16-1: дублирование матриц | COSM | ✅ Исправлено |
| | CODE-R16-2: магические числа | COSM | ✅ Исправлено |
| | CODE-R16-3: смешение языков | COSM | ✅ Исправлено |
| | PERF-R16-4: коллизии хеша | PERF | ✅ Исправлено |

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
