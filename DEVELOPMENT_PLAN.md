# TinkerCraft Web — План разработки

**Дата:** 2025-07-15
**Версия:** 1.0.0

---

## 🎉 РЕЛИЗ v1.0.0 — 2026-08-19

> **Первый стабильный релиз TinkerCraft Web — Open Source 3D CAD-редактор.**
> **Платформа:** CAD-версия (чистый 3D-редактор, без интеграций игровых платформ)
> **Статус:** ✅ Готов к деплою

### Что достигнуто к релизу

- Все 8 фаз разработки завершены (0–7.6)
- ~291 проблем код-ревью закрыты (0 активных)
- ~236 тестов проходят
- Полная i18n локализация (EN + RU)
- 40+ SVG-иконок
- Параметрическое Build Tree для CSG
- Optimized mirror pipeline с кэшированием
- Чистый Open Source код (без SDK сторонних платформ)

### Дальнейшие планы

| Задача | Статус | Приоритет |
|--------|--------|-----------|
| **Деплой на GitHub Pages / Vercel** | ✅ Завершена | P0 |
| **Создать тег `v1.0.0` в GitHub** | ✅ Завершена | P0 |
| **Фаза 8 — Единая модель трансформов** | ✅ Завершена 2026-10-15 (релиз v1.1.0) | P1 |
| **Фаза 8.5 — Унификация отрисовки и данных** | ✅ Завершена (v1.2.3) | P1 |
| **Яндекс-версия (ветка `yandex-games`)** | 🔲 Не начата | P2 |
| **Импорт SVG (2D → 3D экструзия)** | 🔲 Не начата | P3 |

---

## 🗺️ Дорожная карта (yandex-games ветка)

### ✅ Этап 1 — CAD v1.0.0

**Статус:** Завершён (19.08.2026)

Фазы 0–7.6, релиз, тег `v1.0.0`, деплой на GitHub Pages / Vercel.

### 🔄 Этап 2 — Обновление для Яндекс.Игр

**Статус:** В процессе

#### Y.1 Фундамент SDK ✅ (21.08.2026)

- IPlatform интерфейс, Yandex/Clean реализации
- SDK инициализация, Gameplay API, COEP-разделение
- Сборка `dev:yandex`, `build:yandex`

#### Y.2 Экономика V2 ✅ (28.08.2026, исправлено 22/22 проблем, 299 тестов; **после U1–U10 — 336/336 тестов; после A/B/C — 357/357 тестов**)

- Конфиг экономики, store, квесты, триггеры
- UI-панели (EconomyHUD, QuestPanel, EconomyShop, EconomyBanner)
- i18n EN/RU для всей экономики
- Кэшбэк V2 по коэффициентам
- **Ревью экономики (EC1–EC18, 2026-09-07):** все 18 проблем закрыты (баннер, импорт, экспорт, квесты, кэшбэк, HUD, бейджи, чистые селекторы, UX состояний, тесты) — см. `CODE_REVIEW.md`
- **✅ Глубокое ревью экономики (2026-09-10) — закрыто (2026-09-11):** все 22 проблемы (6 P0 / 9 P1 / 7 P2) **исправлены**: анти-фарм кэшбэка (P0-1), expiry по серверному времени (P0-2), потеря начислений в `syncToCloud` (P0-3, P0-4), клиентская валидация (P0-5), clean-фолбэк SDK (P0-6), а также все P1/P2. Проверка: `pnpm typecheck` 0 ошибок, `pnpm test` 299/299. Полный отчёт — [`docs/ECONOMY_CODE_REVIEW.md`](docs/ECONOMY_CODE_REVIEW.md); статусы — `CODE_REVIEW.md`

#### Y.3 Релиз в Яндекс.Игры 🔲

- Проверка политики баннера (отключение баннера может противоречить модерации)
- Ассеты: иконка 512×512, скриншоты, описание
- ZIP → песочница → модерация
- Мониторинг метрик 2–4 недели

### 🔲 Этап 3 — Параметрическая история (Фаза 8)

**Статус:** Не начата (после Этапа 2)

Параметрическая история операций — редактирование параметров примитивов, CSG, mirror, fillet, extrude прямо в Timeline с перестроением цепочки.

#### Задачи Фазы 8

| # | Задача | Приоритет | Статус |
|---|--------|-----------|--------|
| 8.1 | Timeline edit — UI для редактирования параметров операции | Высокий | 🔲 |
| 8.2 | Edit modal для примитивов (размеры, радиусы, сегменты) | Высокий | 🔲 |
| 8.3 | Edit modal для CSG (тип операции, operand-ы) | Высокий | 🔲 |
| 8.4 | Rebuild on edit — перестроение цепочки после изменения параметра | Высокий | 🔲 |
| 8.5 | Edit modal для fillet/extrude/mirror | Средний | 🔲 |
| 8.6 | Undo для edit — запись изменений в историю | Средний | 🔲 |
| 8.7 | Visual feedback — подсветка редактируемого шага | Низкий | 🔲 |
| 8.8 | CSG-CSG-POSITION-DRIFT — смещение операндов при boolean CSG | Высокий | 🔲 |
| 8.9 | MIRROR-CSG-CHILD-RS-LOSS — сброс масштаба/поворота при зеркале CSG | Высокий | 🔲 |

### 🔲 Будущие возможности (после Фазы 8)

| Задача | Приоритет | Статус |
|--------|-----------|--------|
| Импорт SVG (2D → 3D экструзия) | Средний | 🔲 |
| Импорт 3MF | Средний | 🔲 |
| Экспорт STEP / IGES (OpenCascade.js) | Низкий | 🔲 |
| Размеры / аннотации поверх 3D | Средний | 🔲 |
| Физическая симуляция (Rapier WASM) | Низкий | 🔲 |
| Коллаборативное редактирование (CRDT / WebSocket) | Низкий | 🔲 |


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
| Фаза 7 — Исправления и улучшения | ✅ Завершена |
| Фаза 7.5 — Доводка инструментов (параметрический скелет) | ✅ Завершена |
| | Блок A: Архитектура | ✅ 7.5.1, 7.5.2, 7.5.3, 7.5.4, 7.5.5 завершены |
| | Блок B: Интерфейс | ✅ Все задачи завершены |
| Фаза 7.6 — Mirror Pipeline Performance | ✅ Завершена |
| **🎉 РЕЛИЗ v1.0.0** | **✅ 2026-08-19** |
| Фаза 8 — Единая модель трансформов | ✅ Завершена 2026-10-15 (v1.1.0) |
| **Фаза 8.5 — Унификация отрисовки и данных** | **✅ Завершена (v1.2.3)** |
| **Фаза 9 — Параметрическая история** | **🔲 Запланирована** |
| **Фаза 10 — Яндекс.Игры** | **🔲 Запланирована** |
| **Фаза 11 — Будущее** | **🔲 Запланирована** |

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

### ✅ Фаза 7 — Исправления и улучшения

Все проблемы из раундов код-ревью (Раунды 16–20, ~175 исправлений) закрыты.
Полная история: [`CODE_REVIEW.md`](CODE_REVIEW.md)

#### Завершённые проблемы (все закрыты)

| Раунд | Проблем | Статус |
|-------|---------|--------|
| Раунд 16 | CRIT, WARN, PERF, CODE, SEC, TEST | ✅ Все исправлены |
| Раунд 17 + SourceCraft | CRIT-1..12, Store/CSG/UI/IO, LOW | ✅ Все исправлены |
| Mirror boolean/non-manifold | MIRROR-BOOLEAN, MIRROR-NONMANIFOLD | ✅ Исправлено |
| Раунд 18 | CRIT-18 (5), HIGH-18 (27), MED-18 (56), LOW-18 (50) | ✅ Все закрыты |
| Раунд 19 | MIRROR-19-1..12 (глубокий аудит mirror) | ✅ Все закрыты |
| Раунд 20 | CSG-PARAM-1/2/3 | ✅ Все исправлены |

