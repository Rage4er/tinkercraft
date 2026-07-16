# 🔍 Код-ревью Раунд 8: TinkerCraft Web

**Дата:** 2026-07-16
**Ревьюер:** Qwen Code (Senior Engineer, 20 лет опыта)
**Версия проекта:** 0.0.1 (commit 26db3a8)
**Стек:** React 18 + TypeScript 5.7 + Three.js 0.170 + Zustand 5 + manifold-3d 3.0.1 (WASM) + Vite 6 + Vitest 4
**Объём:** 50 файлов, ~8100 строк TS/TSX

> **Примечание:** `pnpm typecheck` и `pnpm test` не удалось запустить (Node.js/pnpm недоступны в окружении ревью). Все находки основаны на статическом анализе кода. **Исправлено после верификации:** 104 теста (не 35), 50 файлов (не 51), 8106 строк (не 6700).

---

## 📊 Общая оценка

| Категория | Оценка | Комментарий |
|---|---|---|
| **Архитектура** | ⭐⭐⭐⭐⭐ | 4-слойная архитектура (UI → State → CSG Worker → I/O) — образцовая |
| **Читаемость** | ⭐⭐⭐⭐☆ | Хорошая декомпозиция, но местами inline-типы и дублирование |
| **Сопровождаемость** | ⭐⭐⭐⭐☆ | Модульность высокая, но DRY нарушен в worker-handlers.ts |
| **Надёжность** | ⭐⭐⭐⭐☆ | Нет критических багов, но есть race conditions и edge cases |
| **Производительность** | ⭐⭐⭐⭐☆ | Snapshot cache, AABB — отлично;缺少 React.memo — главный пробел |
| **Безопасность** | ⭐⭐⭐⭐☆ | Валидация ввода хорошая; Prototype Pollution check с false positives |
| **Доступность (a11y)** | ⭐⭐☆☆☆ | Практически отсутствует — интерактивные div без ARIA/keyboard |
| **Тестирование** | ⭐⭐⭐☆☆ | 104 теста, но есть слепые зоны (STL format detection, round-trip) |
| **Общий балл** | **4.2 / 5** | Крепкий проект с ясными путями улучшения |

---

## 🏗 Сильные стороны проекта

Прежде чем перейти к проблемам, отмечу что сделано **хорошо**:

1. **Архитектура данных** — Zustand store как единственный источник истины, Worker для тяжёлых вычислений, чёткий data flow. Это профессиональный подход.

2. **Undo/Redo** — Snapshot cache (`snapshots.ts`) даёт O(1) undo/redo с правильной инвалидацией. `rebuildFromHistory` корректно восстанавливает состояние.

3. **CSG Worker** — Типобезопасные интерфейсы вместо `any`, `sanitizeParams` для валидации, Transferable buffers для zero-copy, graceful degradation для non-manifold mesh.

4. **Three.js lifecycle** — `useLayoutEffect` для инициализации, `initRanRef` для StrictMode, правильная утилизация geometry/material при удалении объектов, ref-stabilization для animation loop.

5. **Конвенции** — `strict: true` в tsconfig, `notify()` вместо `alert()`, `extractAndCenter` в store (не в worker), `makeObject` для единообразного создания `SceneObject`.

6. **Рефакторинг** — App.tsx (1809→553 строки), document-store (757→500 строк), извлечение переиспользуемых компонентов (MirrorButtons, CsgButtons, AlignButtons). Видна работа по улучшению структуры.

---

## 🔴 Критические проблемы (3)

### CRIT-R8-1. WASM ManifoldObject не освобождаются (утечка памяти)

**Где:** `src/csg/worker-handlers.ts`
**Приоритет:** 🔴 Высокий

**Проблема:** ManifoldObject из manifold-3d — это WASM-объект с C++-памятью за пределами JS heap. Нигде в коде не вызывается `delete()` / `dispose()`. Когда объект удаляется из кэша (`cache.delete(id)`) или заменяется при CSG-операции, C++-память не освобождается.

