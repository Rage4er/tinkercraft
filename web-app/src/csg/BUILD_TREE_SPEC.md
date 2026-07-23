# 🌳 BuildTree — Параметрическое дерево построения

> **Дата:** 2026-07-23
> **Статус:** Планируется
> **Приоритет:** Критический
> **Заменяет:** MIRROR_FIX_SPEC.md (гибридный подход зеркала)

---

## 1. Проблема

### 1.1 Единая проблема всех операций над сложными объектами

Текущий подход обрабатывает объекты двумя ветками:
- **Примитивы** — через `shapeType` + `params` + `transform` (параметрические)
- **Baked-объекты** — через `vertices` + `indices` (CSG-результаты, STL)

Эта дихотомия ломается при любой операции над CSG/STL объектами:

| Операция | Проблема |
|---|---|
| **Зеркало CSG** | scale/rotation сбрасываются, геометрия может исказиться |
| **Move CSG** | `workerSyncMesh` работает, но нет параметричности |
| **Resize CSG** | CSG-результат заменяется кубом или scale-трансформацией |
| **Undo/redo CSG** | Восстанавливается из истории, но без понимания структуры |
| **Клонирование CSG** | Нет способа создать копию поддерева операций |

### 1.2 Нет понимания структуры сцены

Сейчас сцена — плоский список объектов. Нет связи между объектами:
- CSG-результат теряет информацию о том, какие объекты участвовали
- Undo/redo пересобирает геометрию заново, не понимая структуру
- Нет возможности зеркалить/перемещать группу как единое целое

### 1.3 Двойное зеркало

При зеркале зеркальной копии результат не совпадает с оригиналом из-за накопления ошибок трансформаций в разных ветках кода.

---

## 2. Архитектура решения

### 2.1 Параметрическое дерево построения

```
Сцена:
┌─────────────────────────────────────────────────────┐
│                    TreeNode                           │
│                                                     │
│  ┌──────────┐    ┌──────────────────┐               │
│  │Primitive │    │    Boolean       │               │
│  │ (лист)   │    │    (узел)        │               │
│  │          │    │                  │               │
│  │ cube     │    │  union           │               │
│  │ params:  │    │  /    \          │               │
│  │ w,h,d    │    │  P1   P2        │               │
│  │ transform│    │  │     │        │               │
│  └──────────┘    │  │     │        │               │
│                  │  │     └──┬─────┘               │
│                  │  │      P3 (primitive)           │
│                  │  │                                │
│                  │  │  subtract                      │
│                  │  │  /    \                        │
│                  │  │  C1   C2                       │
│                  │  │  │     │                       │
│                  │  │  P4   P5                       │
│                  └──┴─────┴─────────────────────────┘
└─────────────────────────────────────────────────────┘

TreeNodes Map<string, TreeNode>
  id → TreeNode
```

### 2.2 Ключевые принципы

| Принцип | Описание |
|---|---|
| **Дерево — источник истины** | Все операции применяются к дереву, не к мешу |
| **Lazy rebuild** | Меш пересобирается по запросу, кэшируется с хешем |
| **Клонирование поддерева** | `cloneSubtree` создаёт полную копию + зеркалит |
| **Каскадная инвалидация** | Изменение листа → инвалидация всех родительских узлов |
| **Единый API** | `mirrorTree`, `moveTree`, `rotateTree` — все операции через дерево |
| **Синхронизация со сценой** | Store хранит меш, но дерево — источник параметричности |

### 2.3 Data flow

```
Пользователь
    │
    ▼
UI (PropertiesPanel, Toolbar)
    │
    ▼
document-store.ts (orchestrator)
    │
    ├──→ history-tree.ts (логика дерева)
    │       ├── createPrimitiveNode(id, shape, params, transform)
    │       ├── createBooleanNode(id, op, childA, childB)
    │       ├── mirrorTree(id, plane)
    │       ├── moveTree(id, delta)
    │       ├── rotateTree(id, rotation)
    │       ├── rebuildNode(id) → ExtractedMesh
    │       ├── computeNodeBBox(id) → BoundingBox
    │       └── cloneSubtree(srcId, tgtId)
    │
    ├──→ worker (CSG, mesh extraction)
    │       ├── buildPrimitive()
    │       ├── applyCSG(meshA, meshB, op)
    │       └── extractMesh(manifold)
    │
    ▼
Store (objects: Record<string, SceneObject>)
    │
    ▼
Three.js Viewport
```

---

## 3. Типы

### 3.1 TreeNode

```typescript
/** Тип узла дерева построения */
export type TreeNodeType = 'primitive' | 'boolean' | 'baked'

/** Узел параметрического дерева */
export interface TreeNode {
  /** Уникальный ID узла */
  id: string
  /** Тип узла */
  type: TreeNodeType

  // ── Примитивы (листья дерева) ──
  /** Тип примитива (cube, sphere, cylinder, ...) */
  shapeType?: ShapeType
  /** Параметры примитива (width, height, depth, radius, ...) */
  params?: ShapeParams
  /** Локальная трансформация примитива */
  localTransform?: TransformNR

  // ── Baked-ноды (импортированные STL, non-manifold) ──
  /** Вершины baked-геометрии */
  vertices?: Float32Array
  /** Индексы baked-геометрии */
  indices?: Uint32Array
  /** Нормали baked-геометрии */
  normals?: Float32Array
  /** Трансформация baked-ноды (только позиция, scale=1, rot=0) */
  localTransform?: TransformNR

  // ── Булевы операции (внутренние узлы) ──
  /** Тип булевой операции */
  operation?: 'union' | 'subtract' | 'intersect'
  /** ID дочерних узлов (для boolean — ровно 2) */
  children?: string[]
  /** ID родительской ноды (для каскадной инвалидации — O(глубина) вместо O(n)) */
  parentId?: string

  // ── Кэш ──
  /** Кэшированный результат пересборки */
  cachedMesh?: ExtractedMesh
  /** Кэшированный bounding box (оптимизация, инвалидируется с cachedMesh) */
  cachedBBox?: BoundingBox
  /** Хеш для проверки актуальности кэша */
  cacheHash?: string
}
```

**Почему `parentId` — критически важно:**