**Итого за Фазу 7:** ~175 проблем исправлено, ~115 признаны архитектурными решениями.

---

### 🔮 Фаза 7.5 — Доводка инструментов (Параметрический скелет)

> **Цель:** Сделать так, чтобы **все основные инструменты** (CSG, зеркало) работали **параметрически** для **всех типов объектов**.
>
> **Статус инфраструктуры:**
> - ✅ Build Tree — реализован
> - ✅ История операций — реализована
> - ✅ `createBooleanNode` — реализован
> - ✅ `rebuildFromHistory` — поддерживает boolean-ноды
> - ✅ Mirror-store — работает для всех типов объектов
> - ✅ Интеграция завершена (7.5.1, 7.5.2)
> - ❌ Нужно: тестирование цепочек, финальная полировка (7.5.3, 7.5.4)

#### 🏗️ Архитектура (скелет)

**Принцип:** Любая операция — это функция над историей.

```
Пользователь → UI → Action (addShape, move, mirror, csgBoolean...) → History[]
    → rebuildFromHistory → Build Tree (primitive/boolean/baked)
    → Web Worker (manifold-3d WASM) → Геометрия → Store → Viewport3D
```

| Компонент | Ответственность | Файл |
|---|---|---|
| **UI** | Вызов actions, отображение состояния | `App.tsx`, `Toolbar.tsx` |
| **Actions** | Мутация истории, вызов rebuild | `document-store.ts` |
| **History** | Массив операций, undo/redo | `document-store.ts` |
| **Build Tree** | Параметрическое дерево объектов | `history-tree.ts` |
| **Worker** | Вычисление геометрии (WASM) | `worker.ts`, `worker-handlers.ts` |
| **Store** | Текущие объекты сцены | `document-store.ts` |
| **Viewport** | Рендеринг Three.js | `Viewport3D.tsx` |

#### ✅ Что уже реализовано

| Компонент | Статус | Примечание |
|---|---|---|
| `createBooleanNode` | ✅ | `history-tree.ts:98-130` — с проверкой циклов |
| `rebuildFromHistory` для boolean | ✅ | `rebuild.ts:313-331` — создаёт boolean-ноды |
| `mirrorObject` для всех типов | ✅ | `mirror-store.ts` — primitive/CSG/import |
| `syncObjectsForOperation` | ✅ | `mirror-store.ts:51-88` — маршрутизация |
| Snapshot cache | ✅ | `snapshots.ts` — быстрый undo/redo |

#### 🎯 Задачи Фазы 7.5

| # | Приоритет | Задача | Статус |
|---|---|---|--------|
| 7.5.1 | P0 | Верификация CSG-архитектуры | ✅ Завершена |
| | | `csgBoolean` создаёт boolean-ноду | ✅ Реализовано |
| | | CSG-результат остаётся в `objects` | ✅ Реализовано |
| | | `syncObjectsForOperation` маршрутизирует boolean-ноды | ✅ Реализовано |
| 7.5.2 | P0 | Верификация зеркала для всех типов | ✅ Завершена |
| | | Примитивы → примитивы (параметрические) | ✅ Реализовано |
| | | CSG → import_mesh (baked) | ✅ Реализовано |
| | | Import → import_mesh (baked) | ✅ Реализовано |
| **7.5.3** | **P1** | **SVG иконки для UI — Полная реализация** | **✅ ЗАВЕРШЕНО** |
| | | Создана структура `src/components/icons/` | ✅ Завершено |
| | | 40+ SVG-иконок по категориям | ✅ Завершено |
| | | Интеграция во все компоненты | ✅ Завершено |
| | **7.5.4** | **Тестирование цепочек операций** | **✅ ЗАВЕРШЕНО** |
| | | CSG-цепочки (union/subtract/intersect) | ✅ 15 тестов |
| | | Mirror + CSG | ✅ |
| | | Undo/Redo через CSG | ✅ |
| | | Jump to history | ✅ |
| | **7.5.5** | **Финальная полировка (логи, перф, доки)** | **✅ ЗАВЕРШЕНО** |
| | | ✅ Условные логи (devLog/devWarn) | ✅ Завершено |
| | | ✅ IconButton компонент + тултипы | ✅ Завершено |
| | | ✅ Двухуровневые тултипы | ✅ Завершено |
| | | ✅ Layout тулбара (CAD-style) | ✅ Завершено |
| | | ✅ Алгоритм распределения кнопок по строкам | ✅ Завершено |
| | | ✅ Диагностические логи [DIAG:*] переключены на dev mode | ✅ Завершено |
| | | ✅ Подробные тултипы для всех кнопок Align | ✅ Завершено |
| | | ✅ Иконки Timeline для всех типов операций | ✅ Завершено |
| | | ✅ Имя проекта в PropertiesPanel (вместо Toolbar) | ✅ Завершено |

#### 📊 Что меняется после Фазы 7.5

| Аспект | До 7.5 | После 7.5 |
|--------|--------|-----------|
| **CSG-результат** | `baked`-нода (vertices) | `boolean`-нода (operation + children) |
| **Параметричность CSG** | ❌ Потеряна | ✅ Сохранена (boolean-нода в дереве) |
| **CSG-цепочки** | ❌ Ломаются | ✅ Работают (через rebuildFromHistory) |
| **Зеркало CSG** | ❌ Превращает в `import_mesh` | ✅ Сохраняет параметричность primitive; CSG → `import_mesh` (baked) |
| **Зеркало Primitive** | ❌ Превращает в `import_mesh` | ✅ Сохраняет shapeType/params |
| **Редактирование** | ❌ Невозможно | ✅ Возможно (Фаза 8) |

#### 🛠️ План действий

##### Шаг 1: Верификация CSG-архитектуры ✅ Завершено

```typescript
// document-store.ts - csgBoolean (строка 496)
// ✅ РЕАЛИЗОВАНО:
createBooleanNode(resultId, op as 'union' | 'subtract' | 'intersect', idA, idB, resultTransform)

// Проверено:
// 1. CSG-результат остаётся в objects ✅
// 2. children (idA, idB) остаются в objects ✅
// 3. syncObjectsForOperation маршрутизирует boolean-ноды ✅
// 4. rebuildNode кэширует mesh в history-tree ✅
```

##### Шаг 2: Верификация зеркала ✅ Завершено

```typescript
// mirror-store.ts - mirrorObject
// ✅ РЕАЛИЗОВАНО:
// - Примитивы → сохраняют shapeType/params (остаются редактируемыми)
// - CSG → shapeType: 'import_mesh' (baked) — геометрия уже вычислена
// - Import → shapeType: 'import_mesh' (baked)
// - ensureInTree + syncNodeTransform
// - mirrorVerticesInPlace для отражения вершин
// - mirrorEuler для отражения поворота
// - Исправление winding order (CCW→CW)
```

##### Шаг 3: Тестирование цепочек 🔲 Не выполнено

- [x] ✅ Создать куб → Union с цилиндром → Зеркало
- [x] ✅ Создать куб → Union с цилиндром → Union со сферой
- [ ] Изменить размер куба → Всё перестраивается
- [ ] Undo/redo через CSG-цепочки

##### Шаг 4: Финальная полировка ✅ Выполнено

- [x] ✅ **Диагностические логи `[DIAG:*]` → dev mode**: Все логи переключены на `import.meta.env?.DEV`. Логи работают только в dev (`pnpm dev`), в production отсутствуют. Не удалены — пригодятся для отладки.
- [ ] 🔲 Проверить производительность на больших сценах
- [ ] 🔲 Обновить BUILD_TREE_SPEC.md

#### Блок B: Интерфейс и визуальная полировка

