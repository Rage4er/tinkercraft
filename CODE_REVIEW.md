# 🔍 Код-ревью: TinkerCraft Web

**Дата:** 2025-07-15  
**Ревьюер:** Koda AI  
**Версия проекта:** 0.0.1  
**Стек:** React 18 + TypeScript 5.7 + Three.js 0.170 + Zustand 5 + manifold-3d (WASM) + Vite 6 + pnpm

---

## 📊 Сводка

| Категория | Оценка | Комментарий |
|---|---|---|
| **Архитектура** | ⭐⭐⭐⭐☆ | Чёткое разделение: Worker → Store → Components |
| **Читаемость** | ⭐⭐⭐⭐☆ | Хорошая структура файлов, но App.tsx перегружен |
| **Сопровождаемость** | ⭐⭐⭐☆☆ | `App.tsx` — 1805 строк, store — 749 строк |
| **Надёжность** | ⭐⭐⭐☆☆ | Есть несколько потенциальных багов |
| **Производительность** | ⭐⭐⭐☆☆ | Undo/redo = полный rebuild, нет кэширования AABB |
| **Безопасность** | ⭐⭐☆☆☆ | `any`-типы в воркере, нет валидации, `alert()` |
| **Тестирование** | ⭐⭐☆☆☆ | Только type-level тесты, 0 unit-тестов логики |
| **Общий балл** | **3.1 / 5** | Хорошая основа, требуется рефакторинг |

---

## 📁 Обзор файлов

| Файл | Строк | Назначение |
|---|---|---|
| `src/App.tsx` | 1805 | Главный компонент, тулбар, свойства, модалки |
| `src/store/document-store.ts` | 749 | Zustand store — все действия и логика |
| `src/components/Viewport3D.tsx` | 803 | Three.js вьюпорт, гизмо, raycaster |
| `src/csg/worker.ts` | 707 | WASM worker — manifold-3d операции |
| `src/csg/worker-client.ts` | 133 | Promise-обёртка над воркером |
| `src/csg/types.ts` | 148 | Типы операций, сцены, параметров |
| `src/csg/engine.ts` | 198 | Устаревший синхронный движок (не используется) |
| `src/components/ViewCube.tsx` | 306 | Навигационный куб |
| `src/components/ComponentTree.tsx` | 110 | Дерево объектов сцены |
| `src/components/ProjectManagerModal.tsx` | 130 | Диалог управления проектами |
| `src/components/ErrorBoundary.tsx` | 31 | React error boundary |
| `src/components/WebGLFallback.tsx` | 19 | Fallback при отсутствии WebGL |
| `src/io/doodle-io.ts` | 107 | Формат .doodle (ZIP + JSON) |
| `src/io/stl-export.ts` | 87 | Экспорт в бинарный STL |
| `src/io/stl-import.ts` | 81 | Импорт STL (бинарный + ASCII) |
| `src/io/autosave.ts` | 75 | Автосохранение в IndexedDB |
| `src/io/project-manager.ts` | 123 | Менеджер проектов в IndexedDB |
| `src/io/project-manager.test.ts` | — | Тесты менеджера проектов |
| `src/csg/types.test.ts` | 112 | Type-level тесты |
| `vite.config.ts` | 34 | Конфигурация Vite |
| `tsconfig.json` | 20 | Конфигурация TypeScript |
| `package.json` | 32 | Зависимости и скрипты |

**Итого:** ~15 файлов исходного кода, ~6 500 строк.

---

## 🔴 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### CRIT-1. `App.tsx` — God Component (1805 строк)

**Где:** `src/App.tsx`  
**Приоритет:** 🔴 Высокий

**Описание:** Один React-компонент содержит всю UI-логику: тулбар, палитру фигур, список объектов, таймлайн, панель свойств, модалки, обработчики клавиатуры, вспомогательные функции (`NumInput`, `Section`, `Timeline`, `opIcon`, `opLabel`).

**Почему это проблема:**
- Невозможно редактировать одну секцию, не затрагивая остальные
- `useEffect` для клавиатуры (строка 391) зависит от ~15 функций, что вызывает постоянные переподключения обработчика
- `useCallback` создаётся множество раз при каждом рендере
- Тестирование одного UI-блока требует рендера всего компонента

