// ============================================================
// placement.ts — геометрия режима размещения (PLUG-AND-PLAY)
// ============================================================
// Чистые функции (без Three.js и стора): луч от курсора → плоскость → место фигуры.
// Плоскость — по приоритету:
//  1. ось зафиксирована клавишей X / Y / Z → мировая плоскость YZ / XZ / XY через начало координат;
//  2. луч попал в грань объекта → плоскость грани (мировые нормаль и точка попадания);
//  3. иначе — сетка: плоскость XY (z = 0).
// Нормаль плоскости оси и сетки смотрит на камеру (фигура встаёт со стороны зрителя).
// Точка на сетке и плоскости оси — с шагом привязки (snap); на грани — тоже, если грань
// перпендикулярна оси (координаты в плоскости грани), иначе точно в точке попадания.
// Фигура СТОИТ на плоскости: её локальная +Z — по нормали, основание (низ по локальной Z) —
// в точке, pivot (центр масс) = точка + нормаль × `bottom` (`bottom` = −min z вершин).

import type { TransformNR, Vec3 } from '../csg/types'
import type { FacePick } from './align-mode'
import { axisAngleMatrix, eulerXYZFromMatrix } from './helpers'

export type PlacementAxis = 'X' | 'Y' | 'Z'

/** Мировая плоскость оси (клавиша X → YZ, Y → XZ, Z → XY). */
export const AXIS_PLANE_NAME: Record<PlacementAxis, 'YZ' | 'XZ' | 'XY'> = { X: 'YZ', Y: 'XZ', Z: 'XY' }

/** Луч (мировые координаты, направление — единичное). */
export interface Ray3 { origin: Vec3; direction: Vec3 }

/** Плоскость размещения. */
export type PlacementPlane =
  | { kind: 'face'; objectId: string; normal: Vec3; point: Vec3 }
  | { kind: 'grid'; normal: Vec3; point: Vec3 }
  | { kind: 'axis'; axis: PlacementAxis; normal: Vec3; point: Vec3 }

/** Превью: плоскость, точка основания на ней и трансформ фигуры. */
export interface PlacementPreview { plane: PlacementPlane; point: Vec3; transform: TransformNR }

/** Куда смотрит курсор: луч и грань объекта под ним (если есть). */
export interface PlacementAim { ray: Ray3; face: FacePick | null }

/** Сетка — плоскость z = 0. */
export const GRID_NORMAL: Vec3 = { x: 0, y: 0, z: 1 }
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 }
const AXIS_NORMAL: Record<PlacementAxis, Vec3> = { X: { x: 1, y: 0, z: 0 }, Y: { x: 0, y: 1, z: 0 }, Z: { x: 0, y: 0, z: 1 } }
const EPS = 1e-9

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const neg = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z })
function unit(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z)
  return l < EPS ? { x: 0, y: 0, z: 1 } : { x: a.x / l, y: a.y / l, z: a.z / l }
}

/** Пересечение луча с плоскостью (только впереди луча); параллельно / позади — null. */
export function intersectRayPlane(ray: Ray3, normal: Vec3, point: Vec3): Vec3 | null {
  const denom = dot(normal, ray.direction)
  if (Math.abs(denom) < 1e-6) return null
  const t = (dot(normal, point) - dot(normal, ray.origin)) / denom
  if (!(t > 0) || !Number.isFinite(t)) return null
  return { x: ray.origin.x + ray.direction.x * t, y: ray.origin.y + ray.direction.y * t, z: ray.origin.z + ray.direction.z * t }
}

/** Нормаль, повёрнутая к камере (против направления луча). */
function facingRay(n: Vec3, ray: Ray3): Vec3 {
  return dot(n, ray.direction) > 0 ? neg(n) : n
}

/** Ось, которой параллельна нормаль (|компонента| ≈ 1), или null — грань наклонная. */
function alignedAxis(n: Vec3): 'x' | 'y' | 'z' | null {
  if (Math.abs(n.x) > 1 - 1e-6) return 'x'
  if (Math.abs(n.y) > 1 - 1e-6) return 'y'
  if (Math.abs(n.z) > 1 - 1e-6) return 'z'
  return null
}