> **Статус:** ✅ ЧАСТИЧНО ЗАВЕРШЕНО (SVG-иконки созданы и интегрированы)

##### B.1 — Иконки кнопок (SVG)

**Завершено:** Создана модульная структура `src/components/icons/` с 40+ SVG-иконками:

| Группа | Количество | Статус | Описание |
|--------|------------|--------|----------|
| **Палитра фигур** | 8 | ✅ | Куб, Сфера, Цилиндр, Конус, Тор, Призма, Пирамида, Текст |
| **Инструменты** | 4 | ✅ | Выделение, Перемещение, Вращение, Масштаб |
| **CSG** | 3 | ✅ | Объединение, Вычитание, Пересечение |
| **Зеркало** | 3 | ✅ | YZ, XZ, XY плоскости |
| **Действия** | 5 | ✅ | Undo, Redo, Копировать, Вставить, Удалить |
| **Файл** | 5 | ✅ | Открыть, Сохранить, Импорт, Экспорт, Папка |
| **Навигация** | 3 | ✅ | Дом, Fit View, Линейка |
| **Дополнительно** | 7 | ✅ | Fillet, Align, Color, Plus, Monitor, ChevronUp, ChevronDown |
| **UI** | 5 | ✅ | Close, Info, Warning, Eye, EyeOff |

**Всего иконок:** 43 SVG-компонента в модульной структуре

##### Структура иконок

```
web-app/src/components/icons/
├── index.ts              # Главный экспорт всех иконок (62 экспорта)
├── IconBase.tsx          # Базовый SVG-компонент
├── legacy-icons.tsx      # Старый монолитный (удалён)
├── shapes/               # 8 примитивов
│   ├── CubeIcon.tsx
│   ├── SphereIcon.tsx
│   ├── CylinderIcon.tsx
│   ├── ConeIcon.tsx
│   ├── TorusIcon.tsx
│   ├── PrismIcon.tsx
│   ├── PyramidIcon.tsx
│   └── TextIcon.tsx
├── tools/                # 4 инструмента
├── csg/                  # 3 CSG операции
├── mirror/               # 3 плоскости зеркала
├── actions/              # 5 действий
├── file/                 # 5 файловых операций
├── navigation/           # 3 навигационные
├── extra/                # 7 дополнительных
└── ui/                   # 5 UI элементов
```

##### Интеграция

Все компоненты обновлены для использования новой структуры иконок:
- ✅ `Toolbar.tsx` — использует 20+ иконок
- ✅ `LeftPanel.tsx` — использует ALL_SHAPES_ICONS из constants-react
- ✅ `Timeline.tsx` — 15+ операций с иконками
- ✅ `ComponentTree.tsx` — 11 фигур + UI
- ✅ `PropertiesPanel.tsx` — Visibility, Fillet
- ✅ `ToastContainer.tsx` — уведомления
- ✅ `Section.tsx` — сворачиваемые секции
- ✅ `TextModal.tsx` — модалка текста
- ✅ `ProjectManagerModal.tsx` — менеджер проектов
- ✅ `CsgButtons.tsx` — CSG операции
- ✅ `MirrorButtons.tsx` — зеркало
- ✅ `AlignButtons.tsx` — выравнивание
- ✅ `ErrorBoundary.tsx` — экран ошибки
- ✅ `WebGLFallback.tsx` — WebGL fallback

##### ✅ Остаточные задачи

| Задача | Статус |
|--------|--------|
| **Компонент IconButton (универсальный)** | **✅ ЗАВЕРШЕНО** — создан `IconButton.tsx` с поддержкой compact/full вариантов, стилевых вариантов (default/primary/danger/active), тултипов, ARIA-label |
| **Замена текстовых кнопок в тулбаре на IconButton** | **✅ ЗАВЕРШЕНО** — все кнопки заменены в Toolbar.tsx, CsgButtons.tsx, MirrorButtons.tsx, AlignButtons.tsx |
| **Добавить тултипы для всех кнопок** | **✅ ЗАВЕРШЕНО** — двухуровневые тултипы через `Tooltip.tsx` (мгновенный label + расширенное описание через 1.5 сек) |
| **Адаптация под тему (светлая/тёмная)** | **✅ ЗАВЕРШЕНО** — CSS-переменные в `App.css`, все компоненты поддерживают обе темы |

---

---

### 🔮 Фаза 8 — Единая модель трансформов

> **Концепция:** `relativeToParent` — единственный источник истины для трансформов. CSG-центрирование унифицировано на `centerMassAtOrigin`.
>
> **Статус:** ✅ Завершена (v1.1.0, 2026-10-15)
>
> **См.** `web-app/ARCHITECTURE_TRANSFORMS.md`

---

### 🔮 Фаза 8.5 — Унификация отрисовки и данных (v1.2.3)

> **Концепция:** `SceneObject.vertices` — всегда в origin (COM). `SceneObject.transform` — мировой pivot. Отрисовка = `mesh.position = transform`, `geometry = vertices`. Render = data.
>
> **Статус:** ✅ Завершена (v1.2.3, 2026-11-01)
>
> **См.** `web-app/ARCHITECTURE_RENDER.md`

#### Подзадачи

| # | Задача | Приоритет | Сложность | Статус |
|---|--------|-----------|-----------|--------|
| 8.5.0 | Подготовка + ARCHITECTURE_RENDER.md | Высокий | Низкая | ✅ Завершена |
| 8.5.1 | Worker возвращает origin для всех primitive | Высокий | Средняя | ✅ 2026-10-21 |
| 8.5.2 | Store применяет spawn к transform, не к vertices | Высокий | Средняя | ✅ 2026-10-21 |
| 8.5.2.5 | `handleRebuildScene` возвращает origin-вершины (undo/redo/load) | Высокий | Средняя | ✅ 2026-10-23 |
| 8.5.3 | Удалить `centerGeometry` и `isPivotCenteredGeometry` | Высокий | Средняя | ✅ 2026-10-24 |
| 8.5.4 | Миграция `.doodle` → `.3dtc` | Средний | Средняя | ✅ 2026-10-24 |
| 8.5.5 | CI-тест `render-data-invariant.test.ts` (import_mesh, CSG, mirror, fillet, resize) | Высокий | Низкая | ✅ 2026-10-24 |
| 8.5.6 | Релиз v1.2.0 (CSG-инварианты, версия, CHANGELOG) | Средний | Низкая | ✅ 2026-10-25 |
| 8.5.7 | Double-mirror primitive = identity | Высокий | Средняя | ✅ 2026-10-25 |
| 8.5.8 | Ревизия + push + релиз v1.2.1 (CODE_REVIEW.md) | Средний | Низкая | ✅ 2026-10-26 |
| 8.5.9 | CSG preserves rotation/scale of operand A (CSG-PRESERVE-RS) | Высокий | Средняя | ✅ 2026-10-28 |
| 8.5.10 | CSG-MIRROR-PRIMITIVE-PARAMS (mirror flag routing) | Высокий | Средняя | ✅ 2026-10-31 |
| 8.5.12 | Multi-level mirror + CSG mirror double RS | Высокий | Средняя | ✅ 2026-11-01 |
| 8.5.13 | Ревизия + push + релиз v1.2.3 | Средний | Низкая | ✅ 2026-11-01 |

---

### 🔮 Фаза 9 — Параметрическая история операций (Parametric History)

> **Концепция:** Каждая операция в истории — это параметрический объект. Изменяя параметры на любом шаге, мы перестраиваем всё, что было после него.
>
> **Статус:** 🔲 Не начата (следующий этап после v1.2.3)

```
История операций → Шаг 1: Куб 20x20x20 → Шаг 2: Скругление R=2 → Шаг 3: Union с цилиндром → Шаг 4: Зеркало YZ → Текущий результат
                                                                  ↓
                                                               Редактируем R=2 → R=5
                                                                  ↓
                                                               Перестраиваем шаги 3-4
                                                                  ↓
                                                               Новый результат
```