```typescript
// worker-handlers.ts — CSG-операция
const result = manA.add(manB)
cache.delete(idA)    // JS-ссылка потеряна, но C++ объект живёт
cache.delete(idB)    // то же самое
cache.set(resultId, result)
```

**Почему это важно:** При активной работе (50+ CSG-операций) C++ heap растёт бесконтрольно. Браузерный GC не видит WASM-память. На мобильных устройствах это приводит к OOM-крашу вкладки.

**Рекомендация:**
```typescript
// Если manifold-3d ManifoldObject имеет delete():
const oldA = cache.get(idA)
if (oldA) oldA.delete()
cache.delete(idA)
```
Если `delete()` нет в API — документировать ограничение и добавить monitoring через `performance.memory` (Chrome).

---

### CRIT-R8-2. Race condition: `busy` flag не блокирует concurrent actions

**Где:** `src/store/document-store.ts` (все async actions)
**Приоритет:** 🔴 Высокий

**Проблема:** Каждый async action устанавливает `busy: true`, но **ни один action не проверяет `busy` перед началом**. Если пользователь быстро вызывает две операции (например, горячими клавишами), обе читают одинаковый `{ objects, operations, historyIndex }`, обе стартуют worker-вызовы, и последний `set()` перезатирает результат первого.

```typescript
// Два быстрых addShape:
addShape('cube')  // historyIndex = 5, objects = {...}
addShape('sphere') // historyIndex = 5 (!), те же objects — перезапись!
```

**Результат:** Первая операция потеряна из store, но её ManifoldObject остаётся в worker-кэше (утечка).

**Рекомендация:** Добавить guard в начало каждого async action:
```typescript
addShape: async (shapeType) => {
  const { busy } = get()
  if (busy) return // или queue
  set({ busy: true })
  // ...
}
```

---

### CRIT-R8-3. Prototype Pollution check даёт ложные срабатывания

**Где:** `src/io/doodle-io.ts`
**Приоритет:** 🔴 Высокий

**Проблема:**
```typescript
if (json.includes('__proto__') || json.includes('constructor') || json.includes('prototype'))
```

Это проверяет **подстроку** в JSON-тексте. Строка `"constructor"` легитимно встречается в именах объектов (`"my_constructor_block"`) или описаниях (`"uses prototype pattern"`). Результат — отказ в загрузке валидного .doodle файла.

**Рекомендация:** Проверять ключи после парсинга:
```typescript
const data = JSON.parse(json)
function validateKeys(obj: unknown, path = ''): void {
  if (typeof obj !== 'object' || obj === null) return
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`Unsafe key "${key}" at ${path}`)
    }
    validateKeys((obj as Record<string, unknown>)[key], `${path}.${key}`)
  }
}
validateKeys(data)
```

---

## 🟡 Важные проблемы (8)

### WARN-R8-1. Нет `React.memo` ни на одном компоненте

**Где:** Все 9 основных компонентов (`Toolbar`, `StatusBar`, `PropertiesPanel`, `LeftPanel`, `NumInput`, `Section`, `Timeline`, `TextModal`, `Viewport3D`)
**Приоритет:** 🟡 Средний

**Проблема:** Компоненты получают 20-30 пропсов каждый и перерисовываются при любом изменении. Наиболее критичные:

| Компонент | Пропсов | Частота обновлений |
|---|---|---|
| `StatusBar` | 10 | Каждые 500мс (FPS) |
| `Toolbar` | ~30 | При каждом изменении выделения |
| `PropertiesPanel` | ~25 | При каждом изменении трансформации |
| `NumInput` | 7 | N экземпляров × каждое изменение родителя |

**Рекомендация:** Обернуть в `React.memo` хотя бы `StatusBar`, `Toolbar`, `NumInput`:
```typescript
export default React.memo(StatusBar, (prev, next) =>
  prev.fps === next.fps && prev.objectCount === next.objectCount && /* ... */
)
```