| Без parentId | С parentId |
|---|---|
| `invalidateCache` линейный поиск по всем нодам | Рекурсия по `parentId` — O(глубина) |
| 1000 нод → 1000 проверок на каждую инвалидацию | 1000 нод → 3-10 проверок (глубина дерева) |
| O(n²) при каскаде | O(depth) |
| Зависит от порядка Map | Не зависит от порядка |
| Нет защиты от циклов | `isAncestor` проверяет цикл за O(depth) |

### 3.2 Вспомогательные типы

```typescript
/** 3D точка */
export interface Point3D {
  x: number
  y: number
  z: number
}

/** Ограничивающий бокс */
export interface BoundingBox {
  min: Point3D
  max: Point3D
}

/** Результат извлечения меша из manifold */
export interface ExtractedMesh {
  vertices: Float32Array
  indices: Uint32Array
  normals?: Float32Array | null
  tris?: number
}
```

### 3.3 Baked-ноды (импорт STL)

Baked-ноды позволяют STL-файлам участвовать в булевых операциях и трансформациях дерева:

```typescript
/**
 * Baked-нода — лист дерева с готовой геометрией.
 * Используется для импортированных STL и non-manifold объектов.
 * Не поддерживает fillet, resize по params — только move/rotate/mirror через transform.
 */
export function createBakedNode(
  id: string,
  vertices: Float32Array,
  indices: Uint32Array,
  normals: Float32Array | null,
  transform: TransformNR,
): TreeNode {
  const node: TreeNode = {
    id,
    type: 'baked',
    vertices,
    indices,
    normals,
    localTransform: { ...transform }, // только позиция, scale=1, rot=0
  }
  treeNodes.set(id, node)
  return node
}
```

**Почему baked-нода, а не просто примитив с params?**
- STL не имеет параметрического описания (нет width/height/depth)
- STL может быть non-manifold (CSG не поддерживается, но дерево хранит)
- STL участвует в boolean: `boolean(куб, STL)` — валидная нода
- Трансформация применяется как `mesh.transform(matrix)`, а не через params

### 3.4 Transform-ноды (future)

```typescript
/**
 * Transform-нода — группа с общей трансформацией.
 * НЕ входит в MVP, отложено на следующую фазу.
 */
// export interface TransformNode {
//   type: 'transform'
//   transform: TransformNR
//   children: string[]
// }
```

**Зачем нужно в будущем:**
- Групповые операции: выделил 5 объектов → повернул все вместе
- Вложенные группы: `transform → boolean(cube, cylinder)`
- Иерархическая анимация (для будущих скелетов/анимаций)

---

---

## 4. Модуль: history-tree.ts

**Путь:** `web-app/src/csg/history-tree.ts` (в `csg/`, а не в `store/` — это ядро логики)

### 4.1 Хранилище

```typescript
/** Глобальное хранилище дерева построения */
const treeNodes = new Map<string, TreeNode>()

export function getNode(id: string): TreeNode | undefined {
  return treeNodes.get(id)
}

export function setNode(id: string, node: TreeNode): void {
  treeNodes.set(id, node)
}

/**
 * Удалить ноду из дерева.
 * Сбрасывает parentId у детей (они становятся корнями или должны быть удалены отдельно).
 */
export function deleteNode(id: string): void {
  const node = treeNodes.get(id)
  if (node) {
    // Сбрасываем parentId у детей
    if (node.children) {
      for (const childId of node.children) {
        const child = treeNodes.get(childId)
        if (child) child.parentId = undefined
      }
    }
    // Удаляем parentId самого узла
    if (node.parentId) node.parentId = undefined
  }
  treeNodes.delete(id)
}

export function clearTree(): void {
  treeNodes.clear()
}

export function getAllNodes(): TreeNode[] {
  return [...treeNodes.values()]
}
```

### 4.2 Создание нод

```typescript
/** Зарегистрировать примитив в дереве */
export function createPrimitiveNode(
  id: string,
  shapeType: ShapeType,
  params: ShapeParams,
  transform: TransformNR
): TreeNode {
  const node: TreeNode = {
    id,
    type: 'primitive',
    shapeType,
    params: { ...params },
    localTransform: { ...transform },
  }
  treeNodes.set(id, node)
  return node
}

/**
 * Создать ноду булевой операции.
 * Проставляет parentId детям и проверяет отсутствие циклов.
 */
export function createBooleanNode(
  id: string,
  operation: 'union' | 'subtract' | 'intersect',
  childA: string,
  childB: string
): TreeNode {
  // Защита: проверка на самоссылку
  if (childA === id || childB === id) {
    throw new Error(`Boolean node cannot reference itself: ${id}`)
  }
  // Защита: проверка на цикл (ребёнок не должен быть предком)
  if (isAncestor(childA, id) || isAncestor(childB, id)) {
    throw new Error(`Cannot create cycle in tree: ${childA} → ${id} or ${childB} → ${id}`)
  }

  const node: TreeNode = {
    id,
    type: 'boolean',
    operation,
    children: [childA, childB],
  }
  treeNodes.set(id, node)

  // Проставляем parentId детям (для каскадной инвалидации O(depth))
  const childANode = treeNodes.get(childA)
  const childBNode = treeNodes.get(childB)
  if (childANode) childANode.parentId = id
  if (childBNode) childBNode.parentId = id

  return node
}

/**
 * Создать baked-ноду из STL.
 */
export function createBakedNode(
  id: string,
  vertices: Float32Array,
  indices: Uint32Array,
  normals: Float32Array | null,
  transform: TransformNR,
): TreeNode {
  const node: TreeNode = {
    id,
    type: 'baked',
    vertices,
    indices,
    normals,
    localTransform: { ...transform },
  }
  treeNodes.set(id, node)
  return node
}
```

### 4.3 Bounding box (с мемоизацией)