#### Подзадачи

| # | Задача | Приоритет | Сложность | Статус |
|---|--------|-----------|-----------|--------|
| 9.1 | **Timeline edit** — UI для редактирования параметров операции в Timeline | Высокий | Средняя | 🔲 |
| | | Добавлена кнопка «✏️» в TimelineItem для операций с редактируемыми параметрами | | |
| | | При клике — модалка с формой параметров (размеры куба, радиус скругления и т.д.) | | |
| | | Для CSG — модалка с выбором типа операции и списка operand-ов | | |
| 9.2 | **Edit modal для примитивов** — форма редактирования параметров примитива | Высокий | Низкая | 🔲 |
| | | Cube: width/height/depth | | |
| | | Sphere: radius, segmentsX, segmentsY | | |
| | | Cylinder: radiusTop, radiusBottom, height, segments | | |
| | | Cone, Torus, Prism, Pyramid — аналогично | | |
| 9.3 | **Edit modal для CSG** — раскрытие и редактирование boolean операций | Высокий | Средняя | 🔲 |
| | | Выбор типа операции: union / subtract / intersect | | |
| | | Список operand-ов с возможностью добавить/удалить | | |
| | | Визуальная индикация CSG-результата в Timeline | | |
| 9.4 | **Rebuild on edit** — перестроение цепочки после изменения параметра | Высокий | Средняя | 🔲 |
| | | `editOperation(index, newParams)` — обновление операции в истории | | |
| | | Вызов `rebuildFromHistory(ops.slice(0, index + 1))` | | |
| | | Обновление объектов и build tree | | |
| | | Toast-уведомление об успехе/ошибке | | |
| 9.5 | **Edit modal для fillet/extrude/mirror** — редактирование продвинутых операций | Средний | Средняя | 🔲 |
| | | Fillet: radius | | |
| | | Extrude: depth, direction | | |
| | | Mirror: plane (XY/XZ/YZ) | | |
| 9.6 | **Undo для edit** — запись изменений в историю undo/redo | Средний | Низкая | 🔲 |
| | | При редактировании операции — запись предыдущего состояния в историю | | |
| | | Ctrl+Z откатывает к состоянию ДО редактирования | | |
| 9.7 | **Visual feedback** — визуальная индикация редактируемого шага | Низкий | Низкая | 🔲 |
| | | Подсветка текущего редактируемого элемента в Timeline | | |
| | | Индикатор «rebuilding...» при перестроении цепочки | | |
| 9.8 | **CSG-CSG-POSITION-DRIFT** — ✅ **ИСПРАВЛЕНО** (2026-10-14, Этап 8) | Высокий | Высокая | ✅ ИСПРАВЛЕНО (2026-10-14) |
| 9.9 | **MIRROR-CSG-CHILD-RS-LOSS** — ✅ **ИСПРАВЛЕНО** (2026-10-14, Этап 8) | Высокий | Высокая | ✅ ИСПРАВЛЕНО (2026-10-14) |
| 9.10 | **CSG-PRESERVE-RS** — `csgBoolean` терял rotation/scale operand A (результат всегда имел identity RS). Исправлено: `resultTransform` копирует rot/scale от operand A | Высокий | Высокая | 🔲 |

#### 🚀 Будущие возможности (после релиза)

> Это запланированные функции для будущих фаз после релиза (не входят в Фазы 8.5/9).

#### Фаза 10 — Яндекс.Игры (монетизация) — реализована в ветке `yandex-games`

| Этап | Статус |
|------|--------|
| **Y.1 Фундамент SDK** (2026-08-21) — IPlatform, Yandex/Clean, SDK init, Gameplay API, `dev:yandex`/`build:yandex` | ✅ |
| **Y.2 Экономика V2** (2026-08-28) — конфиг, store, квесты, триггеры, UI-панели, i18n, кэшбэк V2; ревью EC1–EC18 закрыты (2026-09-07); глубокое ревью 22 проблемы закрыто (2026-09-11), `docs/ECONOMY_CODE_REVIEW.md` | ✅ |
| **Y.3 Релиз в Яндекс.Игры** — ассеты, ZIP → песочница → модерация, мониторинг метрик | 🔲 |

#### Фаза 11 — Будущее

| Задача | Приоритет | Сложность | Статус |
|--------|-----------|-----------|--------|
| Импорт SVG (2D → 3D экструзия) | Средний | Средняя | 🔲 |
| Импорт 3MF | Средний | Средняя | 🔲 |
| Экспорт STEP / IGES (OpenCascade.js) | Низкий | Высокая | 🔲 |
| Размеры / аннотации поверх 3D | Средний | Средняя | 🔲 |
| Физическая симуляция (Rapier WASM) | Низкий | Высокая | 🔲 |
| Коллаборативное редактирование (CRDT / WebSocket) | Низкий | Очень высокая | 🔲 |
| Robot Lab (конструктор роботов) | Отложено | Высокая | 🔲 |

#### Цели

