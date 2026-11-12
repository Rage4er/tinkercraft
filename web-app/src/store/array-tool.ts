// ============================================================
// array-tool — ARRAY-TOOL: массив копий (линейный, круговой)
// ============================================================
// Выбранные объекты повторяются N раз (N — всего экземпляров, включая исходный):
//  • линейный — сдвиг на `step` мм вдоль мировой оси X / Y / Z на каждый экземпляр;
//  • круговой — поворот вокруг мировой оси X / Y / Z через точку `center`: позиция И ориентация
//    объекта (как у кругового массива в CAD); 360° — экземпляры через 360 / N, иначе от 0 до угла.
// Массив — ОДИН шаг истории `array` (параметры + запечённые шаги копий, как у вставки), см.
// `ArrayOperation` в csg/types.ts. Копии — независимые объекты (clip-instance: примитив, импорт /
// текст, зеркальный, CSG с независимым деревом).

import type { ArrayOperation, ArrayParams, SceneObject, TinkerCraftOperation, TransformNR, Vec3 } from '../csg/types'
import { computeRSMatrix } from '../csg/worker-matrix'
import { axisAngleMatrix, continuousEuler, eulerXYZFromMatrix, nextId } from './helpers'
import { clipOf, instantiateClip } from './clip-instance'

/** Пределы: экземпляров в массиве и новых объектов за один шаг */
export const ARRAY_MAX_COUNT = 100
export const ARRAY_MAX_NEW_OBJECTS = 500

const AXIS_VEC: Record<ArrayParams['axis'], Vec3> = { X: { x: 1, y: 0, z: 0 }, Y: { x: 0, y: 1, z: 0 }, Z: { x: 0, y: 0, z: 1 } }
const AXIS_KEY = { X: 'x', Y: 'y', Z: 'z' } as const

/** Параметры по умолчанию (окно «Массив»): линейный — ×3 по X, шаг 20; круговой — ×6 вокруг Z, 360°, центр — начало координат. */
export const DEFAULT_ARRAY_PARAMS: Required<ArrayParams> = {
  kind: 'linear', axis: 'X', count: 3, step: 20, angle: 360, center: { x: 0, y: 0, z: 0 },
}

/** Параметры в допустимых пределах: N — целое 2…100, конечные числа; круговой — угол ≠ 0. */
export function sanitizeArrayParams(p: ArrayParams): ArrayParams {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
  const count = Math.max(2, Math.min(ARRAY_MAX_COUNT, Math.round(num(p.count, 2))))
  const axis = p.axis === 'Y' || p.axis === 'Z' ? p.axis : 'X'
  if (p.kind === 'circular') {
    const angle = Math.max(-360, Math.min(360, num(p.angle, 360)))
    const c = p.center ?? { x: 0, y: 0, z: 0 }
    return { kind: 'circular', axis, count, angle: angle === 0 ? 360 : angle, center: { x: num(c.x, 0), y: num(c.y, 0), z: num(c.z, 0) } }
  }
  return { kind: 'linear', axis, count, step: num(p.step, DEFAULT_ARRAY_PARAMS.step) }
}

/** Угол экземпляра `i` (0 — исходный) кругового массива, °: полный круг — 360·i / N, дуга — угол·i / (N − 1). */
export function circularInstanceAngle(p: ArrayParams, i: number): number {
  const angle = p.angle ?? 360
  const full = Math.abs(Math.abs(angle) - 360) < 1e-9
  return full ? (angle * i) / p.count : (angle * i) / (p.count - 1)
}

function mulMat3(a: number[], b: number[]): number[] {
  const r = new Array<number>(9)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
  }
  return r
}

/**
 * Трансформ экземпляра `i` (1…N−1) массива для объекта с трансформом `t`. Круговой: позиция —
 * поворот вокруг оси через центр, ориентация — тот же поворот поверх своей (углы — ближайшие к
 * `prevRot`, чтобы шли подряд: 60, 120, … 300, а не −60); масштаб — свой.
 */
export function arrayInstanceTransform(
  t: TransformNR,
  p: ArrayParams,
  i: number,
  prevRot: { rotX: number; rotY: number; rotZ: number } = t,
): TransformNR {
  if (p.kind === 'linear') {
    const k = AXIS_KEY[p.axis]
    return { ...t, [k]: t[k] + (p.step ?? 0) * i }
  }
  const theta = (circularInstanceAngle(p, i) * Math.PI) / 180
  const R = axisAngleMatrix(AXIS_VEC[p.axis], theta)
  const c = p.center ?? { x: 0, y: 0, z: 0 }
  const d = [t.x - c.x, t.y - c.y, t.z - c.z]
  const pos = [0, 1, 2].map((r) => R[r * 3] * d[0] + R[r * 3 + 1] * d[1] + R[r * 3 + 2] * d[2])
  const own = computeRSMatrix(t, { scaleX: 1, scaleY: 1, scaleZ: 1 })
  const rot = continuousEuler(eulerXYZFromMatrix(mulMat3(R, own)), prevRot)
  // шум float (1.8e-15, −0) — к целому: в панели свойств и истории — ровные числа
  const clean = (v: number) => (Math.abs(v - Math.round(v)) < 1e-9 ? Math.round(v) || 0 : v)
  return {
    ...t,
    x: clean(c.x + pos[0]), y: clean(c.y + pos[1]), z: clean(c.z + pos[2]),
    rotX: clean(rot.rotX), rotY: clean(rot.rotY), rotZ: clean(rot.rotZ),
  }
}

export type ArrayBuildResult =
  | { ok: true; op: ArrayOperation; objects: Record<string, SceneObject>; newIds: string[] }
  | { ok: false; reason: 'noSelection' | 'tooMany' }

/**
 * Копии массива для объектов `sourceIds` (воркер — меши, дерево — узлы копий). Порядок: экземпляр 2
 * всех исходных, экземпляр 3, … Ошибка воркера — исключение; `createdIds` — уже созданные (для чистки).
 */
export async function buildArray(
  objects: Record<string, SceneObject>,
  history: TinkerCraftOperation[],
  sourceIds: string[],
  raw: ArrayParams,
  createdIds: string[] = [],
): Promise<ArrayBuildResult> {
  const params = sanitizeArrayParams(raw)
  const sources = sourceIds.map((id) => objects[id]).filter((o): o is SceneObject => !!o)
  if (sources.length === 0) return { ok: false, reason: 'noSelection' }
  if ((params.count - 1) * sources.length > ARRAY_MAX_NEW_OBJECTS) return { ok: false, reason: 'tooMany' }
  const out: Record<string, SceneObject> = {}
  const ops: ArrayOperation['ops'] = []
  const clips = sources.map((o) => clipOf(o, history)!)
  const prevRot = sources.map((o) => ({ rotX: o.transform.rotX, rotY: o.transform.rotY, rotZ: o.transform.rotZ }))
  for (let i = 1; i < params.count; i++) {
    for (let k = 0; k < sources.length; k++) {
      const transform = arrayInstanceTransform(sources[k].transform, params, i, prevRot[k])
      prevRot[k] = transform
      const id = nextId('obj')
      createdIds.push(id)
      const { obj, op } = await instantiateClip(clips[k], id, transform)
      out[id] = obj
      ops.push(op)
    }
  }
  const op: ArrayOperation = { type: 'array', params, sourceIds: sources.map((o) => o.id), ops }
  return { ok: true, op, objects: out, newIds: Object.keys(out) }
}