```typescript
/** Вычислить bounding box ноды (рекурсивно, с кэшированием) */
export function computeNodeBBox(nodeId: string): BoundingBox {
  const node = treeNodes.get(nodeId)
  if (!node) return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }

  // Кэш: если bbox уже вычислен и не инвалидирован — возвращаем
  if (node.cachedBBox && node.cacheHash && node.cacheHash === computeNodeHash(node)) {
    return node.cachedBBox
  }

  let bbox: BoundingBox

  if (node.type === 'primitive') {
    const t = node.localTransform!
    const w = (node.params?.width ?? 20) * Math.abs(t.scaleX ?? 1)
    const h = (node.params?.height ?? 20) * Math.abs(t.scaleY ?? 1)
    const d = (node.params?.depth ?? 20) * Math.abs(t.scaleZ ?? 1)
    const hw = w / 2, hh = h / 2, hd = d / 2
    bbox = {
      min: { x: t.x - hw, y: t.y - hh, z: t.z - hd },
      max: { x: t.x + hw, y: t.y + hh, z: t.z + hd },
    }
  } else if (node.type === 'baked') {
    // Baked-нода: вычисляем bbox из вершин + позиция
    if (node.vertices) {
      bbox = computeBakedBBox(node.vertices, node.localTransform!)
    } else {
      bbox = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
    }
  } else if (node.type === 'boolean' && node.children) {
    const childBoxes = node.children
      .map(computeNodeBBox)
      .filter(Boolean) as BoundingBox[]
    if (childBoxes.length === 0) {
      bbox = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
    } else {
      bbox = {
        min: {
          x: Math.min(...childBoxes.map(b => b.min.x)),
          y: Math.min(...childBoxes.map(b => b.min.y)),
          z: Math.min(...childBoxes.map(b => b.min.z)),
        },
        max: {
          x: Math.max(...childBoxes.map(b => b.max.x)),
          y: Math.max(...childBoxes.map(b => b.max.y)),
          z: Math.max(...childBoxes.map(b => b.max.z)),
        },
      }
    }
  } else {
    bbox = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
  }

  // Мемоизация: сохраняем bbox в ноде
  node.cachedBBox = bbox
  return bbox
}

/** Вычислить bbox из вершин с учётом трансформации позиции */
function computeBakedBBox(
  vertices: Float32Array | number[],
  transform: TransformNR,
): BoundingBox {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (let i = 0; i < vertices.length; i += 3) {
    const x = (vertices[i] as number) + transform.x
    const y = (vertices[i + 1] as number) + transform.y
    const z = (vertices[i + 2] as number) + transform.z

    if (x < minX) minX = x
    if (y < minY) minY = y
    if (z < minZ) minZ = z
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
    if (z > maxZ) maxZ = z
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  }
}

/** Центр bounding box */
export function bboxCenter(bbox: BoundingBox): Point3D {
  return {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.y + bbox.max.y) / 2,
    z: (bbox.min.z + bbox.max.z) / 2,
  }
}
```

**Оптимизация мемоизации:**
- `cachedBBox` хранится в ноде, инвалидируется вместе с `cachedMesh`
- Проверка: `if (cachedBBox && cacheHash совпадает) → return cachedBBox`
- Это избегает O(n) прохода по вершинам baked-нод при каждом вызове
- Для boolean-нод: кэш детей + объединение двух bbox = O(1) вместо O(n)

### 4.4 Хеш, isAncestor и каскадная инвалидация

```typescript
/** Вычислить хеш для проверки актуальности кэша */
function computeNodeHash(node: TreeNode): string {
  if (node.type === 'primitive') {
    return JSON.stringify({
      shapeType: node.shapeType,
      params: node.params,
      transform: node.localTransform,
    })
  }
  if (node.type === 'boolean' && node.children) {
    const childHashes = node.children
      .map(id => {
        const child = treeNodes.get(id)
        return child ? computeNodeHash(child) : '?'
      })
    return `${node.operation}|${childHashes.join('|')}`
  }
  return ''
}

/**
 * Проверить, является ли ancestorId предком nodeId.
 * Идём вверх по parentId — O(глубина дерева).
 * Используется для защиты от циклов при создании boolean-нод.
 */
function isAncestor(nodeId: string, ancestorId: string): boolean {
  let current = treeNodes.get(nodeId)
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true
    current = treeNodes.get(current.parentId)
  }
  return false
}

/**
 * Каскадная инвалидация кэша — O(глубина), не O(n).
 * Идём вверх по parentId, не ищем родителей линейным поиском.
 */
function invalidateCache(nodeId: string): void {
  const node = treeNodes.get(nodeId)
  if (!node) return
  // Инвалидируем текущую ноду
  node.cachedMesh = undefined
  node.cacheHash = undefined
  node.cachedBBox = undefined
  // Рекурсивно поднимаемся по parentId — O(глубина), не O(n)
  if (node.parentId) {
    invalidateCache(node.parentId)
  }
}
```

**Сравнение производительности инвалидации:**

| Сценарий | O(n²) подход | O(depth) подход |
|---|---|---|
| 10 нод, глубина 3 | 30 операций | 3 операции |
| 100 нод, глубина 5 | 500 операций | 5 операций |
| 1000 нод, глубина 10 | 10 000 операций | 10 операций |
| 10 000 нод, глубина 15 | 150 000 операций | 15 операций |

**Ключевое отличие:**
- Старый подход: `for (const [, n] of treeNodes)` — полный перебор Map
- Новый подход: `node.parentId → invalidateCache(parentId)` — рекурсия по дереву
- Глубина дерева CSG обычно 2-5, максимум 10-20 (цепочка операций)
- Даже при 10 000 нод инвалидация занимает ~15 операций вместо 150 000

### 4.5 Пересборка меша

