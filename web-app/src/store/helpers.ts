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
 * Мировая рамка объекта по РЕАЛЬНОЙ геометрии с учётом полного TRS (ALIGN-REVIT).
 *
 * - Есть вершины (все объекты сцены: примитивы, CSG, импорт) — проекция вершин
 *   `world = pos + R·S·v` на оси: точная граница меша. Для бокса совпадает с проекцией
 *   OBB (8 углов); для повёрнутого цилиндра/конуса граница — реальный обод основания,
 *   а не угол описанного бокса.
 * - Вершин нет (объект из params, напр. до сборки воркером) — проекция OBB:
 *   локальная рамка из params → 8 углов → R·S → +pos (`obbWorldAABB`).
 *
 * FIX (ALIGN-PRIMITIVE-AABB, ALIGN-REVIT): раньше примитивы считались по params +
 * позиции без поворота и масштаба, а цилиндр/конус/призма (есть `radius`) — как сфера.
 * FIX (ALIGN-CSG-AABB, 9.5.2): кэш obj.aabb не используется — он ЛОКАЛЬНЫЙ.
 */
export function computeWorldAABB(obj: SceneObject): { min: Vec3; max: Vec3 } {
  if (obj.vertices.length > 0) return worldVerticesAABB(obj.vertices, obj.transform)
  return obbWorldAABB(localParamsBox(obj), obj.transform)
}

/**
 * Локальная рамка примитива из params (система объекта, вершины в origin) — запасной
 * путь, когда вершин ещё нет. Цилиндрические фигуры — вдоль локальной Z (как
 * `Manifold.cylinder`).
 */
export function localParamsBox(obj: SceneObject): { min: Vec3; max: Vec3 } {
  const p = obj.params
  let hx = 0, hy = 0, hz = 0
  if (p.width !== undefined && p.height !== undefined && p.depth !== undefined) {
    hx = p.width / 2; hy = p.height / 2; hz = p.depth / 2
  } else if (p.torusRadius !== undefined && p.tubeRadius !== undefined) {
    hx = hy = p.torusRadius + p.tubeRadius; hz = p.tubeRadius
  } else if (p.radius !== undefined && p.height !== undefined) {
    hx = hy = p.radius; hz = p.height / 2
  } else if (p.radius !== undefined) {
    hx = hy = hz = p.radius
  }
  return { min: { x: -hx, y: -hy, z: -hz }, max: { x: hx, y: hy, z: hz } }
}

/** 8 углов OBB: локальная рамка `box` через полный TRS `t` (pos + R·S·corner). */
export function obbCorners(box: { min: Vec3; max: Vec3 }, t: TransformNR): Vec3[] {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const out: Vec3[] = []
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    out.push({
      x: m00 * x + m01 * y + m02 * z + t.x,
      y: m10 * x + m11 * y + m12 * z + t.y,
      z: m20 * x + m21 * y + m22 * z + t.z,
    })
  }
  return out
}

/** Проекция OBB на мировые оси: min/max по 8 углам. */
export function obbWorldAABB(box: { min: Vec3; max: Vec3 }, t: TransformNR): { min: Vec3; max: Vec3 } {
  const c = obbCorners(box, t)
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const v of c) {
    for (const k of ['x', 'y', 'z'] as const) { if (v[k] < min[k]) min[k] = v[k]; if (v[k] > max[k]) max[k] = v[k] }
  }
  return { min, max }
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
 * рамка (min / center / max) совпала с рамкой якоря `anchorId`. Рамка — по реальной
 * геометрии с поворотом и масштабом (`computeWorldAABB`, ALIGN-REVIT). Общая для живого
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

// ---- Align: плоскость (ALIGN-UI-REVIT) ----

/** Плоскость выравнивания в мире: единичная нормаль и точка на плоскости. */
export interface WorldPlane { normal: Vec3; point: Vec3 }

/** Плоскость по оси X/Y/Z — мировая плоскость через начало координат (X → YZ, Y → XZ, Z → XY). */
export function axisPlane(axis: 'X' | 'Y' | 'Z'): WorldPlane {
  return {
    normal: { x: axis === 'X' ? 1 : 0, y: axis === 'Y' ? 1 : 0, z: axis === 'Z' ? 1 : 0 },
    point: { x: 0, y: 0, z: 0 },
  }
}