---

### WARN-R8-2. `onFpsUpdate` stale closure в animation loop

**Где:** `src/components/Viewport3D.tsx`
**Приоритет:** 🟡 Средний

**Проблема:** `onFpsUpdate` вызывается каждые 500мс из `useLayoutEffect` animation loop, но **не стабилизирован через ref**. Другие props (onTransformEnd, snapValue, selectedIds) зеркалятся в refs для доступа из animation loop, но `onFpsUpdate` пропущен.

```typescript
// В animation loop (useLayoutEffect):
if (now - fpsRef.current.lastTime > 500) {
  onFpsUpdate(fps) // ← stale closure если parent пересоздал callback
}
```

**Рекомендация:** Добавить `fpsUpdateRef` по тому же паттерну:
```typescript
const fpsUpdateRef = useRef(onFpsUpdate)
useEffect(() => { fpsUpdateRef.current = onFpsUpdate }, [onFpsUpdate])
// В animation loop:
fpsUpdateRef.current(fps)
```

---

### WARN-R8-3. DRY нарушение: `buildPrimitive` switch повторяется 3 раза

**Где:** `src/csg/worker-handlers.ts`
**Приоритет:** 🟡 Средний

**Проблема:** Логика создания примитивов (switch по shapeType → manifold-3d API) дублируется в трёх местах:
1. `buildPrimitive()` — основная функция
2. `handleBuildShape()` — inline switch (строки ~400-440)
3. `handleApplyFillet()` — inline switch для non-cube (строки ~530-560)

Причём `handleApplyFillet` использует **другие константы** (`0.1` вместо `FILLET_EPSILON`, `0.01` вместо `FILLET_MIN_RADIUS`).

**Рекомендация:** Вызывать `buildPrimitive()` из обоих хендлеров. Константы вынести в `constants.ts` и использовать единообразно.

---

### WARN-R8-4. Dead code: DragRect и performDragSelect в Viewport3D

**Где:** `src/components/Viewport3D.tsx`
**Приоритет:** 🟡 Средний

**Проблема:** Состояние `DragRect` и callback `performDragSelect` объявлены, но **никогда не используются** в pointer event flow. `handlePointerUp` вызывает только raycaster-путь. Box-select — мёртвый код. Также `currentMeshRef` объявлен, но никогда не записывается.

**Рекомендация:** Удалить неиспользуемый код или реализовать drag-select. Мёртвый код затрудняет понимание компонента.

---

### WARN-R8-5. `moveObject` fire-and-forget workerSyncObjects

**Где:** `src/store/document-store.ts` (~строка 283)
**Приоритет:** 🟡 Средний

**Проблема:**
```typescript
workerSyncObjects([{ objId: id, shapeType, params, transform }])
  .catch(e => console.error('moveObject sync:', e))
```

Fire-and-forget: если CSG boolean или mirror запускается до завершения sync, воркер оперирует на устаревших трансформах. Текущие действия (mirror, csgBoolean) делают свой sync, но будущие action'ы могут этого не учесть.

**Рекомендация:** Либо await sync в moveObject, либо документировать контракт "worker cache may be stale after moveObject".

---

### WARN-R8-6. `handleBuildShape` применяет только translation

**Где:** `src/csg/worker-handlers.ts`
**Приоритет:** 🟡 Средний

**Проблема:** `handleBuildShape` создаёт примитив и применяет **только translation** (identity rotation + scale). Полная SRT-матрица применяется только в `handleSyncObjects`. Если `buildShape` вызывается для объекта с ненулевым rotation/scale, результат будет некорректен.

Текущий data flow это обходит (sync вызывается после build), но это хрупкая неявная зависимость.

**Рекомендация:** Документировать контракт или применять полную SRT-матрицу в `handleBuildShape`.

---

### WARN-R8-7. Нет валидации схемы операций при загрузке .doodle

**Где:** `src/io/doodle-io.ts`
**Приоритет:** 🟡 Средний