/**
 * Шаг привязки в плоскости: координаты вдоль плоскости (две оси, кроме оси нормали) —
 * кратные `step`; по нормали — без изменений (точка остаётся на плоскости). Наклонная
 * плоскость или шаг ≤ 0 — точка без изменений.
 */
export function snapInPlane(p: Vec3, normal: Vec3, step: number): Vec3 {
  const ax = alignedAxis(normal)
  if (!ax || !(step > 0)) return p
  const r = (v: number) => Math.round(v / step) * step + 0   // + 0: без −0
  return { x: ax === 'x' ? p.x : r(p.x), y: ax === 'y' ? p.y : r(p.y), z: ax === 'z' ? p.z : r(p.z) }
}

/** Углы Эйлера XYZ (градусы, как у TransformNR), поворачивающие локальную +Z в `normal`. */
export function rotationForNormal(normal: Vec3): { rotX: number; rotY: number; rotZ: number } {
  const n = unit(normal)
  const c = Math.max(-1, Math.min(1, n.z))                    // cos угла между +Z и n
  if (c > 1 - 1e-9) return { rotX: 0, rotY: 0, rotZ: 0 }
  if (c < -1 + 1e-9) return { rotX: 180, rotY: 0, rotZ: 0 }  // вниз — переворот вокруг X
  const axis = unit({ x: -n.y, y: n.x, z: 0 })                // +Z × n
  const e = eulerXYZFromMatrix(axisAngleMatrix(axis, Math.acos(c)))
  const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e9) / 1e9)
  return { rotX: clean(e.rotX), rotY: clean(e.rotY), rotZ: clean(e.rotZ) }
}

/** Трансформ фигуры, стоящей основанием в `point` на плоскости с нормалью `normal`. */
export function placementTransform(normal: Vec3, point: Vec3, bottom: number): TransformNR {
  const n = unit(normal)
  const clean = (v: number) => Math.round(v * 1e6) / 1e6 + 0
  return {
    x: clean(point.x + n.x * bottom), y: clean(point.y + n.y * bottom), z: clean(point.z + n.z * bottom),
    ...rotationForNormal(n),
    scaleX: 1, scaleY: 1, scaleZ: 1,
  }
}

/** Расстояние от центра (pivot) до основания по локальной Z: −min z вершин (вершины — в origin). */
export function meshBottom(vertices: ArrayLike<number>): number {
  let min = Infinity
  for (let i = 2; i < vertices.length; i += 3) if (vertices[i] < min) min = vertices[i]
  return Number.isFinite(min) ? -min : 0
}

/** Плоскость под курсором (без точки привязки): ось → грань → сетка. */
export function resolvePlacementPlane(aim: PlacementAim, lock: PlacementAxis | null): PlacementPlane | null {
  const { ray, face } = aim
  if (lock) {
    const normal = facingRay(AXIS_NORMAL[lock], ray)
    const hit = intersectRayPlane(ray, normal, ORIGIN)
    if (!hit) return null
    const k = lock === 'X' ? 'x' : lock === 'Y' ? 'y' : 'z'
    return { kind: 'axis', axis: lock, normal, point: { ...hit, [k]: 0 } }   // ровно в плоскости
  }
  if (face) return { kind: 'face', objectId: face.objectId, normal: facingRay(unit(face.normal), ray), point: face.point }
  const normal = facingRay(GRID_NORMAL, ray)
  const hit = intersectRayPlane(ray, normal, ORIGIN)
  return hit ? { kind: 'grid', normal, point: { ...hit, z: 0 } } : null
}

/**
 * Превью размещения: плоскость (ось → грань → сетка), точка с привязкой `snap` и трансформ
 * фигуры, стоящей на плоскости (`bottom` — от центра до основания). Луч мимо плоскости — null.
 */
export function resolvePlacement(aim: PlacementAim, opts: { lock: PlacementAxis | null; snap: number; bottom: number }): PlacementPreview | null {
  const plane = resolvePlacementPlane(aim, opts.lock)
  if (!plane) return null
  const point = snapInPlane(plane.point, plane.normal, opts.snap)
  return { plane, point, transform: placementTransform(plane.normal, point, opts.bottom) }
}