**Рекомендуемое разделение:**

```
src/components/
  ├── App.tsx                     → 80 строк (layout + state management)
  ├── Toolbar.tsx                 → тулбар (файл, undo, view, gizmo, tools)
  ├── ShapePalette.tsx            → палитра фигур + поиск
  ├── ObjectList.tsx              → список объектов в левой панели
  ├── ComponentTree.tsx           → уже есть ✅
  ├── Timeline.tsx                → история операций
  ├── PropertiesPanel.tsx         → панель свойств (справа)
  ├── TransformControls.tsx       → Move/Rotate/Scale оси в свойствах
  ├── CsgPanel.tsx                → CSG-операции и выравнивание
  ├── MirrorPanel.tsx             → зеркалирование
  ├── ExtrudePanel.tsx            → выдавливание
  ├── TextModal.tsx               → модалка 3D текста
  └── StatusBar.tsx               → статус-бар внизу
```

**Пример рефакторинга `Toolbar.tsx`:**

```typescript
// src/components/Toolbar.tsx
interface ToolbarProps {
  fileName: string | null;
  modified: boolean;
  busy: boolean;
  objectCount: number;
  selectedCount: number;
  canUndo: boolean;
  canRedo: boolean;
  hasCopied: boolean;
  workerOk: boolean;
  cameraMode: 'perspective' | 'orthographic';
  gizmoMode: GizmoMode;
  rulerActive: boolean;
  snapValue: number;
  // Actions
  onOpen: () => void;
  onSave: () => void;
  onExportStl: () => void;
  onImportStl: () => void;
  // ... и т.д.
}

export default function Toolbar({ fileName, modified, busy, ... }: ToolbarProps) {
  const titleSuffix = fileName
    ? ` — ${fileName}${modified ? " •" : ""}`
    : modified
      ? " — без имени •"
      : "";

  return (
    <div className="toolbar">
      <span className="toolbar-logo">⬛ TinkerCraft{titleSuffix}</span>
      {/* Файл */}
      <div className="toolbar-group">
        <button className="btn" onClick={onOpen}>📂 Открыть</button>
        <button className="btn" onClick={onSave}>💾 Сохранить</button>
        {/* ... */}
      </div>
      {/* ... */}
    </div>
  );
}
```

---

### CRIT-2. `document-store.ts` — 749 строк, все действия в одном месте

**Где:** `src/store/document-store.ts`  
**Приоритет:** 🔴 Высокий

**Описание:** Все действия (addShape, importStl, csgBoolean, undo, redo, move, resize, extrude, mirror, align, fillet, copy/paste, autosave, projects) смешаны в одном `create<DocumentStore>()`.

**Почему это проблема:**
- Невозможно отладить конкретное действие, не пролистывая 749 строк
- Нарушает принцип единой ответственности (SRP)
- Функции `addShape`, `importStl`, `pasteClipboard` содержат ~90% одинакового паттерна (set busy → async worker → set results)

**Рекомендуемая структура:**

```
src/store/
  ├── document-store.ts       → только create<DocumentStore>() с делегированием
  ├── actions/
  │   ├── addShape.ts
  │   ├── importStl.ts
  │   ├── csgBoolean.ts
  │   ├── transform.ts        → move, resize, extrude
  │   ├── history.ts          → undo, redo, jumpToHistory
  │   ├── file-io.ts          → save, load, autosave
  │   └── clipboard.ts        → copy, paste
```

**Пример вынесения `addShape` в отдельный модуль:**