**Проблема:** После `JSON.parse(json)` результат приводится к `TinkerCraftOperation[]` через `as` без проверки структуры. Произвольный JSON станет "валидными" операциями, и ошибка проявится только при `rebuildFromHistory` с непредсказуемым поведением.

**Рекомендация:** Добавить runtime-валидацию хотя бы дискриминатора `type`:
```typescript
const VALID_OP_TYPES = new Set(['add_shape', 'import_mesh', 'move', ...])
if (!Array.isArray(ops) || !ops.every(op => VALID_OP_TYPES.has(op?.type))) {
  throw new Error('Invalid operations format')
}
```

---

### WARN-R8-8. Нормали не трансформируются при STL-экспорте

**Где:** `src/io/stl-export.ts`
**Приоритет:** 🟡 Средний

**Проблема:** Код содержит комментарий: *"normals are from original geometry (pre-transform). For rotated meshes this is approximate."* Если mesh повёрнут, per-vertex normals указывают в неправильном направлении. Слайсеры для 3D-печати могут дать артефакты.

**Рекомендация:** Применить rotation-матрицу к нормалям при экспорте (без translation и scale — normals инвариантны к translation, а для scale нужна inverse-transpose).

---

## 🔒 Безопасность (2)

### SEC-R8-1. Нет лимита на размер .doodle файла

**Где:** `src/io/doodle-io.ts`
**Приоритет:** 🔒 Средний

Для STL стоит лимит 100MB, но для .doodle (ZIP) нет проверки `buffer.byteLength`. Злоумышленник может передать огромный ZIP, и `JSZip.loadAsync` попытается его распаковать (ZIP bomb).

**Рекомендация:** Добавить проверку `if (buffer.byteLength > MAX_DOODLE_SIZE) throw new Error(...)`.

### SEC-R8-2. `URL.revokeObjectURL` вызывается синхронно после `a.click()`

**Где:** `src/io/stl-export.ts` (downloadStl)
**Приоритет:** 🔒 Низкий

В некоторых браузерах скачивание может не завершиться до revocation. Более надёжный вариант:
```typescript
setTimeout(() => URL.revokeObjectURL(url), 1000)
```

---

## ⚡ Производительность (4)

### PERF-R8-1. Clipboard хранит `number[]` вместо `Float32Array`

**Где:** `src/store/document-store.ts` (~строка 142-156)
**Приоритет:** ⚡ Средний

```typescript
entry.importVertices = Array.from(obj.vertices) // Float32Array → number[]
entry.importIndices = Array.from(obj.indices)    // Uint32Array → number[]
```

`Array.from(Float32Array)` конвертирует в обычный `number[]`, который занимает ~8× больше памяти (каждый элемент — boxed Number). Для импортированных mesh с 100K+ вершинами это существенно.

**Рекомендация:** Хранить как `Float32Array` / `Uint32Array`:
```typescript
entry.importVertices = new Float32Array(obj.vertices) // копия, но typed
entry.importIndices = new Uint32Array(obj.indices)
```

---

### PERF-R8-2. Worker не имеет таймаутов

**Где:** `src/csg/worker-client.ts`
**Приоритет:** ⚡ Средний

Если WASM-воркер зависнет (баг в manifold-3d, OOM), все Promise останутся в pending навсегда. UI будет показывать "busy" без возможности recovery.

**Рекомендация:** Добавить таймаут:
```typescript
function send<T>(type: string, data: unknown, timeoutMs = 30000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(reqId)
      reject(new Error(`Worker timeout: ${type}`))
    }, timeoutMs)
    _pending.set(reqId, (result) => {
      clearTimeout(timer)
      resolve(result as T)
    }, (err) => {
      clearTimeout(timer)
      reject(err)
    })
    worker.postMessage({ reqId, type, ...data })
  })
}
```

---

### PERF-R8-3. Нет механизма terminate/dispose воркера

