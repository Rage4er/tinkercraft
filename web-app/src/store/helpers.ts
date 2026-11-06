// ============================================================
// Store helpers — shared utilities for document-store
// ============================================================

import type {
  SceneObject, ShapeType, ShapeParams, TransformNR, Vec3, MirrorPlane,
} from '../csg/types'
import { OBJECT_COLORS } from '../constants'
import { computeRSMatrix } from '../csg/worker-matrix'

// ---- Mirror list composition (FIX 8.5.12) ----

/**
 * FIX (8.5.12): compose a mirror-plane list with adjacent-plane cancellation.
 * Same adjacent plane twice = identity (pop); otherwise push. Returns
 * undefined when the list empties (double mirror = original geometry).
 */
export function composeMirroredList(
  current: MirrorPlane[] | undefined,
  plane: MirrorPlane,
): MirrorPlane[] | undefined {
  const list = current ? [...current] : []
  if (list.length > 0 && list[list.length - 1] === plane) {
    list.pop()
  } else {
    list.push(plane)
  }
  return list.length > 0 ? list : undefined
}

// ---- AABB ----
export function computeAABB(vertices: Float32Array): { min: Vec3; max: Vec3 } {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i] < minX) minX = vertices[i]; if (vertices[i] > maxX) maxX = vertices[i]
    if (vertices[i + 1] < minY) minY = vertices[i + 1]; if (vertices[i + 1] > maxY) maxY = vertices[i + 1]
    if (vertices[i + 2] < minZ) minZ = vertices[i + 2]; if (vertices[i + 2] > maxZ) maxZ = vertices[i + 2]
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}

/**
 * Вычисляет мировую ограничивающую рамку (AABB) объекта.
 *
 * Для примитивов — из params + transform.position (надёжно, не зависит от вершин).
 * Для CSG/import/прочих — по вершинам с полным TRS (кэш obj.aabb не используется:
 * он в локальной системе объекта).
 */
export function computeWorldAABB(obj: SceneObject): { min: Vec3; max: Vec3 } {
  // 1. Примитивы — считаем из params + transform (надёжно)
  if (obj.params && obj.params.width !== undefined && obj.params.height !== undefined && obj.params.depth !== undefined) {
    const w = obj.params.width / 2
    const h = obj.params.height / 2
    const d = obj.params.depth / 2
    const p = obj.transform
    return {
      min: { x: p.x - w, y: p.y - h, z: p.z - d },
      max: { x: p.x + w, y: p.y + h, z: p.z + d },
    }
  }
  // 2. Сфера
  if (obj.params && obj.params.radius !== undefined) {
    const r = obj.params.radius
    const p = obj.transform
    return {
      min: { x: p.x - r, y: p.y - r, z: p.z - r },
      max: { x: p.x + r, y: p.y + r, z: p.z + r },
    }
  }
  // 3. CSG / import — по вершинам в мире (render = data: world = pos + R·S·v).
  // FIX (ALIGN-CSG-AABB, 9.5.2): раньше брался кэш obj.aabb — он ЛОКАЛЬНЫЙ (вершины
  // CSG лежат в системе операнда A, pivot = TRS A), поэтому выравнивание CSG было
  // смещено на позицию A; после пересборки из истории кэш другой (живой moveObject
  // сдвигает его на дельту) — re-solve align (В2) не совпадал бы с живым действием.
  return worldVerticesAABB(obj.vertices, obj.transform)
}

/** AABB вершин объекта в мировых координатах (pos + R·S·v). */
export function worldVerticesAABB(vertices: Float32Array, t: TransformNR): { min: Vec3; max: Vec3 } {
  if (vertices.length === 0) return { min: { x: t.x, y: t.y, z: t.z }, max: { x: t.x, y: t.y, z: t.z } }
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]
    const wx = m00 * x + m01 * y + m02 * z + t.x
    const wy = m10 * x + m11 * y + m12 * z + t.y
    const wz = m20 * x + m21 * y + m22 * z + t.z
    if (wx < minX) minX = wx; if (wx > maxX) maxX = wx
    if (wy < minY) minY = wy; if (wy > maxY) maxY = wy
    if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}

// ---- Extrude ----

/**
 * Плита extrude по мировой рамке базы (Фаза 9.5.4): поперёк оси — во всю рамку,
 * вдоль оси — |depth| от грани max (depth > 0) или min (depth < 0). Общая для живого
 * `extrudeSelected` и пересчёта плиты при правке шага (глубина, сдвиг базы раньше).
 */