```typescript
// src/store/actions/addShape.ts
import type { DocumentStore, AddShapeOperation, ShapeType, ShapeParams } from '../types';
import { workerBuildShape } from '../../csg/worker-client';

export function createAddShape(
  get: DocumentStore['getState'],
  set: DocumentStore['setState'],
  nextId: (prefix: string) => string,
  colorForIndex: (n: number) => string,
): DocumentStore['addShape'] {
  return async (shapeType, params) => {
    const { objects, operations, historyIndex } = get();
    const idx = Object.keys(objects).length;
    const id = nextId('obj');
    const transform: TransformNR = {
      x: idx * 25, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    };
    const color = colorForIndex(idx);
    const defaultParams: ShapeParams = /* ... */;
    const finalParams = params ?? defaultParams;
    const op: AddShapeOperation = { type: 'add_shape', id, shapeType, params: finalParams, color, transform };

    set({ busy: true });
    try {
      const t0 = performance.now();
      const mesh = await workerBuildShape(id, shapeType, finalParams, transform);
      const ms = performance.now() - t0;
      const obj: SceneObject = { id, shapeType, params: finalParams, color, transform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices };
      const newOps = [...operations.slice(0, historyIndex), op];
      set({
        operations: newOps,
        historyIndex: newOps.length,
        objects: { ...objects, [id]: obj },
        modified: true,
        busy: false,
        lastCsgMs: ms,
      });
    } catch (e) {
      set({ busy: false });
      console.error('addShape:', e);
    }
  };
}
```

---

### CRIT-3. Дублирование центрирования геометрии в `Viewport3D.tsx`

**Где:** `src/components/Viewport3D.tsx`, строки 59-74 и 687-693  
**Приоритет:** 🔴 Высокий

**Описание:** Геометрия центрируется дважды — один раз при создании меша (`centerGeometry`) и снова при обновлении (`sync effect`).

```typescript
// Строка 59-74: centerGeometry при создании
function centerGeometry(mesh: THREE.Mesh, objectId: string): THREE.Object3D {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox!;
  const center = new THREE.Vector3();
  box.getCenter(center);
  mesh.geometry.translate(-center.x, -center.y, -center.z); // <── смещение
  // ...
}

// Строка 687-693: повторное центрирование при обновлении
if (vertsChanged) {
  existing.mesh.geometry.translate(-center.x, -center.y, -center.z); // <── двойное смещение!
}
```

**Почему это проблема:** Worker уже центрирует CSG-результат через `extractAndCenter()`. При обновлении `vertsChanged` будет `true` только если данные изменились. Если worker вернул уже центрированные вершины, а мы снова центрируем — геометрия смещается в (0,0,0) второй раз. Это приводит к тому, что CSG-объекты "прыгают" при повторных операциях.

**Решение:** Убрать центрирование из `centerGeometry()` — пусть воркер возвращает уже центрированную геометрию, а `Viewport3D` только применяет `obj.transform`.

---

## 🟡 ВАЖНЫЕ ПРОБЛЕМЫ

### WARN-1. Keyboard shortcuts — нестабильный `useEffect`

**Где:** `src/App.tsx`, строка 391-466  
**Приоритет:** 🟡 Средний

**Описание:** Обработчик клавиатуры пересоздаётся при каждом рендере из-за зависимостей `objects`, `deleteSelected`, `moveObject` и т.д.

```typescript
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    // ...
    deleteSelected();  // пересоздаётся каждый рендер
    moveObject(id, t); // пересоздаётся каждый рендер
    // ...
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [
  objects,              // объект — меняется при каждой операции
  deleteSelected,       // callback — пересоздаётся
  undo, redo,           // и т.д.
  selectObjects,
  saveDoodle, openDoodle,
  clearSelection,
  copySelected, pasteClipboard,
]);
```

**Решение:** Использовать `useRef` для доступа к актуальным значениям:

```typescript
const stateRef = useRef({
  objects: get().objects,
  deleteSelected: get().deleteSelected,
  undo: get().undo,
  // ...
});
useSyncExternalStoreWithSelector(subscribe, getState, () => ({}), (s) => s);

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      stateRef.current.deleteSelected();
    }
    // ...
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, []); // стабильный эффект — ни разу не переподключится
```

---

### WARN-2. `useEffect` восстановления автосохранения — подавление lint

**Где:** `src/App.tsx`, строка 371-376  
**Приоритет:** 🟡 Средний

```typescript
useEffect(() => {
  restoreAutosave().then((ok) => {
    if (ok) setRestoreMsg(false);
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

**Проблема:** `eslint-disable` скрывает реальную проблему. `restoreAutosave` — асинхронная функция из стора, `setRestoreMsg` — setter состояния. Оба должны быть в зависимостях.

**Решение:**

```typescript
const triggerRestore = useCallback(async () => {
  const ok = await restoreAutosave();
  if (ok) setRestoreMsg(false);
}, [restoreAutosave, setRestoreMsg]);