**Где:** `src/csg/worker-client.ts`
**Приоритет:** ⚡ Низкий

Воркер создаётся, но никогда не терминируется. При HMR в dev-режиме накапливаются "призрачные" воркеры. Также если WASM не инициализируется (ошибка в `initWasm`), `_ready` никогда не станет `true`, и все последующие вызовы будут ждать бесконечно.

**Рекомендация:**
1. Экспортировать `disposeWorker()` с `worker.terminate()`.
2. Добавить reject для `waitReady()` при ошибке инициализации.

---

### PERF-R8-4. `Timeline.tsx` — пересчёт `visible` при каждом рендере

**Где:** `src/components/Timeline.tsx`
**Приоритет:** ⚡ Низкий

```typescript
const visible = operations.map(/* ... */).filter(/* ... */) // каждый рендер
```

**Рекомендация:** `useMemo`:
```typescript
const visible = useMemo(() =>
  operations.map(/* ... */).filter(/* ... */),
  [operations, filters]
)
```

---

## ♿ Доступность (5)

> Это **самая слабая область** проекта. Ни один интерактивный элемент не имеет ARIA-атрибутов или keyboard support.

### A11Y-1. Интерактивные `div` без ARIA

**Где:** `Section.tsx`, `LeftPanel.tsx` (object list), `Timeline.tsx`
**Приоритет:** ♿ Высокий

Все кликабельные `div` не имеют `role="button"`, `tabIndex={0}`, `onKeyDown`, `aria-expanded` (для collapsible). Пользователи с клавиатурой не могут взаимодействовать.

**Рекомендация:**
```tsx
<div
  role="button"
  tabIndex={0}
  aria-expanded={open}
  onClick={toggle}
  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle() }}
>
```

### A11Y-2. `TextModal` без `role="dialog"`

**Где:** `src/components/TextModal.tsx`
**Приоритет:** ♿ Средний

Нет `role="dialog"`, `aria-modal="true"`, `aria-labelledby`. Скринридеры не распознают модалку.

### A11Y-3. `Toolbar` без `role="toolbar"`

**Где:** `src/components/Toolbar.tsx`
**Приоритет:** ♿ Средний

Нет `role="toolbar"`, `aria-label`, roving tabindex navigation.

### A11Y-4. `StatusBar` без `role="status"`

**Где:** `src/components/StatusBar.tsx`
**Приоритет:** ♿ Низкий

Нет `role="status"` или `aria-live="polite"`. Скринридеры не озвучивают обновления статуса.

### A11Y-5. `NumInput` label не связан с input

**Где:** `src/components/NumInput.tsx`
**Приоритет:** ♿ Средний

Визуальный `<span>` label не связан с `<input>` через `<label htmlFor>` или `aria-label`.

---

## 🐛 Потенциальные баги (5)

### BUG-R8-1. `importStl` не передаёт `normals` в `makeObject`

**Где:** `src/store/document-store.ts` (~строка 99)
**Приоритет:** 🐛 Низкий

`addRawMesh` передаёт `normals: result.normals`, а `importStl` — нет. STL-объекты будут иметь `normals: undefined`, что может вызвать rendering inconsistencies если viewport проверяет `obj.normals`.

### BUG-R8-2. `saveToProject` не сбрасывает `modified` flag

**Где:** `src/store/document-store.ts` (~строка 612)
**Приоритет:** 🐛 Низкий

`saveDoodle` вызывает `set({ modified: false })`, а `saveToProject` — нет. После сохранения в Project Manager UI показывает документ как несохранённый.

### BUG-R8-3. `moveObject` создаёт history entry для нулевых delta

**Где:** `src/store/document-store.ts` (~строка 255)
**Приоритет:** 🐛 Низкий

Если пользователь начал и закончил drag на том же месте (все delta < epsilon), всё равно создаётся MoveOperation и snapshot. Это засоряет историю.

**Рекомендация:** Early return если `!hasPos && !hasRot && !hasScale`.

