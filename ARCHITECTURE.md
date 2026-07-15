# Архитектура TinkerCraft Web

> Описание высокоуровневой архитектуры, потоков данных и ключевых решений.

---

## Обзор

TinkerCraft — браузерный 3D CAD-редактор. Пользователь создаёт 3D-модели из примитивов,
применяет булевы операции (CSG), скругления, трансформации — и экспортирует результат в STL
для 3D-печати. Все CSG-вычисления выполняются в Web Worker через manifold-3d (WASM),
чтобы не блокировать UI.

---

## Поток данных

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌──────────────┐
│  User Input │───▶│   App.tsx (UI)   │───▶│ document-store  │───▶│ worker-client│
│  (mouse,    │    │  тулбар, панели, │    │  (Zustand)      │    │  (Promise    │
│   keyboard) │    │  модалки         │    │  history[]      │    │   RPC)       │
└─────────────┘    └────────┬─────────┘    └────────┬────────┘    └──────┬───────┘
                            │                       │                    │
                            ▼                       ▼                    ▼
                   ┌─────────────────┐    ┌──────────────┐    ┌──────────────┐
                   │  Viewport3D.tsx │    │  IndexedDB   │    │  worker.ts   │
                   │  Three.js render│    │  autosave    │    │  manifold-3d │
                   │  гизмо, raycast │    │  projects    │    │  (WASM CSG)  │
                   └─────────────────┘    └──────────────┘    └──────────────┘
```

### Пошагово

1. **Пользователь** кликает в UI (тулбар, панель свойств, вьюпорт)
2. **App.tsx** вызывает action из `document-store.ts`
3. **Store** добавляет операцию в `history[]`, вызывает `rebuildFromHistory()`
4. **rebuildFromHistory()** отправляет операции в `worker-client.ts` (Promise RPC)
5. **Worker** выполняет manifold-3d операции (build, union, subtract, fillet...)
6. **Worker** возвращает mesh (vertices + indices)
7. **Store** центрирует CSG-результаты через `extractAndCenter()`
8. **Viewport3D** обновляет Three.js меши

---

## Слои

### 1. UI Layer — `App.tsx` + `components/`

React-компоненты. Тулбар, панель свойств, модалки, ComponentTree, Viewport3D, ViewCube.

**Правило:** UI только вызывает store actions. Никаких прямых вызовов воркера.

### 2. State Layer — `store/document-store.ts`

Zustand store. Содержит:
- `objects: SceneObject[]` — текущая сцена
- `history: Operation[]` — история операций (undo/redo)
- `selectedIds: string[]` — выделенные объекты
- Actions: `addShape`, `csgBoolean`, `applyFillet`, `moveObject`, `undo`, `redo` и др.

**Правило:** Store — единственный источник истины. Все мутации идут через actions.

### 3. CSG Layer — `csg/worker.ts` + `csg/worker-client.ts`

Web Worker с manifold-3d (WASM). Воркер кэширует manifold-объекты по `id` (Map).

**worker-client.ts** — типобезопасный RPC: отправляет сообщения, возвращает Promise.

**worker.ts** — обрабатывает сообщения: `buildShape`, `csgOp`, `applyFillet`, `rebuildScene`.

**Правило:** Worker НЕ центрирует геометрию. Центрирование — ответственность store.

### 4. I/O Layer — `io/`

Импорт/экспорт файлов:
- `stl-import.ts` — бинарный + ASCII STL, `mergeCoincidentVertices()`
- `stl-export.ts` — бинарный STL
- `doodle-io.ts` — ZIP + JSON (.doodle формат, совместим с Java-оригиналом)
- `autosave.ts` — IndexedDB автосохранение
- `project-manager.ts` — IndexedDB CRUD для проектов

---

## Ключевые архитектурные решения

### CSG в Web Worker

manifold-3d — WASM-библиотека. CSG-операции (union, subtract) могут занимать 100+ мс.
Выполнение в Web Worker не блокирует UI. Для SharedArrayBuffer (требуется manifold-3d)
нужны COOP/COEP заголовки — настроены в `vite.config.ts`.

### Кэш объектов в воркере

Воркер хранит `Map<string, ManifoldObject>` по `id`. При `rebuildScene()` воркер
переиспользует кэшированные объекты и пересчитывает только изменённые. Это ускоряет
undo/redo, но требует очистки кэша при удалении объектов.

### Центрирование CSG-результатов

CSG-результаты от manifold-3d имеют смещённый bbox. Store применяет `extractAndCenter()`:
вычисляет bbox-центр, сдвигает вершины к нулю, сохраняет центр как `transform.x/y/z`.
Viewport3D `centerGeometry()` центрирует обычные примитивы. Для CSG-результатов это
безвредный no-op. `cachedRawVertices` предотвращает повторное центрирование.

### История операций (undo/redo)

`history[]` — массив операций (AddShape, Move, CSG, Fillet, Mirror...).
Undo/redo = полный rebuild через `rebuildFromHistory()`. Нет кэша snapshots (PERF-1 — отложено).
Фильтрация: некоторые операции (выделение) не попадают в историю.

### Toast вместо alert

`alert()` блокирует главный поток. `notify(msg, type)` из `store/notifications.ts`
показывает toast с авто-dismiss через 5 секунд. Используется для всех ошибок.

### Валидация ввода

`sanitizeParams(params)` фильтрует нечисловые значения, клампит к ±1e6.
`clamp(v, min, max)` возвращает min для NaN/Infinity. Применяется перед отправкой в воркер.

---

## Типы данных

### SceneObject

```typescript
interface SceneObject {
  id: string;
  name: string;
  shapeType: ShapeType;          // 'cube' | 'sphere' | 'cylinder' | ...
  params: Record<string, number>; // width, height, radius, ...
  transform: TransformNR;         // position, rotation, scale
  vertices: number[];             // flat array [x,y,z, x,y,z, ...]
  indices: number[];              // triangle indices
  visible: boolean;
  color: string;
  filletRadius?: number;
  isCSG?: boolean;                // результат булевой операции
}
```

### Operation

```typescript
type Operation =
  | { type: 'addShape'; id: string; shapeType: ShapeType; params; transform; name }
  | { type: 'csg'; id: string; operands: string[]; op: 'union' | 'subtract' | 'intersect' }
  | { type: 'fillet'; id: string; radius: number }
  | { type: 'move'; id: string; dx; dy; dz }
  | { type: 'mirror'; id: string; axis: 'x' | 'y' | 'z' }
  | ...
```

---

## Производительность

| Операция | Сложность | Время (типично) |
|---|---|---|
| Добавление примитива | O(1) | < 5 мс |
| CSG Union (2 объекта) | O(n log n) | 10–50 мс |
| Undo/Redo (10 операций) | O(n) rebuild | 50–200 мс |
| STL-экспорт (1000 треугольников) | O(n) | < 10 мс |

### Узкие места

- **Undo/redo** — полный rebuild. При 50+ операциях замедляется. Решение: кэш snapshots (PERF-1).
- **`App.tsx` рендер** — 1809 строк, много derived state. Решение: разделение на компоненты (CRIT-1).