const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z)
  return l > 0 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 0, y: 0, z: 1 }
}

/**
 * Протяжённость реальной геометрии объекта вдоль нормали `n` (min/max проекции
 * `n·world`). Та же геометрия, что у `computeWorldAABB` (ALIGN-REVIT): вершины через
 * полный TRS; без вершин — 8 углов OBB из params. Для осей совпадает с
 * `computeWorldAABB` (min.x/max.x и т.д.).
 */
export function worldProjectionRange(obj: SceneObject, n: Vec3): { min: number; max: number } {
  const t = obj.transform
  let min = Infinity, max = -Infinity
  if (obj.vertices.length === 0) {
    for (const c of obbCorners(localParamsBox(obj), t)) {
      const s = dot3(c, n); if (s < min) min = s; if (s > max) max = s
    }
    return { min, max }
  }
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  // n·(pos + M·v) = n·pos + (Mᵀn)·v
  const kx = m00 * n.x + m10 * n.y + m20 * n.z
  const ky = m01 * n.x + m11 * n.y + m21 * n.z
  const kz = m02 * n.x + m12 * n.y + m22 * n.z
  const v = obj.vertices
  for (let i = 0; i < v.length; i += 3) {
    const s = kx * v[i] + ky * v[i + 1] + kz * v[i + 2]
    if (s < min) min = s; if (s > max) max = s
  }
  const off = n.x * t.x + n.y * t.y + n.z * t.z
  return { min: min + off, max: max + off }
}

/** Порог «грань параллельна плоскости»: |cos| ≥ cos 1°. */
export const ALIGN_PARALLEL_COS = Math.cos((1 * Math.PI) / 180)

/**
 * Сдвиг объекта B (мировой вектор вдоль нормали плоскости), чтобы его грань легла в
 * плоскость A (режим выравнивания ALIGN-UI-REVIT). Выбор грани B:
 * 1. кликнутая грань B параллельна плоскости (|cos| ≥ cos 1°) — в плоскость встаёт
 *    ИМЕННО она (точка клика лежит на грани), в т.ч. «ступенька» внутри CSG;
 * 2. не параллельна — крайняя точка B по нормали плоскости, со стороны, куда смотрит
 *    кликнутая грань (знак dot): грань «по направлению» к +n → max, к −n → min;
 * 3. без клика (или грань ⟂ плоскости) — ближайшая к плоскости крайняя точка B.
 * Протяжённость B — та же реальная геометрия, что у `solveAlignDeltas` (`worldProjectionRange`).
 */
export function solvePlaneAlignDelta(
  obj: SceneObject,
  plane: WorldPlane,
  pick?: { normal: Vec3; point: Vec3 },
): Vec3 {
  const n = unit(plane.normal)
  const p0 = dot3(n, plane.point)
  let s: number
  const c = pick ? dot3(unit(pick.normal), n) : 0
  if (pick && Math.abs(c) >= ALIGN_PARALLEL_COS) {
    s = dot3(n, pick.point) - p0
  } else {
    const r = worldProjectionRange(obj, n)
    const lo = r.min - p0, hi = r.max - p0
    s = c > 1e-9 ? hi : c < -1e-9 ? lo : (Math.abs(lo) <= Math.abs(hi) ? lo : hi)
  }
  return { x: -s * n.x, y: -s * n.y, z: -s * n.z }
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
  /** UX-AUDIT-31: копия 3D-текста — исходная строка и имя («Текст: …») */
  text?: string
  name?: string
  // For CSG results (pasted as baked mesh):
  csgVertices?: Float32Array
  csgIndices?: Uint32Array
  csgNormals?: Float32Array
  csgAABB?: { min: Vec3; max: Vec3 }
  csgOriginalBboxSize?: { x: number; y: number; z: number }
  /**
   * CSG-INDEPENDENT-COPY: снимок дерева CSG на момент копирования — вставка даёт
   * независимую параметрическую копию. Нет (запечённый корень, нет системы
   * создания) — вставка запечённым мешем, как раньше.
   */
  csgTree?: import('../csg/types').CopiedTree
  // For mirror primitive (paste from clipboard):
  mirrorVertices?: Float32Array
  mirrorIndices?: Uint32Array
  mirrorNormals?: Float32Array
}