### BUG-R8-4. `extractAndCenterGetAABB` комментарий неточен

**Где:** `src/store/helpers.ts`
**Приоритет:** 🐛 Косметический

Комментарий говорит "single-pass", но функция выполняет два прохода (нахождение центра, затем сдвиг + AABB). Не баг, но вводит в заблуждение.

### BUG-R8-5. Инлайн 9-полевые типы трансформации в `worker-client.ts`

**Где:** `src/csg/worker-client.ts`
**Приоритет:** 🐛 Косметический

Тип `{ x, y, z, rotX, rotY, rotZ, scaleX, scaleY, scaleZ }` описан inline 4 раза вместо использования `TransformNR`. При изменении полей нужно править в 4 местах.

---

## 🧪 Пробелы в тестировании

| Что не покрыто | Приоритет | Рекомендация |
|---|---|---|
| `detectStlFormat()` | Высокий | 4 кейса: binary, ASCII, binary+solid, unknown (<84 bytes) |
| `parseStlFile()` (e2e) | Средний | Round-trip: создать Float32Array → parse → проверить vertices |
| `extractAndCenterGetAABB()` | Средний | Production-функция без единого теста |
| Round-trip export→import | Средний | Export → Import → сравнение vertices (с точностью float32) |
| `import_mesh` rebuild | Средний | Операция импорта в rebuild-цепочке |
| `visibility` rebuild | Средний | Toggle visibility в rebuild |
| `rename` rebuild | Низкий | Rename в rebuild-цепочке |
| `project-manager.ts` (real IDB) | Низкий | Текущие тесты полностью замокированы |
| `doodle-io.ts` parseDoodle | Средний | Валидный ZIP, повреждённый ZIP, Prototype Pollution key |

---

## 📋 Приоритизированный план действий

### Фаза A — Критические исправления (до релиза)

| # | Проблема | Трудозатраты |
|---|---|---|
| 1 | CRIT-R8-1: WASM memory leak (dispose ManifoldObject) | 2-4 часа |
| 2 | CRIT-R8-2: busy guard для concurrent actions | 1-2 часа |
| 3 | CRIT-R8-3: Prototype Pollution fix (key validation) | 1 час |

### Фаза B — Важные улучшения

| # | Проблема | Трудозатраты |
|---|---|---|
| 4 | WARN-R8-1: React.memo для Toolbar, StatusBar, NumInput | 2-3 часа |
| 5 | WARN-R8-2: fpsUpdateRef stabilization | 15 минут |
| 6 | WARN-R8-3: DRY — buildPrimitive() unification | 2-3 часа |
| 7 | WARN-R8-4: Удалить dead code (DragRect, currentMeshRef) | 30 минут |
| 8 | WARN-R8-7: Валидация схемы .doodle операций | 1 час |
| 9 | WARN-R8-8: Трансформация нормалей при STL-экспорте | 1-2 часа |

### Фаза C — Доступность

| # | Проблема | Трудозатраты |
|---|---|---|
| 10 | A11Y-1: role/tabIndex/keyboard для интерактивных div | 3-4 часа |
| 11 | A11Y-2,3,4: ARIA для modal, toolbar, statusbar | 2-3 часа |
| 12 | A11Y-5: label-input связь в NumInput | 30 минут |

### Фаза D — Тесты и полировка

| # | Проблема | Трудозатраты |
|---|---|---|
| 13 | Тесты для detectStlFormat, extractAndCenterGetAABB | 2-3 часа |
| 14 | Round-trip тест STL export→import | 1-2 часа |
| 15 | PERF-R8-1: TypedArray в clipboard | 30 минут |
| 16 | PERF-R8-2: Worker timeout | 1 час |
| 17 | BUG-R8-1,2,3: Мелкие баги | 1 час |

---

## 📝 Косметические замечания