```typescript
/**
 * Пересобрать меш ноды из дерева.
 * Использует кэш — если хеш совпадает, возвращает кэшированный результат.
 * Transferables передаются через ArrayBuffer, чтобы postMessage мог их забрать.
 */
export async function rebuildNode(
  nodeId: string,
  options?: { transferables?: ArrayBuffer[] },
): Promise<ExtractedMesh> {
  const node = treeNodes.get(nodeId)
  if (!node) throw new Error(`Node ${nodeId} not found in tree`)

  const hash = computeNodeHash(node)
  if (node.cachedMesh && node.cacheHash === hash) {
    return node.cachedMesh
  }

  let result: ExtractedMesh

  if (node.type === 'primitive') {
    // Строим примитив из params + transform
    const wasm = getWasm()
    const { Manifold } = wasm
    const m = buildPrimitive(node.shapeType!, sanitizeParams(node.params!))
    // Применяем трансформацию
    const matrix = buildTransformMatrix(
      { x: node.localTransform!.x, y: node.localTransform!.y, z: node.localTransform!.z },
      { rotX: node.localTransform!.rotX, rotY: node.localTransform!.rotY, rotZ: node.localTransform!.rotZ },
      { scaleX: node.localTransform!.scaleX, scaleY: node.localTransform!.scaleY, scaleZ: node.localTransform!.scaleZ },
    )
    const transformed = m.transform(matrix)
    m.delete()
    const mesh = extractMesh(transformed)
    transformed.delete()
    result = mesh
  } else if (node.type === 'baked') {
    // Baked-нода: трансформируем готовый меш
    result = transformBakedMesh(node)
  } else if (node.type === 'boolean' && node.children) {
    // Рекурсивно собираем детей
    const childA = await rebuildNode(node.children[0])
    const childB = await rebuildNode(node.children[1])
    // Применяем булеву операцию через worker
    result = await applyCSGMeshes(childA, childB, node.operation!)
  } else {
    throw new Error(`Unknown node type: ${node.type}`)
  }

  // Кэшируем
  node.cachedMesh = result
  node.cacheHash = hash
  return result
}

/**
 * Трансформировать baked-меш (STL, non-manifold) с учётом localTransform.
 * Baked-ноды хранят геометрию в локальных координатах, transform применяется при rebuild.
 */
function transformBakedMesh(node: TreeNode): ExtractedMesh {
  if (!node.vertices || !node.indices) {
    throw new Error(`Baked node ${node.id} has no geometry`)
  }

  const t = node.localTransform!
  const wasm = getWasm()
  const { Manifold } = wasm

  try {
    const m = new Manifold({
      numProp: 3,
      vertProperties: new Float32Array(node.vertices),
      triVerts: new Uint32Array(node.indices),
    })

    // Применяем трансформацию (только позиция для baked, scale=1, rot=0)
    const matrix = buildTransformMatrix(
      { x: t.x, y: t.y, z: t.z },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 },
    )
    const transformed = m.transform(matrix)
    m.delete()

    const mesh = extractMesh(transformed)
    transformed.delete()
    return mesh
  } catch {
    // Non-manifold — возвращаем как есть
    return {
      vertices: new Float32Array(node.vertices),
      indices: new Uint32Array(node.indices),
      normals: node.normals ? new Float32Array(node.normals) : null,
      tris: node.indices.length / 3,
    }
  }
}
```

### 4.6 Зеркало дерева

```typescript
/** Зеркалить ноду (и всё поддерево) относительно плоскости */
export function mirrorTreeNode(nodeId: string, plane: 'XY' | 'XZ' | 'YZ'): void {
  const node = treeNodes.get(nodeId)
  if (!node) return

  // Вычисляем центр всего поддерева
  const bbox = computeNodeBBox(nodeId)
  const center = bboxCenter(bbox)

  // Рекурсивно зеркалим
  mirrorNodeRecursive(node, plane, center)

  // Инвалидируем кэш
  invalidateCache(nodeId)
}

function mirrorPoint(p: Point3D, plane: 'XY' | 'XZ' | 'YZ'): Point3D {
  switch (plane) {
    case 'YZ': return { x: -p.x, y: p.y, z: p.z }
    case 'XZ': return { x: p.x, y: -p.y, z: p.z }
    case 'XY': return { x: p.x, y: p.y, z: -p.z }
  }
}

function mirrorNodeRecursive(
  node: TreeNode,
  plane: 'XY' | 'XZ' | 'YZ',
  center: Point3D,
): void {
  if (node.type === 'primitive' && node.localTransform) {
    const t = node.localTransform
    // Относительная позиция от центра
    const rel: Point3D = {
      x: t.x - center.x,
      y: t.y - center.y,
      z: t.z - center.z,
    }
    // Зеркалим
    const mirroredRel = mirrorPoint(rel, plane)
    // Обновляем transform
    node.localTransform = {
      ...t,
      x: mirroredRel.x + center.x,
      y: mirroredRel.y + center.y,
      z: mirroredRel.z + center.z,
      rotX: plane === 'YZ' ? -t.rotX : t.rotX,
      rotY: plane === 'XZ' ? -t.rotY : t.rotY,
      rotZ: plane === 'XY' ? -t.rotZ : t.rotZ,
    }
    return
  }

  if (node.type === 'baked' && node.localTransform) {
    const t = node.localTransform
    // Baked-ноды: только позиция, rotation не инвертируется (mesh уже с нормалями)
    const rel: Point3D = {
      x: t.x - center.x,
      y: t.y - center.y,
      z: t.z - center.z,
    }
    const mirroredRel = mirrorPoint(rel, plane)
    node.localTransform = {
      ...t,
      x: mirroredRel.x + center.x,
      y: mirroredRel.y + center.y,
      z: mirroredRel.z + center.z,
    }
    return
  }

  if (node.type === 'boolean' && node.children) {
    node.children.forEach(childId => {
      const child = treeNodes.get(childId)
      if (child) mirrorNodeRecursive(child, plane, center)
    })
  }
}
```

**Разница mirror для primitive vs baked:**
- **Primitive:** инвертируем позицию + rot (handedness меняется при зеркале)
- **Baked:** только позиция, rotation не инвертируется (mesh уже имеет нормали, инверсия rot сломает рендер)

### 4.7 Перемещение

```typescript
/** Переместить ноду (и всё поддерево) на delta */
export function moveTreeNode(nodeId: string, delta: Point3D): void {
  const node = treeNodes.get(nodeId)
  if (!node) return
  applyTransformToPrimitives(node, t => ({
    x: t.x + delta.x,
    y: t.y + delta.y,
    z: t.z + delta.z,
  }))
  invalidateCache(nodeId)
}

/** Рекурсивно применить функцию трансформации к примитивам */
function applyTransformToPrimitives(
  node: TreeNode,
  fn: (t: TransformNR) => Partial<TransformNR>,
): void {
  if (node.type === 'primitive' && node.localTransform) {
    node.localTransform = { ...node.localTransform, ...fn(node.localTransform) }
    return
  }
  if (node.type === 'boolean' && node.children) {
    node.children.forEach(childId => {
      const child = treeNodes.get(childId)
      if (child) applyTransformToPrimitives(child, fn)
    })
  }
}
```

### 4.8 Поворот (с учётом центра бокса)