useEffect(() => {
  triggerRestore();
}, [triggerRestore]);
```

---

### WARN-3. Дублирование инструментов в тулбаре и панели свойств

**Где:** `src/App.tsx`, тулбар (строки 943-1038) vs панель свойств (строки 1578-1689)  
**Приоритет:** 🟡 Средний

**Описание:** Кнопки зеркало, выравнивание и CSG продублированы в двух местах с одинаковой логикой.

**Решение:** Вынести в переиспользуемые компоненты:

```typescript
// src/components/MirrorPanel.tsx
interface MirrorPanelProps {
  disabled: boolean;
  onMirror: (plane: 'XY' | 'XZ' | 'YZ') => void;
  compact?: boolean;
}
```

---

### WARN-4. `type M = any` в `worker.ts`

**Где:** `src/csg/worker.ts`, строка 7  
**Приоритет:** 🟡 Средний

**Описание:** Весь WASM-интерфейс типизирован как `any`. Любое изменение API manifold-3d будет обнаружено только во время выполнения.

**Решение:** Создать типовые обёртки:

```typescript
interface ManifoldMesh {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: ArrayBuffer;
}

interface ManifoldObject {
  transform(matrix: number[]): ManifoldObject;
  add(other: ManifoldObject): ManifoldObject;
  subtract(other: ManifoldObject): ManifoldObject;
  intersect(other: ManifoldObject): ManifoldObject;
  getMesh(): ManifoldMesh;
  refine(recursions: number): ManifoldObject;
  warp(fn: (v: number[]) => void): ManifoldObject;
}

interface ManifoldAPI {
  cube(size: [number, number, number], center: boolean): ManifoldObject;
  sphere(radius: number, segments: number): ManifoldObject;
  cylinder(
    height: number,
    radiusTop: number,
    radiusBottom: number,
    segments: number,
    center: boolean,
  ): ManifoldObject;
  revolve(crossSection: CrossSection, segments: number): ManifoldObject;
}

interface CrossSection {
  circle(radius: number, segments: number): CrossSection;
  translate(offset: [number, number]): CrossSection;
}
```

---

### WARN-5. `engine.ts` — мёртвый код

**Где:** `src/csg/engine.ts`  
**Приоритет:** 🟡 Средний

**Описание:** Файл содержит синхронную реализацию CSG-движка (198 строк). Комментарий на строке 4 гласит "Фаза 1: перенос в Web Worker", но файл не был удалён после перехода на воркер.

**Решение:** Удалить файл.

---

### WARN-6. `exportStl` — вычисление нормалей для CSG-геометрии

**Где:** `src/io/stl-export.ts`, строка 46-53  
**Приоритет:** 🟡 Средний

**Описание:** Нормали вычисляются как cross product из вершин треугольника. Для CSG-результатов (где мануфолд-3d уже вернул нормализованный меш) это приводит к неточным нормалям, которые могут вызвать артефакты при 3D-печати.

**Решение:** Добавить поле `normals` в `SceneObject` и сохранять при каждом rebuild.

```typescript
// types.ts
export interface SceneObject {
  // ... существующие поля
  normals?: Float32Array;  // новый optional-поле
}