- Редактирование параметров примитивов прямо в Timeline (размеры, радиусы, сегменты)
- Раскрытие и редактирование CSG-операций (union/subtract/intersect) — изменение состава и типа
- Редактирование параметров mirror, fillet, extrude в истории
- Перестроение цепочки при изменении любого шага (rebuildFromHistory с нужного индекса)
- Drag & drop для изменения порядка операций (будущее)

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
| Персистентность | IndexedDB (автосохранение + несколько проектов), JSZip (.3dtc) |
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
│       ├── 3dtc-io.ts          # Формат .3dtc (основной)
│       ├── doodle-io.ts        # Формат .doodle (legacy, не поддерживается)
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
| | **CENTERING-INCONSISTENCY** — три разных центра масс в проекте: worker (vertex centroid), frontend (`extractCenteredAt(transformA)`), helpers (`centerMassAtOrigin`). Для несимметричных CSG-результатов diff = 3.89 (численный тест union куб+призма). Риск CSG-PRISM-OFFSET на Этапе 8. Унифицировано: единая `centerMassAtOrigin` (`csg/geometry-utils.ts`) в worker + frontend + rebuild. | **CRITICAL** | ✅ **ИСПРАВЛЕНО** (2026-10-14, Этап 6.5) |
| | **CENTERING-RESIDUAL** — остаточный долг 6.5: (1) `handleRebuildScene` внутренне использует world-кэш (самосогласован, но вне origin-конвенции); (2) pivot legacy-документов (центрирование по transformA) не мигрирован — tree-rebuild старых CSG может дать смещение (baked resultVertices путь не затронут); (3) extrude/CSG филлет-примитивов rebuild'ится через `buildPrimitive` без fillet. | **MEDIUM** | 🔲 Этап 7/8 |
| | **PIVOT-CSG** — pivot CSG-результата = COM (из-за Stage 6.5 `centerMassAtOrigin` + pivot = COM в `csgBoolean`). Gizmo CSG «съезжает» на `(COM − transformA)` (измерено **0.0192** ед. для куб@(20,20,20) + призма@(20,20,20) rot(20,20,20) scale(1,1,0.5)). Исправлено: pivot = transformA, vertices сдвинуты на `(COM − transformA)` в обратную сторону — инвариант `world = pivot + vertex` сохранён. | **CRITICAL** | ✅ **ИСПРАВЛЕНО** (2026-10-17) |
| | **VIEWPORT-DOUBLE-CENTERING** — `useMeshSync` вычитал `bboxCenter` из вершин всех объектов, но CSG-вершины уже COM-центрированы (§5.4): для асимметричной геометрии (COM ≠ bboxCenter) CSG рендерился со сдвигом **4.2491** ед. Устранено предикатом `isPivotCenteredGeometry` в 3 местах вьюпорта + синхронно в STL-экспорте; diff render-vs-data = 0.00000000. | **CRITICAL** | ✅ **ИСПРАВЛЕНО** (2026-10-16) |
| | **MIRROR-CHIRALITY** — зеркало CSG с асимметричными примитивами (prism sides=3) было приближённым: `mirrorNodeRecursive` зеркалит трансформы детей, но не геометрию примитива (призма на origin: `mirrorPoint(0) = 0`). Измерено: bbox расходился с эталоном на **2.5** ед. ✅ ИСПРАВЛЕНО (Variant B, baked children): `bakeMirroredSubtree` конвертирует primitive-детей в baked с отражёнными вершинами (params сохранены). После фикса: max diff = 0.00000000. Тесты: `csg-mirror-chirality.test.ts` (10 тестов). | **HIGH** | ✅ Исправлено |
| | **CYCLE-CSG** — `Cannot create cycle in tree` при `jumpToHistory`/`loadFromProject` (дети CSG отсутствуют в дереве при rebuildBuildTree) | **CRITICAL** | ✅ **ИСПРАВЛЕНО** (2026-08-08) |
| | **MIRROR-CSG-RS** — Потеря rotation/scale при булевых операциях над зеркальными CSG-результатами | **CRITICAL** | ✅ **ИСПРАВЛЕНО** (2026-08-07) |
| | **MIRROR-DOUBLE-TRANSLATE** — Зеркало CSG давало ломанные, непредсказуемые копии (двойной translation: `moveTreeNode` сдвигал детей в дереве + root localTransform содержит translation) | **CRITICAL** | ✅ **ИСПРАВЛЕНО** (2026-08-18) |
| | **MIRROR-TREE-PRESERVE** — Повторное зеркалирование CSG-результата создавало примитив `cube` вместо boolean-ноды (mirrorObject удалял клонированное поддерево через deleteNode, rebuildBuildTree падалбэкал в createPrimitiveNode('cube')) | **CRITICAL** | ✅ **ИСПРАВЛЕНО** (2026-08-18) |
| | **CSG-RESIZE-NO-BAKE** — Ресайз CSG-результата запекал scale в вершины через `rebuildNode` (двойное scale при boolean/Viewport3D) | **HIGH** | ✅ **ИСПРАВЛЕНО** (2026-08-18; фактически scale-ветка была недостижима для CSG — `params: {}` truthy, CSG попадали в примитивную ветку; реально исправлено на Этапе 7, 2026-10-14) |
| | **RESIZE-TRS-DOUBLE** — `resizeObject` пересобирал mesh через `rebuildNode` (mesh с запечённым worldTransform = localTransform) и писал в `vertices` при неизменном `transform` → двойное применение TRS на pivot (Viewport3D). Этап 7: примитивы пересобираются `workerBuildShape` с нулевым transform (vertices в origin), CSG — только scale в transform, vertices не трогаются | **HIGH** | ✅ **ИСПРАВЛЕНО** (2026-10-14, Фаза 8 Этап 7) |
| | **CSG-TRANSFORM-IS-CENTROID** — `extractAndCenterGetAABB` центрировал вершины по `bboxCenter` CSG-результата, pivot стоял в `transformA`. Для асимметричной геометрии `bboxCenter ≠ transformA` → сдвиг. Исправлено: `extractCenteredAt(vertices, transformA)` центрирует вершины относительно `transformA`, pivot и вершины согласованы. | **CRITICAL** | ✅ **ИСПРАВЛЕНО** (2026-10-07) |
| | **OPT (MIRROR-CACHE)** — Дублированная работа previewMirror и mirrorSelected | **PERFORMANCE** | ✅ **ИСПРАВЛЕНО** (2026-08-07) |
| | ~~MIRROR-19-11: as unknown as в rebuild.ts~~ | **MEDIUM** | ✅ НЕ БАГ |
| | CRIT-R16-3: `any` в worker | WARN | ✅ Исправлено |
| | TEST-R16-3: snap-utils тесты | WARN | ✅ Исправлено |
| | CODE-R16-1: дублирование матриц | COSM | ✅ Исправлено |
| | CODE-R16-2: магические числа | COSM | ✅ Исправлено |
| | CODE-R16-3: смешение языков | COSM | ✅ Исправлено |
| | PERF-R16-4: коллизии хеша | PERF | ✅ Исправлено |
| | **Фаза 7 — завершена** | — | **✅ 2026-08-05** |
| | Фаза 7.5.1 — Верификация CSG-архитектуры | P0 | **✅ Завершена** |
| | Фаза 7.5.2 — Верификация зеркала для всех типов | P0 | **✅ Завершена** |
| | **7.5.3 — SVG иконки (40+)** | **P1** | **✅ ЗАВЕРШЕНО (2026-08-07)** |
| | **7.5.4 — Тесты цепочек операций (15 тестов)** | **P1** | **✅ ЗАВЕРШЕНО (2026-08-08)** |
| | **7.5.5 — Финальная полировка** | **P1** | **✅ ЗАВЕРШЕНО** |
| | — Условные логи (devLog/devWarn) | — | ✅ |
| | — IconButton + тултипы | — | ✅ |
| | — Layout тулбара (CAD-style) | — | ✅ |
| | — Диагностические логи [DIAG:*] → dev mode | — | ✅ |
| | — Иконки Timeline для всех операций | — | ✅ |
| | — Имя проекта в PropertiesPanel | — | ✅ |
| | — Подробные тултипы Align (9 кнопок) | — | ✅ |
| | — Vite dev-server (ERR_HTTP_HEADERS_SENT) | P0 | ✅ ИСПРАВЛЕНО (2026-08-14) |
| | — Shadow acne (полосатые грани) | P0 | ✅ ИСПРАВЛЕНО (2026-08-14) |
| | **CSG-CSG-POSITION-DRIFT** — ✅ **ИСПРАВЛЕНО** (2026-10-14, Этап 8) — Булевые операции между двумя CSG-результатами: сценарий 4 §10.2 (CSG+CSG Union, bbox diff=9.54e-7, pivot-vs-COM diff=9.78e-7) подтверждает позиционирование на месте. | **HIGH** | ✅ **ИСПРАВЛЕНО** (2026-10-14, Этап 8) |
| | **MIRROR-CSG-CHILD-RS-LOSS** — Зеркалирование CSG, полученного объединением двух отзеркаленных копий (`csg_16 = union(mirror_A, mirror_B)` → `mirror(csg_16)`), сбрасывает масштаб и поворот у дочерних примитивов простой геометрии в зеркальной копии. `mirrorNodeRecursive` применяется к `localTransform` примитивов, но RS живёт в root-ноде CSG-поддерева, а у примитивов `localTransform` = identity по rot/scale → после клонирования/зеркала `relativeToParent` теряет `rotationDelta`/`scaleRatio` для вложенных boolean-нод. Смотреть `clone-before-rebuild` фазы в `[TREE]` логах для `obj_17`/`obj_18`/`obj_19`/`obj_20` (источник `csg_16`). | **HIGH** | ✅ **ИСПРАВЛЕНО** (2026-10-07) — `mirrorNodeRecursive` теперь применяет отрицательный scale для primitive-нод по перпендикулярной оси плоскости зеркала |
| | **CSG-PRESERVE-RS** — `csgBoolean` терял rotation/scale operand A (результат всегда имел identity RS). Фикс 2026-10-07 (копирование rot/scale) был заменён на baked-RS в 6ffe24b (regression). Финальный фикс (Этап 8.5.9): вершины un-baked'ятся к системе A (`v = S⁻¹Rᵀ·(v_world − posA)`), `resultTransform` = полный TRS A; `GroupOperation.resultRotation/resultScale` + `rebuild.ts`. Тесты: `csg-preserve-rs.test.ts` (5). | **HIGH** | ✅ **Исправлено** (Этап 8.5.9, 2026-10-28) |
| | **RENDER-PRISM-BBOX-OFFSET** — `centerGeometry` (`viewport-hooks.ts`) вычитал `bboxCenter` (28,0,0) вместо spawn (25,0,0) → сдвиг **3.000 мм** на отрисовке. Ruler показывал `12.67 мм` вместо `10.74 мм`. Решение: удалить `centerGeometry` полностью — `vertices` всегда origin, `transform` = pivot, render = data. | **HIGH** | ✅ **Исправлено** (Этап 8.5.3, 2026-10-24) |
| | **DOUBLE-MIRROR-PRIMITIVE** — двойное зеркало примитива (YZ→YZ) возвращало pivot = identity, но vertices = одинарное зеркало (для призмы sides=3 — поворот на 180°). Корень: ветка примитива в `mirrorObject` вызывала `rebuildNode` (пересборка из `params`), теряя предыдущее зеркало в `obj.vertices`. Решение: зеркалить `obj.vertices` напрямую, без rebuild. | **HIGH** | ✅ **Исправлено** (Этап 8.5.7, v1.2.1) |
| | **CSG-MIRROR-PRIMITIVE-PARAMS** — ✅ **Исправлено** (Этап 8.5.10 + 8.5.12, v1.2.3) — Зеркальный примитив при CSG терял зеркальную форму (workerSyncObjects → rebuild из params). Фикс: `SceneObject.mirrored` flag → workerSyncMesh. Также: multi-level mirror (mirrored: MirrorPlane[], undo/redo), copy/paste (ClipEntry.mirrored + vertices), moveObject (!obj.mirrored → baked). | **HIGH** | ✅ **Исправлено** (Этап 8.5.10 + 8.5.12, v1.2.3) |
| | **Multi-level mirror (undo/redo, copy/paste)** — `mirrored` хранил одну плоскость — undo/redo multi-level `YZ→XZ` давал одно зеркало (diff = 30.0); copy/paste терял зеркало (diff = 2.86). Фикс: `mirrored: MirrorPlane[]` (ordered, cancel same-plane), `rebuildFromHistory` — цикл, `ClipEntry.mirrored` + vertices. | **HIGH** | ✅ **Исправлено** (v1.2.3) |
| | **Double RS mirror CSG** — mirror CSG имел `vertices` с baked TRS + `transform` с полным TRS → RS дважды (vol ratio = 0.5, bbox diff = 1.93). Фикс: `mirrorObject` CSG — прямое зеркало vertices (`mirrorVerticesInPlace`), `transform = mirrorTransform`, `PIVOT-TRANSFORMA srcCom-shift` убран. Инвариант `world' = M·world`. | **HIGH** | ✅ **Исправлено** (v1.2.3) |