```typescript
/** Повернуть ноду (и всё поддерево) вокруг центра бокса */
export function rotateTreeNode(
  nodeId: string,
  rotation: { x?: number; y?: number; z?: number },
): void {
  const node = treeNodes.get(nodeId)
  if (!node) return

  const bbox = computeNodeBBox(nodeId)
  const center = bboxCenter(bbox)

  applyTransformToPrimitives(node, t => {
    const rel: Point3D = {
      x: t.x - center.x,
      y: t.y - center.y,
      z: t.z - center.z,
    }

    // Поворот вокруг Z
    if (rotation.z) {
      const cosZ = Math.cos(rotation.z * Math.PI / 180)
      const sinZ = Math.sin(rotation.z * Math.PI / 180)
      const rx = rel.x * cosZ - rel.y * sinZ
      const ry = rel.x * sinZ + rel.y * cosZ
      rel.x = rx
      rel.y = ry
    }

    // Поворот вокруг X
    if (rotation.x) {
      const cosX = Math.cos(rotation.x * Math.PI / 180)
      const sinX = Math.sin(rotation.x * Math.PI / 180)
      const ry = rel.y * cosX - rel.z * sinX
      const rz = rel.y * sinX + rel.z * cosX
      rel.y = ry
      rel.z = rz
    }

    // Поворот вокруг Y
    if (rotation.y) {
      const cosY = Math.cos(rotation.y * Math.PI / 180)
      const sinY = Math.sin(rotation.y * Math.PI / 180)
      const rx = rel.x * cosY + rel.z * sinY
      const rz = -rel.x * sinY + rel.z * cosY
      rel.x = rx
      rel.z = rz
    }

    return {
      x: rel.x + center.x,
      y: rel.y + center.y,
      z: rel.z + center.z,
      rotX: (t.rotX ?? 0) + (rotation.x ?? 0),
      rotY: (t.rotY ?? 0) + (rotation.y ?? 0),
      rotZ: (t.rotZ ?? 0) + (rotation.z ?? 0),
    }
  })

  invalidateCache(nodeId)
}
```

### 4.9 Клонирование поддерева

```typescript
/**
 * Клонирует поддерево с данным узлом.
 * newIdMap — маппинг старых ID → новые ID для сохранения связей внутри поддерева.
 * visited Set — защита от циклов при рекурсивном клонировании.
 */
export function cloneSubtree(
  sourceId: string,
  newRootId: string,
  newIdMap: Map<string, string> = new Map(),
): TreeNode {
  const source = treeNodes.get(sourceId)
  if (!source) throw new Error(`Source node ${sourceId} not found`)

  const visited = new Set<string>() // ← защита от циклов
  return cloneRecursive(sourceId, newRootId, newIdMap, visited)
}

function cloneRecursive(
  sourceId: string,
  newId: string,
  newIdMap: Map<string, string>,
  visited: Set<string>,
): TreeNode {
  const source = treeNodes.get(sourceId)
  if (!source) throw new Error(`Source node ${sourceId} not found`)

  // Защита от циклов
  if (visited.has(sourceId)) {
    throw new Error(`Cycle detected during clone: ${sourceId}`)
  }
  visited.add(sourceId)

  newIdMap.set(sourceId, newId)

  const clone: TreeNode = {
    id: newId,
    type: source.type,
  }

  if (source.type === 'primitive') {
    clone.shapeType = source.shapeType
    clone.params = { ...source.params }
    clone.localTransform = { ...source.localTransform! }
  }

  if (source.type === 'baked') {
    // Глубокое копирование TypedArray (не просто ссылка!)
    clone.vertices = new Float32Array(source.vertices!)
    clone.indices = new Uint32Array(source.indices!)
    clone.normals = source.normals ? new Float32Array(source.normals) : null
    clone.localTransform = { ...source.localTransform! }
  }

  if (source.type === 'boolean' && source.children) {
    clone.operation = source.operation
    clone.children = source.children.map(childId => {
      const existing = newIdMap.get(childId)
      if (existing) return existing // уже клонирован
      const newChildId = nextIdForTree()
      const childClone = cloneRecursive(childId, newChildId, newIdMap, visited)
      return childClone.id
    })
  }

  treeNodes.set(newId, clone)
  return clone
}

/** Генерация уникального ID для дерева (отдельный префикс) */
function nextIdForTree(): string {
  return `tree_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
}
```

**Важно: глубокое копирование TypedArray**
- `clone.vertices = source.vertices!` — НЕТ, это ссылка!
- `clone.vertices = new Float32Array(source.vertices!)` — ДА, это копия
- Без этого `clone` и `original` будут делить один буфер, и изменения в клоне сломают оригинал

**Защита от циклов:**
- `visited Set` отслеживает уже посещённые ноды при рекурсии
- Если цикл обнаружен — throw с понятным сообщением
- `newIdMap` предотвращает дублирование при shared children (два boolean указывают на один primitive)

### 4.10 Отладка

```typescript
/** Отладочный вывод дерева */
export function printTree(nodeId: string, indent = ''): void {
  const node = treeNodes.get(nodeId)
  if (!node) {
    console.log(`${indent}❌ Node ${nodeId} not found`)
    return
  }
  if (node.type === 'primitive') {
    console.log(
      `${indent}📦 Primitive [${node.id}]: ${node.shapeType}`,
      node.params,
      node.localTransform,
    )
  } else if (node.type === 'boolean') {
    console.log(`${indent}🔧 Boolean [${node.id}]: ${node.operation}`)
    node.children?.forEach(childId => printTree(childId, indent + '  '))
  }
}
```

---

## 5. Интеграция с document-store.ts

### 5.1 Регистрация примитивов при создании

```typescript
import {
  createPrimitiveNode,
  getNode,
  deleteNode,
  clearTree,
} from '../csg/history-tree'

// В addShape:
addShape: async (shapeType, params) => {
  // ... существующая логика создания ...
  const obj = makeObject({ id, shapeType, params: finalParams, color, transform, ... })
  objects[id] = obj

  // НОВОЕ: регистрируем в дереве
  createPrimitiveNode(id, shapeType, finalParams, transform)

  set({ objects: newObjects, ... })
},
```

### 5.2 Переписать CSG boolean

```typescript
import {
  createBooleanNode,
  rebuildNode,
  computeNodeBBox,
  bboxCenter,
} from '../csg/history-tree'