// worker.ts — extractMesh возвращает нормали
function extractMesh(manifold: M): {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  tris: number;
} {
  const mesh = manifold.getMesh();
  const numProp = mesh.numProp ?? 3;
  const raw: Float32Array = mesh.vertProperties;
  let vertices: Float32Array;
  let normals: Float32Array;

  if (numProp === 3) {
    vertices = new Float32Array(raw);
    normals = new Float32Array(vertices.length); // default: computed later
  } else {
    // numProp === 6: xyz + normal
    const count = raw.length / numProp;
    vertices = new Float32Array(count * 3);
    normals = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      vertices[i * 3]     = raw[i * numProp];
      vertices[i * 3 + 1] = raw[i * numProp + 1];
      vertices[i * 3 + 2] = raw[i * numProp + 2];
      normals[i * 3]      = raw[i * numProp + 3];
      normals[i * 3 + 1]  = raw[i * numProp + 4];
      normals[i * 3 + 2]  = raw[i * numProp + 5];
    }
  }
  const indices = new Uint32Array(mesh.triVerts);
  return { vertices, indices, normals, tris: indices.length / 3 };
}
```

---

### WARN-7. `selectedIds` как `Set<string>` vs `string[]`

**Где:** `src/store/document-store.ts` (строка 82) vs `src/components/Viewport3D.tsx` (строка 32)  
**Приоритет:** 🟡 Низкий

**Описание:** Store хранит `string[]`, но `Viewport3D` ожидает `Set<string>`. В `App.tsx` создаётся новый Set при каждом рендере: `const selSet = new Set(selectedIds)`.

**Решение:** Использовать `useMemo`:

```typescript
const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
```

Или привести типы в `Viewport3D`:

```typescript
interface Props {
  selectedIds: string[];  // вместо Set<string>
  // ...
}
// внутри компонента:
const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);
```

---

### WARN-8. `computeAABB` — O(n) без кэширования

**Где:** `src/store/document-store.ts`, строка 523  
**Приоритет:** 🟡 Низкий

**Описание:** `alignSelected` вычисляет AABB для каждого выбранного объекта через `computeAABB`, который обходит все вершины. Для CSG-мешей с миллионами треугольников это дорого.

**Решение:** Кэшировать AABB в `SceneObject`:

```typescript
// types.ts
export interface SceneObject {
  // ...
  aabb?: { min: Vec3; max: Vec3 };
}

// worker.ts — extractMesh возвращает AABB
function extractMesh(manifold: M): {
  vertices: Float32Array;
  indices: Uint32Array;
  aabb: { min: [number, number, number]; max: [number, number, number] };
  tris: number;
} {
  // ...
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i]   < minX) minX = vertices[i];   if (vertices[i]   > maxX) maxX = vertices[i];
    if (vertices[i+1] < minY) minY = vertices[i+1]; if (vertices[i+1] > maxY) maxY = vertices[i+1];
    if (vertices[i+2] < minZ) minZ = vertices[i+2]; if (vertices[i+2] > maxZ) maxZ = vertices[i+2];
  }
  return { vertices, indices, aabb: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }, tris };
}
```

---

## 🔒 БЕЗОПАСНОСТЬ

### SEC-1. Нет валидации входных данных

**Где:** `src/csg/worker.ts`, строки 262-268  
**Приоритет:** 🟡 Средний

**Описание:** Данные из воркера не валидируются. Злонамеренный пользователь может отправить `NaN`, `Infinity` или некорректные размеры.

**Решение:** Добавить валидацию на границах:

```typescript
function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function safeParams(params: Record<string, number>, defaults: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, def] of Object.entries(defaults)) {
    result[key] = clamp(params[key] ?? def, -1e6, 1e6);
  }
  return result;
}
```

### SEC-2. `alert()` для отображения ошибок

**Где:** `src/store/document-store.ts`, строки 323, 610  
**Приоритет:** 🟡 Низкий

**Описание:** `alert()` блокирует UI, не поддерживает тему приложения, и не локализуется.

**Решение:** Заменить на toast-уведомления:

```typescript
// store/notifications.ts
export function showNotification(message: string, type: 'error' | 'warning' | 'info') {
  // Добавить в Zustand store
  set({ notifications: [...get().notifications, { message, type, id: Date.now() }] });
}