export function extrudeSlab(
  bbox: { min: Vec3; max: Vec3 },
  axis: 'X' | 'Y' | 'Z',
  depth: number,
): { params: ShapeParams; transform: TransformNR } {
  const ax = axis.toLowerCase() as 'x' | 'y' | 'z'
  const ad = Math.abs(depth)
  const size = { x: bbox.max.x - bbox.min.x, y: bbox.max.y - bbox.min.y, z: bbox.max.z - bbox.min.z }
  const c = { x: (bbox.min.x + bbox.max.x) / 2, y: (bbox.min.y + bbox.max.y) / 2, z: (bbox.min.z + bbox.max.z) / 2 }
  c[ax] = depth > 0 ? bbox.max[ax] + ad / 2 : bbox.min[ax] - ad / 2
  const dims = { ...size, [ax]: ad }
  return {
    params: { width: dims.x, height: dims.y, depth: dims.z },
    transform: { x: c.x, y: c.y, z: c.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  }
}

// ---- Align ----

/** Координата рамки по оси для якоря выравнивания. */
function alignCoord(b: { min: Vec3; max: Vec3 }, ax: 'x' | 'y' | 'z', anchor: 'min' | 'center' | 'max'): number {
  return anchor === 'min' ? b.min[ax] : anchor === 'max' ? b.max[ax] : (b.min[ax] + b.max[ax]) / 2
}

/**
 * Смещения выравнивания: каждая цель из `targetIds` двигается по оси так, чтобы её
 * рамка (min / center / max) совпала с рамкой якоря `anchorId`. Общая для живого
 * `alignSelected` и re-solve каскада правки шага (9.5.2, решение В2) — одна семантика.
 * Объекты, которых нет в `objects`, пропускаются.
 */
export function solveAlignDeltas(
  objects: Record<string, SceneObject>,
  targetIds: string[],
  axis: 'X' | 'Y' | 'Z',
  anchor: 'min' | 'center' | 'max',
  anchorId: string,
): Record<string, number> {
  const ax = axis.toLowerCase() as 'x' | 'y' | 'z'
  const anchorObj = objects[anchorId]
  if (!anchorObj) return {}
  const target = alignCoord(computeWorldAABB(anchorObj), ax, anchor)
  const deltas: Record<string, number> = {}
  for (const id of targetIds) {
    const obj = objects[id]
    if (!obj || id === anchorId) continue
    deltas[id] = target - alignCoord(computeWorldAABB(obj), ax, anchor)
  }
  return deltas
}

/** Returns bbox center for a vertex buffer (no mutation). */
export function computeCenter(vertices: Float32Array): Vec3 {
  const { min, max } = computeAABB(vertices)
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }
}

/** Shifts vertices so bbox center is at origin; MUTATES the input array in-place.
/**
 * Extract center from vertices, center them in place, and return center.
 * MUTATES the input array — caller should pass a copy if they need the original.
 * FIX (MED-18-6): Explicit mutation documented in JSDoc and name (extractAndCenterInPlace).
 * @returns the offset {cx, cy, cz} that was subtracted from all vertices.
 */
export function extractAndCenterInPlace(vertices: Float32Array): { cx: number; cy: number; cz: number } {
  if (vertices.length === 0) return { cx: 0, cy: 0, cz: 0 }
  const c = computeCenter(vertices)
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= c.x; vertices[i + 1] -= c.y; vertices[i + 2] -= c.z
  }
  return { cx: c.x, cy: c.y, cz: c.z }
}

// Computes the bbox center of a vertex buffer, shifts all vertices so the
// center is at the origin, returns the offset, and returns the AABB of
// the CENTERED geometry (after shifting). Single-pass: O(n).
//
// Prefer this over extractAndCenterInPlace() + makeObject() (two passes) for
// CSG results where both centering and AABB-caching are needed.
export function extractAndCenterGetAABB(vertices: Float32Array): {
  cx: number; cy: number; cz: number
  aabb: { min: Vec3; max: Vec3 }
} {
  if (vertices.length === 0) return { cx: 0, cy: 0, cz: 0, aabb: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }

  // Single pass: find bbox center, then shift + compute centered AABB
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i] < minX) minX = vertices[i]; if (vertices[i] > maxX) maxX = vertices[i]
    if (vertices[i + 1] < minY) minY = vertices[i + 1]; if (vertices[i + 1] > maxY) maxY = vertices[i + 1]
    if (vertices[i + 2] < minZ) minZ = vertices[i + 2]; if (vertices[i + 2] > maxZ) maxZ = vertices[i + 2]
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2

  // Shift + compute centered AABB in one pass
  let cMinX = Infinity, cMaxX = -Infinity
  let cMinY = Infinity, cMaxY = -Infinity
  let cMinZ = Infinity, cMaxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= cx; if (vertices[i] < cMinX) cMinX = vertices[i]; if (vertices[i] > cMaxX) cMaxX = vertices[i]
    vertices[i + 1] -= cy; if (vertices[i + 1] < cMinY) cMinY = vertices[i + 1]; if (vertices[i + 1] > cMaxY) cMaxY = vertices[i + 1]
    vertices[i + 2] -= cz; if (vertices[i + 2] < cMinZ) cMinZ = vertices[i + 2]; if (vertices[i + 2] > cMaxZ) cMaxZ = vertices[i + 2]
  }

  return { cx, cy, cz, aabb: { min: { x: cMinX, y: cMinY, z: cMinZ }, max: { x: cMaxX, y: cMaxY, z: cMaxZ } } }
}