| # | Замечание | Файл |
|---|---|---|
| COSM-R8-1 | `renameObject` использует два `get()` вызова вместо одного | `document-store.ts` |
| COSM-R8-2 | `as unknown as` type bridges между `TransformNR` и `RebuildTransform` (структурно идентичны) | `rebuild.ts` |
| COSM-R8-3 | `GizmoMode` тип импортируется из компонента в store — архитектурный запах | `ui-store.ts` |
| COSM-R8-4 | `handleCsgBoolean` содержит legacy параметры `transformA`/`transformB` (мёртвый код) | `worker-handlers.ts` |
| COSM-R8-5 | Props типы в `Toolbar`, `PropertiesPanel` описаны inline (~30 и ~25 полей) — вынести в interface | `Toolbar.tsx`, `PropertiesPanel.tsx` |
| COSM-R8-6 | `MeshResult` тип дублируется в `worker-client.ts` и `worker-handlers.ts` | оба файла |
| COSM-R8-7 | `ShapeParams` с `[key: string]: number \| undefined` ослабляет типобезопасность | `types.ts` |

---

## 💡 Рекомендации по архитектуре

### 1. Worker lifecycle manager
Создать `WorkerManager` class, который:
- Управляет lifecycle воркера (init, dispose, restart)
- Добавляет таймауты для всех запросов
- Обрабатывает WASM crash с автоматическим restart
- Экспортирует `dispose()` для cleanup при HMR

### 2. Operation validator
Создать `src/io/validate-operations.ts`:
- Runtime-валидация дискриминатора `type`
- Проверка обязательных полей для каждого типа операции
- Возврат информативных ошибок вместо runtime crash при rebuild

### 3. Accessibility layer
Создать `src/hooks/useInteractive.ts`:
- Custom hook: `useInteractive({ onClick, role, expanded })`
- Возвращает `{ role, tabIndex, onClick, onKeyDown, aria-expanded }`
- Используется во всех интерактивных div для единообразной a11y

### 4. Worker memory tracker
Добавить в `worker-handlers.ts`:
- Счётчик активных ManifoldObject
- Периодический `performance.memory` check (Chrome)
- Warning toast при превышении порога

---

## 📊 Итоговая статистика находок

| Категория | Количество | Критичность |
|---|---|---|
| 🔴 Критические | 3 | Утечка памяти, race condition, false positive security |
| 🟡 Важные | 8 | React.memo, DRY, dead code, fire-and-forget, a11y |
| 🔒 Безопасность | 2 | ZIP bomb, revokeObjectURL timing |
| ⚡ Производительность | 4 | Clipboard, timeout, worker lifecycle, Timeline |
| ♿ Доступность | 5 | ARIA, keyboard, roles |
| 🐛 Баги | 5 | normals, modified flag, zero-move, comment, inline types |
| 🧪 Тесты | 9 пробелов | detectStlFormat, round-trip, extractAndCenterGetAABB |
| 📝 Косметика | 7 | Type bridges, inline types, dead params |
| 💡 Архитектура | 4 | WorkerManager, validator, a11y hook, memory tracker |

**Всего: 47 находок**, из них 3 критические, 8 важные, 5 багов, 9 пробелов в тестах.

---

## ✅ Вердикт

**Проект на хорошем уровне для версии 0.0.1.** Архитектура продуманная, код читаемый, ключевые решения (CSG в Worker, snapshot cache, Zustand) — профессиональные. Два предыдущих раунда ревью закрыли большинство крупных проблем.

**Три вещи, которые нужно сделать в первую очередь:**
1. Освобождать WASM-память (CRIT-R8-1) — без этого проект не production-ready
2. Добавить `busy` guard (CRIT-R8-2) — защита от data loss
3. Исправить Prototype Pollution check (CRIT-R8-3) — сейчас ломает легитимные файлы

**Три вещи для следующего релиза:**
1. React.memo на горячих компонентах — заметно улучшит отзывчивость
2. Базовая доступность (ARIA roles + keyboard) — минимальный порог для публичного продукта
3. Worker timeout + dispose — стабильность при зависаниях WASM