// App.tsx — рендер toast-ов
{notifications.map(n => (
  <div key={n.id} className={`notification ${n.type}`}>
    {n.message}
  </div>
))}
```

---

## ⚡ ПРОИЗВОДИТЕЛЬНОСТЬ

### PERF-1. Undo/Redo = полный rebuild сцены через WASM

**Где:** `src/store/document-store.ts`, строки 555-591  
**Приоритет:** 🔴 Высокий

**Описание:** Каждое undo/redo пересчитывает **всю историю** через WASM-воркер. При 100 операциях с сложными CSG-булевыми это может занять несколько секунд.

```typescript
undo: async () => {
  const newObjects = await rebuildFromHistory(operations.slice(0, newIdx))
  // rebuildFromHistory вызывает workerRebuildScene, который проходит
  // все операции и пересоздаёт все меша
}
```

**Рекомендации:**

**Вариант A: Кэшировать объекты**
```typescript
// historyIndex → Snapshot
interface HistorySnapshot {
  objects: Record<string, SceneObject>;
  operations: TinkerCraftOperation[];
}
```

**Вариант B: Применение обратных операций**
```typescript
// Вместо пересбора с нуля — применить inverse(move) вместо undo
// move: pos += delta → undo: pos -= delta
// csgBoolean: objA + objB → result → undo: restore objA, objB
```

---

### PERF-2. `selectedIds` — `new Set()` при каждом рендере

**Где:** `src/App.tsx`, строка 526  
**Приоритет:** 🟢 Низкий

```typescript
const selSet = new Set(selectedIds);  // создаётся при каждом рендере
```

**Решение:** `useMemo`:

```typescript
const selSet = useMemo(() => new Set(selectedIds), [selectedIds]);
```

---

### PERF-3. `totalTris` — вычисляется при каждом рендере

**Где:** `src/App.tsx`, строка 528

```typescript
const totalTris = objectList.reduce((s, o) => s + o.indices.length / 3, 0);
```

**Решение:** `useMemo`:

```typescript
const totalTris = useMemo(
  () => objectList.reduce((s, o) => s + o.indices.length / 3, 0),
  [objectList]
);
```

---

## 🧪 ТЕСТИРОВАНИЕ

### TEST-1. Только type-level тесты

**Где:** `src/csg/types.test.ts`  
**Приоритет:** 🔴 Высокий

**Описание:** Все тесты проверяют **только типы**, а не логику. Ни одна функция не тестируется на корректность.

**Необходимые unit-тесты:**

| Модуль | Что тестировать |
|---|---|
| `stl-import.ts` | `mergeCoincidentVertices` — одинаковые вершины, разные порядки |
| `stl-export.ts` | `exportToStl` — бинарный формат, размер файла |
| `document-store.ts` | `extractAndCenter` — CSG-результат центрируется в (0,0,0) |
| `document-store.ts` | `computeAABB` — корректные min/max |
| `doodle-io.ts` | `parseDoodle` — валидный ZIP, повреждённый ZIP |
| `worker.ts` | `applySRAroundCenter` — матрица RS × T(-pos) |
| `autosave.ts` | `autosaveSession` + `restoreSession` — данные сохраняются и восстанавливаются |

**Пример теста для `mergeCoincidentVertices`:**

```typescript
import { describe, it, expect } from 'vitest';
import { mergeCoincidentVertices } from '../io/stl-import';

describe('mergeCoincidentVertices', () => {
  it('merges identical vertices', () => {
    const positions = new Float32Array([
      0, 0, 0,  // v0
      1, 0, 0,  // v1
      1, 0, 0,  // v1 (duplicate!)
      0, 1, 0,  // v2
    ]);
    const result = mergeCoincidentVertices(positions);
    expect(result.vertices).toHaveLength(3 * 3); // 3 уникальные вершины
    expect(result.indices).toHaveLength(4);
  });

  it('rounds vertices to precision', () => {
    const positions = new Float32Array([
      0.000001, 0, 0,
      0.000002, 0, 0, // должен слиться с предыдущей
      1, 0, 0,
    ]);
    const result = mergeCoincidentVertices(positions);
    expect(result.vertices).toHaveLength(2 * 3); // 2 уникальные вершины
  });
});
```

---

## 📝 КОСМЕТИЧЕСКИЕ ЗАМЕЧАНИЯ

### COSM-1. Инлайн-стили в `App.tsx`

**Где:** `src/App.tsx`, ~300 строк инлайн-стилей `style={{ ... }}`

**Проблема:** Инлайн-стили не наследуются, не анимируются через CSS `transition`, и не поддаются оптимизации через `@media`.

**Решение:** Вынести в CSS-модули или CSS-переменные:

```css
/* App.css */
:root {
  --bg-panel: #1e1e2e;
  --bg-input: #2a2a3c;
  --text-primary: #cdd6f4;
  --text-muted: #7f849c;
  --border: #3a3a5c;
  --accent-yellow: #f9e2af;
  --accent-green: #a6e3a1;
}