### Экономика и Яндекс.Игры (ветка `yandex-games`)

| # | Проблема | Приоритет | Статус |
|---|----------|-----------|--------|
| **P0-1** | Анти-фарм кэшбэка не работает: хэш модели не проверяется, повторный экспорт той же модели даёт повторный кэшбэк (`economy-store.ts:1052`, `document-store.ts:1047`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `calculateAndClaimCashback(scan, hash?)` + `todayExportHashes[]`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-2** | Expiry аренд/подписок и кулдауны по локальному `Date.now()` — перевод часов продлевает доступ (§5) (`economy-store.ts:478,488,518,529,537`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `serverTimeNow()`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-3** | `syncToCloud` теряет обновления при `pendingSync=true` — потерянные начисления (`economy-store.ts:789`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `syncTailPending`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-4** | `lastSavedData` не в `partialize` — облако может быть перезаписано старыми данными (`economy-store.ts:841`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `lastSavedData` в `partialize` + `loadFromCloud`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-5** | Вся экономика client-side: правка localStorage = неограниченные токены/подписки (`economy-store.ts:244`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `sanitizeEconomyData()`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **P0-6** | Clean-фолбэк SDK: экономика остаётся активной при падении `yandex.init()`, заработок невозможен (`platform/index.ts:10`, `platform/yandex.ts:29`) | **CRITICAL** | ✅ ИСПРАВЛЕНО (2026-09-11) — `isEconomyAvailable()`; отчёт: `docs/ECONOMY_CODE_REVIEW.md` |
| **U10** | SDK инициализируется ПОСЛЕ доступности игры — React-дерево рендерится до `initSdk()` (`main.tsx`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-12) — сплэш → `initSdk()` (таймаут 10с → clean) → рендер; `LoadingAPI.ready()` по факту готовности (workerOk + initDone), fallback 15с убран; `GameplayAPI.start()` через `getInitDonePromise()` |
| **U2** | UI-таймеры кулдауна рекламы «стоят на месте» до обновления кэша 30с (`PropertiesPanel.tsx`, `EconomyMiniHUD.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-12) — `useAdCooldown()`/`getAdCooldownRemainingMs()` (`platform/ad-timers.ts`); посекундный тик с поправкой на серверное смещение; fallback `Date.now()` не кэшируется (P2-5) |
| **U1/U9** | Единый кулдаун 5 мин и единый счётчик rewarded-рекламы на все награды; нужны раздельные по видам (`economy-store.ts`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-12) — `adRewards: Record<AdRewardKind, AdRewardState>` (кулдаун и лимит ≤3/день на каждый вид `tokens`/`import`/`banner`); миграция старых полей; persist v3 + облако; лимиты 705/350; ECONOMY.md v2.1 |
| **U4** | Нет бейджа у 3D-текста на панели фигур (условие по неверному типу `text3d`) (`LeftPanel.tsx`) | **P2** | ✅ ИСПРАВЛЕНО (2026-09-12) — сравнение по реальному типу `type:'text'` + `canUseText3dRO()` |
| **U5** | Баннер: повторное списание токенов/реклама после покупки скрытия (`EconomyBanner.tsx`, EconomyShop, PropertiesPanel) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-12, P0-1) — EconomyBanner подключён в App.tsx; все 3 точки продажи защищены при активной аренде `disableBanner` |
| **U6** | Нет простой палитры без аренды/подписки (`PropertiesPanel.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-12) — палитра Wad's Optimum 16 всегда; расширенный picker за аренду/подписку |
| **U7** | Мелкие иконки бейджей (`Badge.tsx`, `IconBadge.tsx`) | **P2** | ✅ ИСПРАВЛЕНО (2026-09-12) — иконки ×2 (10→20px / 16→20px), шрифты 16/13px |
| **U8** | Экспорт не выполняется после оплаты токенами/рекламы (`ExportModal.tsx`, `App.tsx`, `document-store.ts`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-12, P1-1) — единая модель кэшбэка `exportStl(method)`; цепочка оплата→скачивание восстановлена |
| **U3** | Панель экономики дублируется слева (магазин) и справа (`LeftPanel.tsx`, `PropertiesPanel.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-13) — «магазин» = правая панель (`PropertiesPanel` → `EconomyPanel`); вкладка `shop` и `EconomyShop.tsx` удалены; переходы «купить» = `clearSelection()` (экономика при пустом выделении); ECONOMY.md v2.2 (§6.3 — два места) |
| **A1** | Экспорт за рекламу: начислялись токены, файл не скачивался; счётчик общий с HUD (`ExportModal.tsx`, `economy-store.ts`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-14) — вид `export` + `watchAdForExport()` без начисления токенов, экспорт после onRewarded, свой кулдаун/лимит |
| **A2** | Импорт за рекламу: +50/ролик, file chooser после рекламы (нет user activation) (`ImportModal.tsx`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-14) — серия 2 роликов оплачивает импорт (без токенов), диалог ДО рекламы (`importStl(preSelectedFile?)`) |
| **B1** | Баннер-оффер не виден по умолчанию (`economy-store.ts`, `EconomyBanner.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-14) — `bannerVisible` init `true`, RO-геттер `shouldShowBannerRO()` |
| **B2** | Кнопка «3D-текст» disabled без доступа — нет перехода к аренде (`LeftPanel.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-14) — клик открывает правую панель через `setEconomyPanelOpen(true)` |
| **B3** | «Расширенный выбор» палитры закрывал панель свойств (`PropertiesPanel.tsx`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-14) — флаг `economyPanelOpen` (ui-store), EconomyPanel внутри панели, «← К свойствам» |
| **C1** | Бейджи увеличены в 2 раза целиком (регрессия U7) (`Badge.tsx`, `IconBadge.tsx`) | **P2** | ✅ ИСПРАВЛЕНО (2026-09-14) — компактный шрифт 10px/padding 1px 3px, иконки остаются 20×20 |
| **C2** | Токен-иконка = монета, нужен золотой куб (`Badge.tsx`, `IconBadge.tsx`) | **P2** | ✅ ИСПРАВЛЕНО (2026-09-14) — `TokenIcon` (золотой куб TC) вместо `MoneyIcon` |
| **C3** | Квест «Зазеркалье» молчит — проверка `scale < 0` не срабатывает (`economy-store.ts`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-14) — счёт по mirror-операциям истории + legacy `scale < 0`, порог «≥ target» |
| **UB-0a** | Экспорт STL: позиция применяется дважды (воркер запекает `transform` в вершины, `exportToStl` добавляет его снова) — фигуры «разлетаются» (`io/stl-export.ts`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-20, `4d64054`) — трансформ применяется к bbox-центрированной геометрии, как во вьюпорте + регрессионный тест. Портировано на `main` (2026-09-26, `15ffa86`) (`docs/USER_FEEDBACK_EXPORT.md`) |
| **UB-0b** | `handleRebuildScene` не восстанавливает baked-меш `import_mesh` → импортированная геометрия исчезает после undo/redo/загрузки (`csg/worker-handlers.ts`, `store/rebuild.ts`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-20, `4d64054`) — восстановление меша в manifold-кэш + клиентский фолбэк; тесты `store/rebuild-baked.test.ts` (T1). Портировано на `main` (`15ffa86`) |
| **UB-0d** | `.doodle` с импортами сохранялся, но не открывался: лимит `model.json` 5 МБ + TypedArray сериализуется объектом `{"0":…}` (`io/doodle-io.ts`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-20, `4d64054`) — лимит 64 МБ + `typedArrayReplacer` + `text3d` в `VALID_OP_TYPES` + round-trip тест. Портировано на `main` (`15ffa86`) |
| **UB-0-T1** | Путь «импорт → сохранить → загрузить → геометрия на месте» не покрыт тестами ни на одной ветке | **P1** | ✅ ЗАКРЫТО (2026-09-26, `8a184d3`) — регрессия UB-0a, лимит треугольников (E1), UTF-8 заголовок (E2), round-trip `import_mesh` через `serializeDoodle → parseDoodle`, `store/rebuild-baked.test.ts` (4 теста, воркер моканут). На `main` — те же тесты (`15ffa86`) |
| **UB-0-E1** | `MAX_TRIANGLES` урезал буфер и count в заголовке, но не цикл записи → `RangeError` либо файл с недостоверным числом треугольников (`io/stl-export.ts`) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-26, `8a184d3`) — `StlTooLargeError` до выделения буфера, лимит в параметре `exportToStl(objects, maxTriangles)`. Портировано на `main` (`15ffa86`) |
| **UB-0-E1b** | `exportStl` без `try/catch` — ошибка сериализации молча (без `notify`) из обработчика клика (`store/document-store.ts`) | **P1** | ✅ ИСПРАВЛЕНО — на `yandex-games` Blob + `try/catch` + `notify` (P2-6, `8a184d3` — показ локализованного сообщения `StlTooLargeError`); на `main` исправлено тем же портом (`15ffa86`) |
| **UB-0-E2** | STL-заголовок писался побайтно через `charCodeAt` — кириллица ru-локали обрезалась по младшему байту (`io/stl-export.ts`) | **P2** | ✅ ИСПРАВЛЕНО — на `yandex-games` UTF-8 через `TextEncoder` подтянулось в `4d64054`; на `main` — порт (`15ffa86`) + тест декодирования заголовка |
| **UB-0-E3** | Нормали: в STL пишутся нормали примитива вместо пересчитанных по трансформу — риск расхождения с слайсерами (`io/stl-export.ts`) | **P3** | 🔲 ОТКРЫТО — не подтверждено на реальных файлах, требуется прогон в слайсере (`docs/USER_FEEDBACK_EXPORT.md`, вопрос 5) |
| **UB-0-N1** | Нет импорта OBJ (только `.stl`) (`io/stl-import.ts:64`) | **P3** | 🔲 ОТКРЫТО — новая функциональность, вне рамок отзыва |
| **UB3-1** | Дневной счётчик `(N/3)` реварда импорта считает показы рекламы, а не оплаченные импорты → после 1 импорта `(2/3)` и кнопка гаснет: рекламой оплачивается 1 импорт/сутки вместо 3 (`economy-store.ts:82-92, 866-915`, `economy-config.ts:84`, `ImportModal.tsx:148`) | **P1** | 🔲 ОТКРЫТО (2026-09-23) — нужен счётчик операций `opsToday` + per-kind лимит (3 импорта = до 6 показов), persist v5 + облако + ECONOMY.md v2.5. Регрессия UB2-2 (`docs/USER_FEEDBACK_UB3.md`) |
| **UB3-2** | Мелкие иконки экономической панели (14–20px); кнопки «токены/ревард» в строке «Отключение баннера» не влезают по ширине (`PropertiesPanel.tsx:158-196, 323-354`) | **P1** | 🔲 ОТКРЫТО (2026-09-23) — увеличить по фиксированным размерам (ECONOMY.md §6.4), кнопки вертикально. Продолжение UB2-3b (`docs/USER_FEEDBACK_UB3.md`) |
| **UB3-3** | Нет способа выдать токены в дебаг-режиме: URL-параметры не читаются (`?debug-mode=16`/`?draft=true` — параметры консоли Яндекса), старт `tokens: 0`, localStorage перебивается `loadFromCloud()` (`economy-store.ts:658`, `App.tsx:233`) | **P1** | 🔲 ОТКРЫТО (2026-09-23) — предложен разовый debug-grant 3000 TC после `loadFromCloud()` с gating (`import.meta.env.DEV`/параметр), в проде no-op (`docs/USER_FEEDBACK_UB3.md`) |
| **UB3-4** | Бейджи на кнопках «Экспорт»/«Импорт» перекрывают кнопки — просит убрать заливку (`Toolbar.tsx:168-176`, `Badge.tsx:34, 47-77`) | **P2** | 🔲 ОТКРЫТО (2026-09-23) — прозрачный фон + тень текста, решить область применения (`docs/USER_FEEDBACK_UB3.md`) |
| **UB3-5** | После получения бонуса в панели висит «уже получено» без привязки и без срока сброса (`PropertiesPanel.tsx:179-181`) | **P2** | 🔲 ОТКРЫТО (2026-09-23) — иконка подарка + тикающий `ч:мм:сс` до сброса (новый `useDailyReset` в `platform/ad-timers.ts`) (`docs/USER_FEEDBACK_UB3.md`) |
| **UB4-1** | Покупка «Отключение баннера» за токены скрывала только наш UI-оффер (`bannerVisible`), платформенный sticky-баннер Яндекс оставался на экране — эффект за 50 TC не был виден; `platform.init()` при каждой перезагрузке звал `showBannerAdv()` безусловно (`economy-store.ts`, `platform/yandex.ts:64-72`, `App.tsx`) | **P0** | ✅ ИСПРАВЛЕНО (2026-09-27) — единая точка `setPlatformBannerVisible()` + `syncPlatformBanner()` (аренда/подписка → `hideBannerAdv()`, иначе → `showBannerAdv()`), вызовы при покупке аренды/подписки, при старте после `loadFromCloud()` и при возврате оффера в `refreshDayRollover()`; +7 тестов (`docs/USER_FEEDBACK_UB4.md`) |
| **UB4-2** | Платформа может сама перепоказать sticky-баннер при снятой рекламе (в логе — `adv2_show` после `onAdLoadFailed`), сторожа нет | **P1** | 🔲 ОТКРЫТО (2026-09-27) — периодическая сверка `getBannerAdvStatus()` + повторный `hideBannerAdv()` только при подтверждённом поведении SDK (`docs/USER_FEEDBACK_UB4.md`) |
| **UB5-1** | При активной Pro-подписке раздел «Аренда» продолжает продавать `text3d`/`extendedPalette`/`disableBanner` и списывает токены за уже выданное подпиской (`economy-store.ts:1237-1273` — проверка только баланса, `PropertiesPanel.tsx:296-373` — `isActive` без учёта подписки) | **P1** | ✅ ИСПРАВЛЕНО (2026-09-29) — гейт `hasActiveSubscription` в начале `buyRental` (`economy-store.ts`), статус «Входит в Pro» + i18n-ключ `rental.includedInPro` + модалка не открывается (`PropertiesPanel.tsx`); тесты: 4 store (`economy-store.test.ts:192+`) + 2 UI (`PropertiesPanel.test.tsx:143+`) |
| **UB5-2** | Правая панель 200px — иконки/кнопки экономики не влезают (продолжение UB3-2), просит ×1,2 | **P2** | ✅ ИСПРАВЛЕНО (2026-09-29) — `.panel-right { width: 240px }` (`App.css:772-782`, `flex-shrink: 0` сохранён); @media-правил в `App.css` нет вообще, отдельных `max-width` у панели тоже (`docs/USER_FEEDBACK_UB5.md`) |
| **UB5-3** | У вкладки «Список» нет внутреннего скролла, в отличие от «Дерево»: `.object-list` без `max-height`/`overflow-y` (`App.css:456-462`) против `.ct-list` (`App.css:987-996`) | **P3** | ✅ ИСПРАВЛЕНО (2026-09-29) — `.object-list`: `max-height: 240px` + `overflow-y: auto` + тонкий скроллбар как у `.ct-list` (`App.css:459-469`, `docs/USER_FEEDBACK_UB5.md`) |

> Ревью экономики (22 проблемы: 6 P0 / 9 P1 / 7 P2) **закрыто 2026-09-11** — все проблемы исправлены (typecheck 0 ошибок, 299/299 тестов). P1/P2 не вносились в эту таблицу отдельно — полный перечень и статусы: [`docs/ECONOMY_CODE_REVIEW.md`](docs/ECONOMY_CODE_REVIEW.md), [`CODE_REVIEW.md`](CODE_REVIEW.md).
>
> **Реестр отзыва пользователя U1–U10 закрыт 2026-09-13** — все 10 проблем исправлено (U3: «магазин» = правая панель, ECONOMY.md v2.2). Проверка: `pnpm verify` — typecheck 0 ошибок, **336/336 тестов (23 файла)**, build/build:yandex успешны. Детали: [`docs/USER_FEEDBACK_ECONOMY.md`](docs/USER_FEEDBACK_ECONOMY.md), [`CHANGELOG.md`](CHANGELOG.md).
>
> **Регрессии A/B/C закрыты 2026-09-14** — платные сценарии (экспорт/импорт за рекламу), UI-переходы (баннер, 3D-текст, палитра), бейджи/квест (компактные бейджи, токен-куб, зеркала). Полный `pnpm verify` ПОСЛЕ всех правок: typecheck 0 ошибок, **357/357 тестов (23 файла)**, build/build:yandex успешны. ECONOMY.md обновлён до **v2.3** (§2 — 4 вида рекламы, максимум дня 405 TC). Детали: [`docs/USER_FEEDBACK_ECONOMY.md`](docs/USER_FEEDBACK_ECONOMY.md), [`CHANGELOG.md`](CHANGELOG.md), [`CODE_REVIEW.md`](CODE_REVIEW.md).
>
> **Реестр по экспорту/сохранению ЗАКРЫТ 2026-09-26** (`docs/USER_FEEDBACK_EXPORT.md`): UB-0a/0b/0d исправлены на `yandex-games` (`4d64054`) и портированы на `main` (`15ffa86`) вместе с E1/E1b/E2 и тестами T1. Открыты только P3: E3 (нормали в STL — нужен прогон в слайсере) и N1 (нет импорта OBJ).
>
> **Реестр UB2 закрыт 2026-09-23** (`docs/USER_FEEDBACK_UB2.md`): квесты (`addShape` → `evaluateQuestsAfterMutation`), подпись реварда импорта, русская подпись палитры, иконки/бейджи, рёбра фигур, расширенные тултипы экономики. Проверка: `pnpm verify` — typecheck 0 ошибок, **393/393 тестов (26 файлов)**, build/build:yandex успешны. ECONOMY.md обновлён до **v2.4**.
>
> **Реестр UB3 открыт 2026-09-23** (`docs/USER_FEEDBACK_UB3.md`): 5 пунктов нового прогона (пользователь повторно нумеровал их как `UB2-*`) — счётчик реварда импорта (1 вместо 3 импортов/сутки), иконки панели + раскладка кнопок «токены/ревард», debug-выдача 3000 TC, заливка бейджей на тулбаре, таймер вместо «уже получено». Правки не вносились — см. строки UB3-1…UB3-5 в таблице выше.
>
> **Реестр UB5 ЗАКРЫТ 2026-09-29** (`docs/USER_FEEDBACK_UB5.md`): 3 пункта прогона на Яндекс Играх — покупка аренды (3D-текст/палитра/баннер) была доступны и списывала токены при активной Pro-подписке, которая эти фичи уже даёт (UB5-1, P1 → гейт в `buyRental` + статус «Входит в Pro» + i18n + 6 тестов); правая панель расширена ×1,2 200 → 240px (UB5-2); у вкладки «Список» появился внутренний скролл как у «Дерево» (UB5-3). Статусы — в таблице выше.
>
> Все ранее исправленные проблемы см. в [`CHANGELOG.md`](CHANGELOG.md).

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

## Фаза 7.6 — Mirror Pipeline Performance ✅ ЗАВЕРШЕНО

**Дата завершения:** 2026-08-07
**Цель:** Устранить дублирование вычислений и sync-вызовов в pipeline зеркала.

### 7.6.1 — Кэш previewMirror → mirrorSelected ✅
- `previewMirror` сохраняет результаты `mirrorObject` в `mirrorCache`
- `mirrorSelected` проверяет кэш по ключу `plane + ids + transformHash`
- При совпадении — skip full tree rebuild, использовать закэшированные результаты
- **Результат:** Confirm не пересчитывает геометрию, мгновенный отклик

### 7.6.2 — Epsilon-фильтр moveObject + Cache sync skip ✅
- `moveObject` пропускает вызовы с delta < 1e-6 по всем 9 параметрам (position + rotation + scale)
- `previewMirror` проверяет кэш перед `syncObjectsForOperation` — skip sync при hover без изменений
- `invalidateMirrorCache()` вызывается в 14 мутирующих методах
- **Результат:** 0 дублирующих history-записей, 0 лишних sync-при hover

---

## Команды

```bash
pnpm dev          # Dev-сервер (порт 5000)
pnpm build        # Production-сборка
pnpm test         # Запуск тестов (~236 тестов)
pnpm typecheck    # tsc --noEmit