/** Extract AABB and center vertices relative to a GIVEN point (not bbox center).
 *
 * FIX (CSG-TRANSFORM-IS-CENTROID): For CSG results, vertices must be centered
 * relative to transformA (first operand position), NOT the CSG bbox center.
 * The bbox center differs from transformA for asymmetric geometry (e.g., cube+prism),
 * causing the CSG result to render at a shifted position.
 *
 * This function centers vertices at `center` and returns the AABB of the
 * CENTERED geometry. Single-pass: O(n).
 */
export function extractCenteredAt(vertices: Float32Array, center: { x: number; y: number; z: number }): {
  aabb: { min: Vec3; max: Vec3 }
} {
  if (vertices.length === 0) return { aabb: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }

  // Shift vertices relative to `center` + compute centered AABB in one pass
  let cMinX = Infinity, cMaxX = -Infinity
  let cMinY = Infinity, cMaxY = -Infinity
  let cMinZ = Infinity, cMaxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= center.x; if (vertices[i] < cMinX) cMinX = vertices[i]; if (vertices[i] > cMaxX) cMaxX = vertices[i]
    vertices[i + 1] -= center.y; if (vertices[i + 1] < cMinY) cMinY = vertices[i + 1]; if (vertices[i + 1] > cMaxY) cMaxY = vertices[i + 1]
    vertices[i + 2] -= center.z; if (vertices[i + 2] < cMinZ) cMinZ = vertices[i + 2]; if (vertices[i + 2] > cMaxZ) cMaxZ = vertices[i + 2]
  }

  return { aabb: { min: { x: cMinX, y: cMinY, z: cMinZ }, max: { x: cMaxX, y: cMaxY, z: cMaxZ } } }
}

// ============================================================
// centerMassAtOrigin / isClosedMesh перенесены в csg/geometry-utils
// (Фаза 8, Этап 6.5 — унификация центрирования). Worker не может
// импортировать store-слой, поэтому функция живёт в csg-слое.
// Реэкспорт сохраняет обратную совместимость (helpers.test.ts, rebuild.ts).
// ============================================================
export { centerMassAtOrigin, isClosedMesh } from '../csg/geometry-utils'

/** Creates a SceneObject with cached AABB. Use everywhere a new object is created. */
// FIX (LOW-18-6): Accept optional pre-computed AABB to avoid redundant computeAABB calls.
export function makeObject(partial: Omit<SceneObject, 'aabb'> & { aabb?: SceneObject['aabb'] }): SceneObject {
  return { ...partial, aabb: partial.aabb ?? computeAABB(partial.vertices) }
}

// ---- ID generator ----
let _idCounter = 0
export function nextId(prefix = 'obj'): string { return `${prefix}_${++_idCounter}` }

/** Resets the ID counter (for testing only). */
export function resetIdCounter(): void { _idCounter = 0 }

// ---- Colors ----
export function colorForIndex(n: number): string { return OBJECT_COLORS[n % OBJECT_COLORS.length] }

// ---- Clipboard entry ----
export interface ClipEntry {
  shapeType: ShapeType
  params: ShapeParams
  color: string
  transform: TransformNR
  /** FIX (8.5.12): mirror planes for mirror primitives — paste preserves mirror. */
  mirrored?: import('../csg/types').MirrorPlane[]
  // For import_mesh:
  importVertices?: Float32Array
  importIndices?: Uint32Array
  // For CSG results (pasted as baked mesh):
  csgVertices?: Float32Array
  csgIndices?: Uint32Array
  csgNormals?: Float32Array
  csgAABB?: { min: Vec3; max: Vec3 }
  csgOriginalBboxSize?: { x: number; y: number; z: number }
  // For mirror primitive (paste from clipboard):
  mirrorVertices?: Float32Array
  mirrorIndices?: Uint32Array
  mirrorNormals?: Float32Array
}
