// ============================================================
// Store helpers — shared utilities for document-store
// ============================================================

import type {
  SceneObject, ShapeType, ShapeParams, TransformNR, Vec3, MirrorPlane, AlignPlane, AlignMove,
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
/** UX-AUDIT-37: грань B перпендикулярна плоскости A, если |cos| ≤ sin 1° (90° ± 1°) — поворот в ту же сторону. */
export const ALIGN_PERP_SIN = Math.sin((1 * Math.PI) / 180)

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

/** Матрица поворота 3×3 (по строкам) на угол `angle` вокруг единичной оси `k` (Родригес). */
export function axisAngleMatrix(k: Vec3, angle: number): number[] {
  const c = Math.cos(angle), s = Math.sin(angle), v = 1 - c
  return [
    c + k.x * k.x * v, k.x * k.y * v - k.z * s, k.x * k.z * v + k.y * s,
    k.y * k.x * v + k.z * s, c + k.y * k.y * v, k.y * k.z * v - k.x * s,
    k.z * k.x * v - k.y * s, k.z * k.y * v + k.x * s, c + k.z * k.z * v,
  ]
}

/**
 * Параметры фигуры по умолчанию (`addShape` без params и превью режима размещения).
 * UX-AUDIT-14: у цилиндра — свои параметры (раньше падал в ветку куба: width/height/depth;
 * геометрия та же — радиус 10 и 48 сегментов по умолчанию воркера, высота 20).
 */
export function defaultShapeParams(shapeType: ShapeType): ShapeParams {
  return shapeType === 'sphere' ? { radius: 12, segments: 32 }
    : shapeType === 'cylinder' ? { radius: 10, height: 20 }
      : shapeType === 'cone' ? { radius: 10, height: 24, segments: 32 }
        : shapeType === 'torus' ? { torusRadius: 15, tubeRadius: 4, segments: 32, tubeSegments: 16 }
          : shapeType === 'prism' ? { radius: 12, height: 20, sides: 6 }
            : shapeType === 'pyramid' ? { radius: 12, height: 20, sides: 4 }
              : { width: 20, height: 20, depth: 20 }
}

/** Произведение матриц 3×3 (по строкам). */
function mul3(a: number[], b: number[]): number[] {
  const r = new Array<number>(9)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
  }
  return r
}

/** Углы Эйлера XYZ (градусы) из матрицы поворота R = Rx·Ry·Rz — как `computeRSMatrix` и Three.js 'XYZ'. */
export function eulerXYZFromMatrix(m: number[]): { rotX: number; rotY: number; rotZ: number } {
  const deg = 180 / Math.PI
  const ry = Math.asin(Math.max(-1, Math.min(1, m[2])))
  if (Math.abs(m[2]) < 0.9999999) {
    return { rotX: Math.atan2(-m[5], m[8]) * deg, rotY: ry * deg, rotZ: Math.atan2(-m[1], m[0]) * deg }
  }
  return { rotX: Math.atan2(m[7], m[4]) * deg, rotY: ry * deg, rotZ: 0 }
}

/**
 * UX-AUDIT-42: углы Эйлера XYZ `next` (как из `eulerXYZFromMatrix` или Three.js — в (−180°, 180°]) в
 * записи, ближайшей к прежним `prev`: тот же поворот, но дельта каждого угла — в [−180°, 180°].
 * Кандидаты — (x, y, z) и равносильная (x + 180, 180 − y, z + 180), каждый угол ± k·360 к прежнему;
 * берётся запись с меньшей суммой |дельт|. Было: дельта шага — «после − до» как есть: куб rotZ 170,
 * повёрнутый на +30°, получал −160 и шаг «поворот (0, 0, −330)°».
 */
export function continuousEuler(
  next: { rotX: number; rotY: number; rotZ: number },
  prev: { rotX: number; rotY: number; rotZ: number },
): { rotX: number; rotY: number; rotZ: number } {
  const near = (a: number, ref: number) => a + 360 * Math.round((ref - a) / 360)
  const fit = (x: number, y: number, z: number) => {
    const r = { rotX: near(x, prev.rotX), rotY: near(y, prev.rotY), rotZ: near(z, prev.rotZ) }
    return { r, cost: Math.abs(r.rotX - prev.rotX) + Math.abs(r.rotY - prev.rotY) + Math.abs(r.rotZ - prev.rotZ) }
  }
  const a = fit(next.rotX, next.rotY, next.rotZ)
  const b = fit(next.rotX + 180, 180 - next.rotY, next.rotZ + 180)
  return b.cost < a.cost - 1e-9 ? b.r : a.r
}