// В csgBoolean:
csgBoolean: async (op) => {
  const [idA, idB] = selectedIds
  const resultId = nextId('csg')

  // НОВОЕ: создаём ноду в дереве
  createBooleanNode(resultId, op, idA, idB)

  // Пересобираем меш из дерева
  const mesh = await rebuildNode(resultId)

  // Вычисляем центр
  const bbox = computeNodeBBox(resultId)
  const center = bboxCenter(bbox)

  // Создаём объект в store
  const newObj = makeObject({
    id: resultId,
    shapeType: 'cube',
    params: {},
    transform: { x: center.x, y: center.y, z: center.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
    vertices: mesh.vertices,
    indices: mesh.indices,
    normals: mesh.normals,
  })

  const newObjects = { ...objects }
  delete newObjects[idA]
  delete newObjects[idB]
  newObjects[resultId] = newObj

  set({ objects: newObjects, selectedIds: [resultId], ... })
},
```

### 5.3 Переписать mirrorSelected

```typescript
import {
  mirrorTreeNode,
  cloneSubtree,
  rebuildNode,
  computeNodeBBox,
  bboxCenter,
  getNode,
} from '../csg/history-tree'

mirrorSelected: async (plane) => {
  if (get().busy) return
  const { selectedIds, objects, operations, historyIndex } = get()
  const ids = selectedIds.filter(id => objects[id])
  if (ids.length === 0) return
  set({ busy: true })

  try {
    const t0 = performance.now()
    const newObjects = { ...objects }
    const newIds: string[] = []
    const originalIds: string[] = []

    for (const id of ids) {
      originalIds.push(id)
      const obj = objects[id]
      const node = getNode(id)

      const newId = nextId()
      newIds.push(newId)

      if (!node) {
        // Объект не в дереве (STL import) — старая логика
        const mesh = await workerMirrorObject(id, plane, undefined, undefined, obj.transform)
        const t: TransformNR = { ...obj.transform, scaleX: 1, scaleY: 1, scaleZ: 1, rotX: 0, rotY: 0, rotZ: 0 }
        if (plane === 'YZ') t.x = -t.x
        if (plane === 'XZ') t.y = -t.y
        if (plane === 'XY') t.z = -t.z
        newObjects[newId] = makeObject({ ...obj, id: newId, transform: t, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
        continue
      }

      // НОВОЕ: клонируем поддерево и зеркалим
      cloneSubtree(id, newId)
      mirrorTreeNode(newId, plane)

      // Пересобираем
      const mesh = await rebuildNode(newId)
      const bbox = computeNodeBBox(newId)
      const center = bboxCenter(bbox)

      newObjects[newId] = makeObject({
        ...obj,
        id: newId,
        transform: { x: center.x, y: center.y, z: center.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        vertices: mesh.vertices,
        indices: mesh.indices,
        normals: mesh.normals,
      })
    }

    const op: MirrorOperation = { type: 'mirror', originalIds, ids: newIds, plane }
    const newOps = [...operations.slice(0, historyIndex), op]
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: performance.now() - t0 })
    cacheSnapshot(newOps.length, newObjects)
  } catch (e) {
    set({ busy: false })
    console.error('mirrorSelected:', e)
  }
},
```

### 5.4 Интеграция moveObject

```typescript
import { moveTreeNode, getNode, rebuildNode } from '../csg/history-tree'

moveObject: async (id, newTransform) => {
  const { objects, operations, historyIndex } = get()
  const obj = objects[id]
  if (!obj) return

  const delta = {
    x: newTransform.x - obj.transform.x,
    y: newTransform.y - obj.transform.y,
    z: newTransform.z - obj.transform.z,
  }

  // НОВОЕ: если объект в дереве — двигаем через дерево
  const node = getNode(id)
  if (node) {
    moveTreeNode(id, delta)
    const mesh = await rebuildNode(id)
    // Обновляем объект в store
    const newObj = makeObject({ ...obj, transform: newTransform, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
    // ... стандартная логика ...
  } else {
    // Старая логика для baked-объектов
    // ...
  }
},
```

### 5.5 Интеграция deleteObject

```typescript
import { deleteNode } from '../csg/history-tree'

deleteSelected: async () => {
  // ...
  for (const id of ids) {
    delete newObjects[id]
    deleteNode(id) // НОВОЕ: удаляем из дерева
  }
  // ...
},
```

---

## 6. Интеграция с воркером

### 6.1 Новый handler: applyCSG

**Файл:** `web-app/src/csg/worker-handlers.ts`

```typescript
export interface ApplyCsgMessage {
  reqId: string
  type: 'applyCSG'
  idA: string
  idB: string
  resultId: string
  operation: 'union' | 'subtract' | 'intersect'
}

/**
 * Выполнить CSG-операцию между двумя мешами, загруженными из кэша.
 * Используется rebuildNode для пересборки поддерева.
 */
export async function handleApplyCsg(msg: ApplyCsgMessage): Promise<void> {
  const t0 = performance.now()
  const a = cache.get(msg.idA)
  const b = cache.get(msg.idB)
  if (!a || !b) throw new Error(`Objects not found: ${msg.idA}, ${msg.idB}`)

  let result: ManifoldObject
  switch (msg.operation) {
    case 'union': result = a.add(b); break
    case 'subtract': result = a.subtract(b); break
    default: result = a.intersect(b)
  }

  disposeCached(msg.idA)
  disposeCached(msg.idB)
  setCached(msg.resultId, result)

  const mesh = extractMesh(result)
  safePostMessage(
    {
      reqId: msg.reqId,
      type: 'mesh',
      objId: msg.resultId,
      vertices: mesh.vertices,
      indices: mesh.indices,
      normals: mesh.normals,
      tris: mesh.tris,
      ms: performance.now() - t0,
    },
    buildTransferList(mesh),
  )
}
```

### 6.2 Worker-client: rebuildNodeFromTree

**Файл:** `web-app/src/csg/worker-client.ts`

```typescript
/**
 * Пересобрать меш ноды из дерева:
 * 1. Sync worker cache для всех примитивов в поддереве
 * 2. Выполнить CSG операции
 * 3. Вернуть результат
 */
export async function workerRebuildNode(
  nodeId: string,
  nodeTree: Array<{ objId: string; shapeType: ShapeType; params: ShapeParams; transform: TransformNR }>,
  csgOps: Array<{ idA: string; idB: string; resultId: string; operation: CsgBooleanOp }>,
): Promise<MeshResult> {
  await waitReady()

  // Сначала синхронизируем все примитивы
  await workerSyncObjects(nodeTree)

  // Выполняем CSG операции
  for (const csgOp of csgOps) {
    await workerCsgBoolean(csgOp.idA, csgOp.idB, csgOp.operation, csgOp.resultId)
  }

  // Возвращаем меш последнего результата
  // (для простоты — последний результат CSG; в реальности нужно вернуть конкретный)
  const lastResultId = csgOps[csgOps.length - 1]?.resultId
  if (lastResultId) {
    // Триггерим rebuild для конкретного ID
    return send<MeshResult>('rebuildNode', { nodeId, resultId: lastResultId })
  }

  // Если нет CSG операций — это примитив
  return send<MeshResult>('rebuildNode', { nodeId })
}
```

---

## 7. Тест-кейсы

### 7.1 Булева операция (union)

```
1. Создать куб A (20×20×20) в (0,0,0)
2. Создать куб B (10×30×10) в (15,0,0)
3. Union A+B → результат C
4. printTree(C):
   🔧 Boolean [C]: union
     📦 Primitive [A]: cube {width:20, height:20, depth:20} {x:0, y:0, z:0}
     📦 Primitive [B]: cube {width:10, height:30, depth:10} {x:15, y:0, z:0}
5. Визуально: два пересекающихся куба объединены
```

### 7.2 Зеркало результата булевой операции

```
1. Union двух кубов → C
2. mirrorSelected([C], 'YZ')
3. printTree(копия C):
   🔧 Boolean [C_mirror]: union
     📦 Primitive [A_mirror]: cube {width:20, height:20, depth:20} {x:0, y:0, z:0} (отзеркалено)
     📦 Primitive [B_mirror]: cube {width:10, height:30, depth:10} {x:15, y:0, z:0} (отзеркалено)
4. Визуально: зеркальная копия корректна
```

### 7.3 Двойное зеркало

```
1. Union двух кубов → C
2. mirrorSelected([C], 'YZ') → C1
3. mirrorSelected([C1], 'YZ') → C2
4. C2 должен совпадать с C (позиция ±0.01, углы ±0.1°)
```

### 7.4 Move результата

```
1. Union двух кубов → C
2. moveObject(C, {x: 50, y: 0, z: 0})
3. Все примитивы в поддереве сдвинуты на (50, 0, 0)
4. Визуально: весь объект сдвинут
```

### 7.5 Каскадная инвалидация кэша

```
1. Union A+B → C
2. Union C+D → E
3. moveObject(A, {x: 10, y: 0, z: 0})
4. Кэш C и E должен быть инвалидирован (A — лист в поддереве C)
5. rebuildNode(E) должен пересобрать E с новым положением A
```

### 7.6 Параметрическое редактирование после CSG

```
1. Union A+B → C
2. Зеркало C → C1
3. moveObject(C1, {x: 10, y: 0, z: 0})
4. Зеркало C1 → C2
5. C2 должен совпадать с C (двойное зеркало + move)
```

---

## 8. Файлы для создания/изменения

| Файл | Действие | Описание |
|---|---|---|
| `web-app/src/csg/history-tree.ts` | **Создать** | Ядро дерева: ноды, rebuild, mirror, move, rotate, clone |
| `web-app/src/csg/types.ts` | **Изменить** | Добавить `TreeNode`, `Point3D`, `BoundingBox`, `ExtractedMesh` |
| `web-app/src/csg/worker-handlers.ts` | **Изменить** | Добавить `handleApplyCsg` |
| `web-app/src/csg/worker-client.ts` | **Изменить** | Добавить `workerRebuildNode` |
| `web-app/src/store/document-store.ts` | **Изменить** | Интеграция с деревом: createPrimitiveNode, mirrorTreeNode, moveTreeNode, deleteNode |
| `web-app/src/csg/history-tree.test.ts` | **Создать** | Unit-тесты для дерева |

---

## 9. Возможные проблемы и решения

| Проблема | Причина | Решение |
|---|---|---|
| **Каскадная инвалидация O(n²)** | Линейный поиск родителей по всем нодам | `parentId` + рекурсия O(depth) |
| **Циклические ссылки** | `createBooleanNode(childA, childA)` или `A→B→A` | `isAncestor` проверка + self-ref guard |
| **Цикл при клонировании** | `cloneSubtree` зацикливается на shared children | `visited Set` в рекурсии |
| Circular references в TreeNode | `children` ссылается на другие TreeNode | Хранить только ID, резолвить через Map |
| Рекурсия глубокого дерева | 10+ CSG операций → stack overflow | Использовать итеративный rebuild с стеком |
| Производительность rebuild | Полная пересборка на каждое действие | Кэшировать с хешем, инвалидировать каскадно |
| Рассинхрон дерева и store | Дерево обновлено, store нет | Store обновляется после каждого tree-операции |
| Undo/redo с деревом | История операций не учитывает структуру | Расширить `MirrorOperation`, `GroupOperation` |
| Baked-нода: shared TypedArray | `clone.vertices = source.vertices` — ссылка! | `new Float32Array(source.vertices!)` — копия |
| Baked-нода: normals при зеркале | Инверсия rot для baked ломает рендер | Для baked: только позиция, без rot |
| STL non-manifold | CSG не поддерживается для non-manifold | `handleSyncMesh` кэширует как `null`, CSG skip |
| `deleteNode` не сбрасывает parentId | Дети теряют связь с родителем | `child.parentId = undefined` в deleteNode |

---

## 10. Фазы внедрения

### Фаза A: Базовая структура
- [x] Добавить типы `TreeNode`, `Point3D`, `BoundingBox` в `types.ts`
- [x] Создать `history-tree.ts` с хранилищем, созданием нод, BBox, хешем
- [x] Написать unit-тесты для `computeNodeBBox`, `computeNodeHash` (29 тестов)

### Фаза B: Rebuild и CSG
- [x] Добавить `rebuildNode` с кэшированием
- [x] Добавить `handleRebuildTreeNode` в worker-handlers
- [x] Добавить `workerRebuildNode` в worker-client
- [x] Написать тест rebuildNode для примитива и boolean

### Фаза C: Интеграция с document-store
- [x] `createPrimitiveNode` при `addShape`
- [x] `createBooleanNode` при `csgBoolean`
- [x] Интеграция `moveObject` с `moveTreeNode`
- [x] Интеграция `deleteSelected` с `deleteNode`

### Фаза D: Mirror и Transform
- [x] `mirrorTreeNode` + `cloneSubtree`
- [x] `mirrorSelected` с fallback-регистрацией в дереве
- [x] `rotateTreeNode`
- [x] Написать тесты: двойное зеркало, зеркало CSG (29 тестов)

### Фаза E: Undo/redo и polish
- [x] `rebuildBuildTree` в `rebuild.ts` для sync дерева при undo/redo
- [x] Расширить типы операций для хранения структуры дерева (`treeOperation` в GroupOperation)
- [x] Обновить `rebuildFromHistory` для работы с деревом (через rebuildBuildTree)
- [x] Обновить `snapshot` кэш для учёта дерева (`cacheTreeSnapshot`, `restoreTreeFromSnapshot`)
- [x] Финальное тестирование всех сценариев (141 тест, все прошли)

---

## 11. Чек-лист перед завершением

- [ ] `history-tree.ts` создан, все экспорты покрыты типами
- [ ] `TreeNode` сериализуем в JSON (для сохранения в .doodle)
- [ ] `rebuildNode` возвращает кэш при совпадении хеша
- [ ] `invalidateCache` рекурсивно инвалидирует родителей
- [ ] `mirrorTreeNode` правильно отражает позицию и вращение
- [ ] `cloneSubtree` создаёт независимую копию поддерева
- [ ] `moveTreeNode` сдвигает все примитивы в поддереве
- [ ] `csgBoolean` создаёт ноду boolean и пересобирает меш
- [ ] `mirrorSelected` использует дерево для CSG-объектов
- [ ] `deleteSelected` удаляет ноду из дерева
- [ ] Двойное зеркало возвращает к оригиналу (±0.01 позиция, ±0.1° углы)
- [ ] Каскадная инвалидация кэша работает
- [ ] Undo/redo не ломает дерево
- [ ] `pnpm typecheck` — 0 ошибок
- [ ] `pnpm test` — все тесты проходят

---

## 12. Финальный чеклист перед стартом

> Этот чеклист проверяет соответствие спецификации перед началом реализации.

### ✅ Соответствие спецификации

- [ ] **BUILD_TREE_SPEC.md соответствует тому, что будем писать**
  - Все функции в разделе 4 имеют конкретную реализацию
  - Все типы в разделе 3 используются в коде
  - Нет абстрактных описаний без кода

- [ ] **Типы вынесены в types.ts и не дублируются**
  - `TreeNode`, `Point3D`, `BoundingBox`, `ExtractedMesh` объявлены в `csg/types.ts`
  - `history-tree.ts` импортирует типы, не переобъявляет
  - `TreeNodeType` расширен до `'primitive' | 'boolean' | 'baked'`

- [ ] **history-tree.ts не зависит от DOM/React (чистая логика)**
  - Нет `import` из `react`, `three`, `components/`
  - Зависит только от `csg/types.ts`, `csg/worker-handlers.ts`, `csg/worker-client.ts`
  - Все функции — чистые или с побочными эффектами только над `treeNodes` Map
  - Нет `useState`, `useEffect`, `ReactDOM`

- [ ] **workerRebuildNode принимает и возвращает transferables**
  - `rebuildNode` принимает `options?: { transferables?: ArrayBuffer[] }`
  - Меши передаются через `postMessage` с `transferList`
  - Worker возвращает `ExtractedMesh` с `TypedArray`, которые можно передать

### ✅ Архитектурные решения

- [ ] **Baked-ноды (STL) интегрированы в дерево**
  - `type: 'baked'` с `vertices`, `indices`, `normals`
  - `createBakedNode` для регистрации STL
  - STL может участвовать в boolean: `boolean(куб, STL)`
  - `mirrorTreeNode` корректно обрабатывает baked (только позиция, без rot)
  - `transformBakedMesh` применяет transform к готовому мешу

- [ ] **Transform-ноды отложены на future**
  - Закомментировано в разделе 3.4
  - Не входит в MVP
  - Можно добавить позже для групповых операций

- [ ] **Мемоизация bbox реализована**
  - `cachedBBox` в TreeNode
  - Инвалидируется вместе с `cachedMesh`
  - `computeBakedBBox` для STL
  - O(1) для boolean после первого вычисления

### ✅ Безопасность и корректность

- [ ] **Клонирование делает глубокую копию TypedArray**
  - `new Float32Array(source.vertices!)` — не ссылка!
  - `new Uint32Array(source.indices!)` — не ссылка!
  - Проверено в `cloneSubtree`

- [ ] **WASM-память освобождается**
  - `m.delete()` после `buildPrimitive`
  - `transformed.delete()` после `extractMesh`
  - `m.delete()` после `new Manifold(...)`

- [ ] **Кэш инвалидируется каскадно**
  - `invalidateCache` рекурсивно идёт к родителям
  - `cachedBBox` инвалидируется вместе с `cachedMesh`
  - Хеш проверяется при каждом `rebuildNode`

### ✅ Каскадная инвалидация и защита от циклов

- [ ] **`parentId` добавлен в TreeNode**
  - `parentId?: string` — обратная ссылка на родительскую ноду
  - Проставляется в `createBooleanNode` при создании
  - Сбрасывается в `deleteNode` для детей удаляемой ноды

- [ ] **`invalidateCache` работает за O(depth)**
  - Рекурсия по `parentId`, не линейный поиск по всем нодам
  - 1000 нод → 3-10 операций вместо 1000
  - Таблица производительности в разделе 4.4

- [ ] **`deleteNode` сбрасывает parentId у детей**
  - При удалении ноды её дети теряют связь с родителем
  - `child.parentId = undefined` для каждого child

- [ ] **`isAncestor` проверка в `createBooleanNode`**
  - `isAncestor(childA, id)` — проверяет, не является ли childA предком
  - `isAncestor(childB, id)` — аналогично
  - `childA === id` — защита от самоссылки
  - Throw с понятным сообщением при обнаружении цикла

- [ ] **`visited Set` в `cloneSubtree`**
  - Рекурсивная функция `cloneRecursive` с visited Set
  - `if (visited.has(sourceId)) → throw`
  - `newIdMap` предотвращает дублирование shared children
  - Два boolean могут указывать на один primitive — не клонируем дважды

### ✅ Готовность к реализации