.props-row { display: flex; align-items: center; gap: 6px; padding: 4px 0; }
.props-label { font-size: 11px; color: var(--text-muted); min-width: 40px; }
```

### COSM-2. `// eslint-disable-next-line`

**Где:** `src/App.tsx`, строки 375, 387, 499

**Решение:** Вместо подавления — правильно настроить зависимости.

### COSM-3. `Object.fromEntries` для `DEFAULT_FILTERS`

**Где:** `src/App.tsx`, строка 280-282

```typescript
const DEFAULT_FILTERS = Object.fromEntries(
  Object.keys(OP_FILTER_LABELS).map((k) => [k, true]),
);
```

**Решение:** Проще:

```typescript
const DEFAULT_FILTERS: Record<string, boolean> = {};
for (const key in OP_FILTER_LABELS) DEFAULT_FILTERS[key] = true;
// или
const DEFAULT_FILTERS = Object.fromEntries(Object.keys(OP_FILTER_LABELS).map(k => [k, true])) as Record<string, boolean>;
```

---

## 🎯 ПРИОРИТЕТЫ ДЕЙСТВИЙ

| # | Задача | Приоритет | Оценка времени |
|---|---|---|---|
| 1 | Удалить `src/csg/engine.ts` (мёртвый код) | 🔴 Критичный | 2 мин |
| 2 | Разделить `App.tsx` на компоненты | 🔴 Критичный | 1-2 дня |
| 3 | Добавить типы для WASM-интерфейса в `worker.ts` | 🟡 Средний | 1-2 часа |
| 4 | Исправить дублирование центрирования в `Viewport3D.tsx` | 🟡 Средний | 1 час + тесты |
| 5 | Добавить unit-тесты для `stl-import`, `stl-export`, `document-store` | 🟡 Средний | 3-4 часа |
| 6 | Заменить `alert()` на toast-уведомления | 🟡 Средний | 1 час |
| 7 | Оптимизировать `undo/redo` — кэшировать snapshots | 🟠 Высокий | 1-2 дня |
| 8 | Кэшировать AABB в `SceneObject` | 🟢 Низкий | 2 часа |
| 9 | Вынести инлайн-стили в CSS-модули | 🟢 Низкий | 2-3 часа |
| 10 | Добавить валидацию входных данных в воркер | 🟢 Низкий | 1 час |

---

## ✅ ЧТО СТОИТ ПОХВАЛИТЬ

1. **Web Worker для CSG** — отличная идея, WASM не блокирует UI-поток
2. **Immutable updates в Zustand** — `set({ objects: { ...objects, [id]: obj } })`
3. **Undo/Redo через rebuild из истории** — надёжный подход (хотя и дорогой)
4. **IndexedDB для автосохранения** — корректное использование `IDBDatabase`
5. **`extractAndCenter`** — центрирование CSG-результата для корректного пивота
6. **`ResizeObserver`** вместо `window.resize`
7. **ErrorBoundary** для изоляции 3D-ошибок
8. **Мердж вершин при импорте STL** — критически важно для manifold
9. **Детализированные комментарии** — особенно в `worker.ts` (applySRAroundCenter, mirror matrix)
10. **ViewCube** — элегантная реализация навигационного куба с drag-вращением

---

## 📚 ССЫЛКИ И РЕСУРСЫ

- [React Hooks exhaustive-deps](https://react.dev/reference/react/useEffect#misusing-the-effect-deps)
- [Zustand best practices](https://zustand.docs.pmnd.rs/guides/primitive-objects-in-state)
- [Three.js memory management](https://threejs.org/docs/index.html manual/en/introduction/How-to-update-things.html)
- [manifold-3d documentation](https://github.com/manifold-cs/manifold)
- [Web Worker patterns](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)

---

*Код-ревью выполнено 2025-07-15. Рекомендации носят характер улучшений — текущий код функционален и демонстрирует хороший уровень инженерной практики.*