/**
 * UX-AUDIT-41: центр поворота объекта при выравнивании — точка, вокруг которой он поворачивается
 * «на месте». У примитивов и импорта — опорная точка (X/Y/Z в свойствах: вершины вокруг неё, у
 * конуса и пирамиды это центр масс). У CSG опорная точка — позиция операнда A (Фаза 8.5), а не
 * центр тела, поэтому — центр его рамки (OBB: центр локальной рамки вершин через полный TRS).
 */
export function alignRotationCenter(obj: Pick<SceneObject, 'shapeType' | 'vertices' | 'transform'>): Vec3 {
  const t = obj.transform
  if (obj.shapeType !== 'csg' || obj.vertices.length === 0) return { x: t.x, y: t.y, z: t.z }
  const b = computeAABB(obj.vertices)
  const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2
  const m = computeRSMatrix({ rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ })
  return {
    x: t.x + m[0] * cx + m[1] * cy + m[2] * cz,
    y: t.y + m[3] * cx + m[4] * cy + m[5] * cz,
    z: t.z + m[6] * cx + m[7] * cy + m[8] * cz,
  }
}

/** Порог «гладкая поверхность» для выравнивания (°) — тот же, что у затенения по излому
 *  (`components/object-geometry` CREASE_ANGLE_DEG): что выглядит гладким, то и считается кривым. */
export const ALIGN_SMOOTH_DEG = 30

/**
 * UX-AUDIT-32: треугольник `tri` — грань ГЛАДКОЙ поверхности (цилиндр, сфера, скругление CSG):
 * у соседа по ребру нормаль отличается на 0,5°…ALIGN_SMOOTH_DEG. Нормаль такой грани — артефакт
 * разбиения на треугольники: выравнивание по ней не поворачивает объект (касание крайней точкой,
 * как ALIGN-REVIT). Плоская грань (соседи — в той же плоскости или за острым ребром) — поворачивает.
 * Соседи — по общим индексам вершин (меши воркера индексированы с общими вершинами).
 */
export function isSmoothSurfaceAt(obj: Pick<SceneObject, 'vertices' | 'indices'>, tri: number): boolean {
  const v = obj.vertices, idx = obj.indices
  const count = idx.length / 3
  if (!(tri >= 0 && tri < count)) return false
  const normal = (k: number): Vec3 => {
    const a = idx[k * 3] * 3, b = idx[k * 3 + 1] * 3, c = idx[k * 3 + 2] * 3
    const e1x = v[b] - v[a], e1y = v[b + 1] - v[a + 1], e1z = v[b + 2] - v[a + 2]
    const e2x = v[c] - v[a], e2y = v[c + 1] - v[a + 1], e2z = v[c + 2] - v[a + 2]
    return unit({ x: e1y * e2z - e1z * e2y, y: e1z * e2x - e1x * e2z, z: e1x * e2y - e1y * e2x })
  }
  const n0 = normal(tri)
  const own = [idx[tri * 3], idx[tri * 3 + 1], idx[tri * 3 + 2]]
  const cosSmooth = Math.cos((ALIGN_SMOOTH_DEG * Math.PI) / 180)
  const cosFlat = Math.cos((0.5 * Math.PI) / 180)
  for (let k = 0; k < count; k++) {
    if (k === tri) continue
    let shared = 0
    for (let j = 0; j < 3; j++) { const w = idx[k * 3 + j]; if (w === own[0] || w === own[1] || w === own[2]) shared++ }
    if (shared < 2) continue
    const c = dot3(n0, normal(k))
    if (c > cosSmooth && c < cosFlat) return true
  }
  return false
}

/**
 * UX-AUDIT-32: новый трансформ объекта B — его грань B ложится в плоскость A («Align to face»,
 * как в Revit/Fusion; режим выравнивания ALIGN-UI-REVIT).
 * - Грань B параллельна плоскости (нормали ∥ или встречны, |cos| ≥ cos 1°), клика нет или кликнута
 *   грань гладкой поверхности (`isSmoothSurfaceAt`: цилиндр, сфера — нормаль грани — артефакт
 *   разбиения) — как раньше, только сдвиг (`solvePlaneAlignDelta`: касание крайней точкой).
 * - Не параллельна — сначала ПОВОРОТ по кратчайшей дуге: мировая нормаль грани B → нормаль
 *   плоскости A — в ту же сторону (угол ≤ 90°) или встречно (> 90°, UX-AUDIT-37), на меньший угол;
 *   на месте — вокруг центра тела (`alignRotationCenter`: у примитивов — опорная точка,
 *   UX-AUDIT-32-followup: было — вокруг точки клика, объект уходил вбок; у CSG — центр рамки,
 *   UX-AUDIT-41: было — вокруг операнда A, тело уходило вбок); затем сдвиг только
 *   вдоль нормали A, чтобы грань легла в плоскость. Раньше поворота не было: объект сдвигался до
 *   касания крайней точкой, а если она уже в плоскости — не происходило ничего.
 * Поворот — слева к текущему (R' = ΔR·R): масштаб остаётся в локальных осях. Результат — обычный
 * шаг move (сдвиг + дельта углов), он воспроизводится из истории.
 */
export function solvePlaneAlignTransform(
  obj: SceneObject,
  plane: WorldPlane,
  pick?: { normal: Vec3; point: Vec3; triangleIndex?: number },
): TransformNR {
  const t = obj.transform
  const n = unit(plane.normal)
  const c = pick ? dot3(unit(pick.normal), n) : 1
  if (!pick || Math.abs(c) >= ALIGN_PARALLEL_COS || (pick.triangleIndex !== undefined && isSmoothSurfaceAt(obj, pick.triangleIndex))) {
    const d = solvePlaneAlignDelta(obj, plane, pick)
    return { ...t, x: t.x + d.x, y: t.y + d.y, z: t.z + d.z }
  }
  const nb = unit(pick.normal)
  // UX-AUDIT-37: куда повернуть нормаль B — на меньший угол, как «совпадение» граней в SolidWorks:
  // угол между нормалями ≤ 90° (перпендикулярная — с допуском 1°) — в ту же сторону, что нормаль A
  // (решение UX-AUDIT-32); > 90° — встречно (−n): грань почти встречная доворачивается и объект
  // остаётся на своей стороне плоскости, как строго встречная. Было: всегда в ту же сторону —
  // грань под 5° к встречной переворачивалась на 175° на другую сторону плоскости.
  const target = c < -ALIGN_PERP_SIN ? { x: -n.x, y: -n.y, z: -n.z } : n
  // ось поворота nb × target (не ноль: грань не параллельна), угол — между нормалями
  const ax = { x: nb.y * target.z - nb.z * target.y, y: nb.z * target.x - nb.x * target.z, z: nb.x * target.y - nb.y * target.x }
  const k = unit(ax)
  const rd = axisAngleMatrix(k, Math.acos(Math.max(-1, Math.min(1, dot3(nb, target)))))
  const r0 = computeRSMatrix({ rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: 1, scaleY: 1, scaleZ: 1 })
  // UX-AUDIT-42: углы — в записи, ближайшей к прежним (дельта шага в ±180°, а не −330°)
  const rot = continuousEuler(eulerXYZFromMatrix(mul3(rd, r0)), t)
  // UX-AUDIT-32-followup: поворот — на месте, а не вокруг точки клика. UX-AUDIT-41: центр поворота c
  // — центр тела (`alignRotationCenter`): у примитивов это опорная точка, у CSG — центр рамки (раньше —
  // опорная точка, т. е. операнд A: тело уходило вбок). Опорная точка и точка клика после поворота:
  // p' = c + ΔR·(p − c), q' = c + ΔR·(q − c); грань B (через q', нормаль ±n) — в плоскость A сдвигом
  // только вдоль n.
  const c0 = alignRotationCenter(obj)
  const around = (v: Vec3): Vec3 => {
    const dx = v.x - c0.x, dy = v.y - c0.y, dz = v.z - c0.z
    return {
      x: c0.x + rd[0] * dx + rd[1] * dy + rd[2] * dz,
      y: c0.y + rd[3] * dx + rd[4] * dy + rd[5] * dz,
      z: c0.z + rd[6] * dx + rd[7] * dy + rd[8] * dz,
    }
  }
  const p1 = around({ x: t.x, y: t.y, z: t.z })
  const q1 = around(pick.point)
  const s = dot3(n, q1) - dot3(n, plane.point)
  return { ...t, ...rot, x: p1.x - s * n.x, y: p1.y - s * n.y, z: p1.z - s * n.z }
}

// ---- ALIGN-PLANE-RESOLVE: шаг выравнивания по плоскости ----

/** Матрица поворота (без масштаба) трансформа — по строкам. */
const rotOnly = (t: TransformNR): number[] =>
  computeRSMatrix({ rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: 1, scaleY: 1, scaleZ: 1 })
const safeScale = (k: number): number => (Math.abs(k) > 1e-12 ? k : 1e-12)

/**
 * Грань (мировые нормаль и точка) → система объекта с трансформом `t`:
 * p = S⁻¹·Rᵀ·(p_мир − pos), n ∝ S·Rᵀ·n_мир (нормаль — обратная транспонированная к R·S).
 */
export function faceToLocal(t: TransformNR, normal: Vec3, point: Vec3): { normal: Vec3; point: Vec3 } {
  const r = rotOnly(t)
  const rt = (v: Vec3): Vec3 => ({
    x: r[0] * v.x + r[3] * v.y + r[6] * v.z,
    y: r[1] * v.x + r[4] * v.y + r[7] * v.z,
    z: r[2] * v.x + r[5] * v.y + r[8] * v.z,
  })
  const q = rt({ x: point.x - t.x, y: point.y - t.y, z: point.z - t.z })
  const n = rt(normal)
  return {
    point: { x: q.x / safeScale(t.scaleX), y: q.y / safeScale(t.scaleY), z: q.z / safeScale(t.scaleZ) },
    normal: unit({ x: n.x * t.scaleX, y: n.y * t.scaleY, z: n.z * t.scaleZ }),
  }
}

/** Грань в системе объекта → мир: p_мир = pos + R·S·p, n_мир ∝ R·S⁻¹·n. */
export function faceToWorld(t: TransformNR, normal: Vec3, point: Vec3): { normal: Vec3; point: Vec3 } {
  const r = rotOnly(t)
  const rv = (v: Vec3): Vec3 => ({
    x: r[0] * v.x + r[1] * v.y + r[2] * v.z,
    y: r[3] * v.x + r[4] * v.y + r[5] * v.z,
    z: r[6] * v.x + r[7] * v.y + r[8] * v.z,
  })
  const q = rv({ x: point.x * t.scaleX, y: point.y * t.scaleY, z: point.z * t.scaleZ })
  return {
    point: { x: t.x + q.x, y: t.y + q.y, z: t.z + q.z },
    normal: unit(rv({ x: normal.x / safeScale(t.scaleX), y: normal.y / safeScale(t.scaleY), z: normal.z / safeScale(t.scaleZ) })),
  }
}

/** Мировая плоскость A шага выравнивания: грань объекта-якоря (следует за ним) или ось X/Y/Z. */
export function planeAlignWorldPlane(
  objects: Record<string, SceneObject>, plane: AlignPlane, anchorId: string,
): WorldPlane | null {
  if (!anchorId) return { normal: { ...plane.normal }, point: { ...plane.point } }
  const a = objects[anchorId]
  return a ? faceToWorld(a.transform, plane.normal, plane.point) : null
}

/**
 * ALIGN-PLANE-RESOLVE: решение шага выравнивания по плоскости для цели `id` по объектам на этом
 * шаге — грань B цели в плоскость A (`solvePlaneAlignTransform`: поворот на месте + сдвиг вдоль
 * нормали A, правило 37, углы — непрерывно). Одно решение у живого «Выровнять» и у каскада
 * правки прошлого шага: плоскость и грань — в системах своих объектов, поэтому после правки
 * шага до выравнивания объект снова ложится в плоскость. `null` — нет цели, грани или якоря.
 */
export function solvePlaneAlignMove(
  objects: Record<string, SceneObject>, plane: AlignPlane, anchorId: string, id: string,
): AlignMove | null {
  const obj = objects[id]
  const face = plane.faces[id]
  const wp = planeAlignWorldPlane(objects, plane, anchorId)
  if (!obj || !face || !wp) return null
  const wf = faceToWorld(obj.transform, face.normal, face.point)
  const t = obj.transform
  const next = solvePlaneAlignTransform(obj, wp, { normal: wf.normal, point: wf.point, triangleIndex: face.triangleIndex })
  return {
    delta: { x: next.x - t.x, y: next.y - t.y, z: next.z - t.z },
    rotDelta: { x: next.rotX - t.rotX, y: next.rotY - t.rotY, z: next.rotZ - t.rotZ },
  }
}

/** Ось, ближайшая к нормали (подпись шага и иконка). */
export function dominantAxis(n: Vec3): 'X' | 'Y' | 'Z' {
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z)
  return ax >= ay && ax >= az ? 'X' : ay >= az ? 'Y' : 'Z'
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
