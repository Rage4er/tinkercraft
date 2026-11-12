// ============================================================
// dimensions.ts — размерные линии: модель и геометрия (DIMENSIONS)
// ============================================================
// Чистые функции (без Three.js и сторов). Размер — АССОЦИАТИВНЫЙ: концы привязаны к объектам
// (id) и к точкам в их ЛОКАЛЬНЫХ координатах (как вершины: в origin, трансформ — отдельно),
// а не к мировым координатам. Мир = трансформ объекта (сдвиг, поворот, масштаб) × точка, так что
// двинул / повернул / масштабировал объект — число пересчиталось. Вместе с точкой запоминается
// локальная рамка объекта на момент создания: если меняется сама геометрия (размеры куба 20 → 30,
// правка ребёнка CSG), точка переносится в новую рамку в тех же долях — угол остаётся углом.
// Объекта нет (ушёл в CSG, удалён, отменено создание) — размер не виден, пока объект не вернётся.
//
// Подварианты (`style.kind`):
//  • standard   — линия A → B, стрелки на концах, число посередине;
//  • offset     — линия сдвинута НАРУЖУ на `offset` (от центра объектов, перпендикулярно AB),
//                 выносные линии от A и B до неё; число — |AB|;
//  • projection — проекция на горизонтальную плоскость (параллельна XY) на уровне нижней из двух
//                 точек, выносные — вертикально; число — длина проекции √(Δx² + Δy²).

import { formatLength, type LengthUnit } from './units'
import type { SceneObject, TransformNR, Vec3 } from '../csg/types'
import { computeRSMatrix, computeInverseRSMatrix } from '../csg/worker-matrix'
import { computeAABB } from './helpers'

export type DimensionKind = 'standard' | 'offset' | 'projection'
export const DIMENSION_KINDS: readonly DimensionKind[] = ['standard', 'offset', 'projection']
export type DimensionFont = 'sans-serif' | 'monospace' | 'serif'
export const DIMENSION_FONTS: readonly DimensionFont[] = ['sans-serif', 'monospace', 'serif']

export interface DimensionStyle {
  kind: DimensionKind
  /** Цвет линий и текста (#rrggbb). */
  color: string
  font: DimensionFont
  /** Высота текста, мм. */
  size: number
  units: 'mm'
}

/** Локальная рамка объекта (вершины — в origin). */
export interface LocalBox { min: Vec3; max: Vec3 }

export interface Dimension {
  id: string
  type: 'linear'
  objectIdA: string
  /** Точка на A в локальных координатах A (вершины в origin). */
  pointA: Vec3
  /** Локальная рамка A при создании — перенос точки при смене геометрии. */
  boxA: LocalBox
  objectIdB: string
  pointB: Vec3
  boxB: LocalBox
  /** Отступ размерной линии наружу (подвариант «С отступом»), мм. */
  offset: number
  style: DimensionStyle
}

/** Настройки новых размеров (окно «Настройки размеров»). */
export interface DimensionDefaults { style: DimensionStyle; offset: number }

export const DEFAULT_DIMENSION_STYLE: DimensionStyle = { kind: 'standard', color: '#f9e2af', font: 'sans-serif', size: 4, units: 'mm' }
export const DEFAULT_DIMENSION_OFFSET = 10
export const DEFAULT_DIMENSION_DEFAULTS: DimensionDefaults = { style: DEFAULT_DIMENSION_STYLE, offset: DEFAULT_DIMENSION_OFFSET }
export const DIMENSION_SIZE_RANGE = { min: 1, max: 100 } as const
export const DIMENSION_OFFSET_RANGE = { min: 0, max: 500 } as const

/** Концы размера в мире и центры объектов (для «наружу»). */
export interface DimensionEnds { a: Vec3; b: Vec3; centerA: Vec3; centerB: Vec3 }

/** Отрисовка: размерная линия, выносные линии, место числа, направление (A → B) и число. */
export interface DimensionGeometry {
  value: number
  line: [Vec3, Vec3]
  extensions: Array<[Vec3, Vec3]>
  label: Vec3
  dir: Vec3
}

const EPS = 1e-9
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const mul = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z)
const mid = (a: Vec3, b: Vec3): Vec3 => mul(add(a, b), 0.5)
function unit(a: Vec3): Vec3 | null {
  const l = len(a)
  return l < 1e-9 ? null : mul(a, 1 / l)
}

/** Мировая точка → локальная (v = S⁻¹·Rᵀ·(p − pos)). */
export function toLocalPoint(t: TransformNR, world: Vec3): Vec3 {
  const m = computeInverseRSMatrix({ rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ })
  const d = sub(world, t)
  return { x: m[0] * d.x + m[1] * d.y + m[2] * d.z, y: m[3] * d.x + m[4] * d.y + m[5] * d.z, z: m[6] * d.x + m[7] * d.y + m[8] * d.z }
}

/** Локальная точка → мировая (pos + R·S·v). */
export function toWorldPoint(t: TransformNR, local: Vec3): Vec3 {
  const m = computeRSMatrix({ rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ })
  return {
    x: t.x + m[0] * local.x + m[1] * local.y + m[2] * local.z,
    y: t.y + m[3] * local.x + m[4] * local.y + m[5] * local.z,
    z: t.z + m[6] * local.x + m[7] * local.y + m[8] * local.z,
  }
}

const boxCache = new WeakMap<Float32Array, LocalBox>()
/** Локальная рамка вершин объекта (кэш по массиву вершин — он меняется только с геометрией). */
export function localBoxOf(obj: Pick<SceneObject, 'vertices'>): LocalBox {
  const cached = boxCache.get(obj.vertices)
  if (cached) return cached
  const box = obj.vertices.length > 0 ? computeAABB(obj.vertices) : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } }
  boxCache.set(obj.vertices, box)
  return box
}

/** Точка из рамки `from` в рамку `to` в тех же долях по каждой оси (вырожденная ось — центр). */
export function remapLocalPoint(p: Vec3, from: LocalBox, to: LocalBox): Vec3 {
  const axis = (k: 'x' | 'y' | 'z') => {
    const s0 = from.max[k] - from.min[k]
    const s1 = to.max[k] - to.min[k]
    if (Math.abs(s0 - s1) < 1e-9 && Math.abs(from.min[k] - to.min[k]) < 1e-9) return p[k]   // геометрия та же
    const f = s0 > EPS ? (p[k] - from.min[k]) / s0 : 0.5
    return to.min[k] + f * s1
  }
  return { x: axis('x'), y: axis('y'), z: axis('z') }
}

/** Мировая точка конца размера на объекте `obj` (сейчас). */
export function anchorWorldPoint(obj: Pick<SceneObject, 'vertices' | 'transform'>, point: Vec3, box: LocalBox): Vec3 {
  return toWorldPoint(obj.transform, remapLocalPoint(point, box, localBoxOf(obj)))
}

/** Конец размера: объект, точка в его системе и рамка — из мировой точки на объекте. */
export function anchorOf(obj: Pick<SceneObject, 'vertices' | 'transform'>, world: Vec3): { point: Vec3; box: LocalBox } {
  return { point: toLocalPoint(obj.transform, world), box: localBoxOf(obj) }
}

/** Оба объекта размера есть и видимы — размер показывается (иначе — скрыт до их возвращения). */
export function isDimensionAlive(dim: Pick<Dimension, 'objectIdA' | 'objectIdB'>, objects: Record<string, SceneObject>): boolean {
  const a = objects[dim.objectIdA], b = objects[dim.objectIdB]
  return !!a && !!b && a.visible !== false && b.visible !== false
}

/** Концы размера в мире (null — объекта нет / скрыт). */
export function dimensionEnds(dim: Dimension, objects: Record<string, SceneObject>): DimensionEnds | null {
  if (!isDimensionAlive(dim, objects)) return null
  const A = objects[dim.objectIdA], B = objects[dim.objectIdB]
  return {
    a: anchorWorldPoint(A, dim.pointA, dim.boxA),
    b: anchorWorldPoint(B, dim.pointB, dim.boxB),
    centerA: { x: A.transform.x, y: A.transform.y, z: A.transform.z },
    centerB: { x: B.transform.x, y: B.transform.y, z: B.transform.z },
  }
}

/** Перпендикуляр к `d̂`, смотрящий от центра `c` к середине `m` (наружу); вырожденно — горизонтальный. */
export function outwardNormal(a: Vec3, b: Vec3, center: Vec3): Vec3 {
  const d = unit(sub(b, a)) ?? { x: 1, y: 0, z: 0 }
  const v = sub(mid(a, b), center)
  const n = unit(sub(v, mul(d, dot(v, d))))
  if (n) return n
  return unit(cross(d, { x: 0, y: 0, z: 1 })) ?? unit(cross(d, { x: 1, y: 0, z: 0 }))!
}

/**
 * Геометрия размера по подварианту; число — длина (для проекции — длина проекции на XY).
 * `labelGap` — число сдвигается от размерной линии наружу на столько мм (не закрывает линию и стрелки).
 */
export function dimensionGeometry(ends: DimensionEnds, kind: DimensionKind, offset: number, labelGap = 0): DimensionGeometry {
  const { a, b } = ends
  const center = mid(ends.centerA, ends.centerB)
  const labelAt = (p: Vec3, q: Vec3, c: Vec3) => (labelGap > 0 ? add(mid(p, q), mul(outwardNormal(p, q, c), labelGap)) : mid(p, q))
  if (kind === 'projection') {
    const z0 = Math.min(a.z, b.z)
    const pa = { x: a.x, y: a.y, z: z0 }, pb = { x: b.x, y: b.y, z: z0 }
    const extensions: Array<[Vec3, Vec3]> = []
    if (a.z - z0 > 1e-6) extensions.push([a, pa])
    if (b.z - z0 > 1e-6) extensions.push([b, pb])
    return { value: Math.hypot(b.x - a.x, b.y - a.y), line: [pa, pb], extensions, label: labelAt(pa, pb, { x: center.x, y: center.y, z: z0 }), dir: unit(sub(pb, pa)) ?? { x: 1, y: 0, z: 0 } }
  }
  const value = len(sub(b, a))
  const dir = unit(sub(b, a)) ?? { x: 1, y: 0, z: 0 }
  if (kind === 'offset' && offset > 0) {
    const n = outwardNormal(a, b, center)
    const sa = add(a, mul(n, offset)), sb = add(b, mul(n, offset))
    const over = mul(n, Math.min(2, offset * 0.25))            // выносная чуть дальше размерной линии
    return { value, line: [sa, sb], extensions: [[a, add(sa, over)], [b, add(sb, over)]], label: labelAt(sa, sb, center), dir }
  }
  return { value, line: [a, b], extensions: [], label: labelAt(a, b, center), dir }
}

/** Число размера (значение — мм): в единице из настроек (APP-SETTINGS), как поля размеров — мм с одним знаком. */
export function formatDimensionValue(value: number, unit: LengthUnit = 'mm'): string {
  return formatLength(value, unit, 1)
}

/** Значение размера сейчас (null — размер скрыт: объекта нет). */
export function dimensionValue(dim: Dimension, objects: Record<string, SceneObject>): number | null {
  const ends = dimensionEnds(dim, objects)
  return ends ? dimensionGeometry(ends, dim.style.kind, dim.offset).value : null
}

export function clampDimensionSize(v: number): number {
  return Number.isFinite(v) ? Math.min(DIMENSION_SIZE_RANGE.max, Math.max(DIMENSION_SIZE_RANGE.min, v)) : DEFAULT_DIMENSION_STYLE.size
}
export function clampDimensionOffset(v: number): number {
  return Number.isFinite(v) ? Math.min(DIMENSION_OFFSET_RANGE.max, Math.max(DIMENSION_OFFSET_RANGE.min, v)) : DEFAULT_DIMENSION_OFFSET
}
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Стиль из недоверенных данных (файл, автосохранение): неизвестное — по умолчанию. */
export function sanitizeDimensionStyle(raw: unknown): DimensionStyle {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    kind: DIMENSION_KINDS.includes(s.kind as DimensionKind) ? (s.kind as DimensionKind) : DEFAULT_DIMENSION_STYLE.kind,
    color: typeof s.color === 'string' && HEX_COLOR.test(s.color) ? s.color : DEFAULT_DIMENSION_STYLE.color,
    font: DIMENSION_FONTS.includes(s.font as DimensionFont) ? (s.font as DimensionFont) : DEFAULT_DIMENSION_STYLE.font,
    size: clampDimensionSize(typeof s.size === 'number' ? s.size : NaN),
    units: 'mm',
  }
}

function vec(raw: unknown): Vec3 | null {
  if (!raw || typeof raw !== 'object') return null
  const v = raw as Record<string, unknown>
  return [v.x, v.y, v.z].every((c) => typeof c === 'number' && Number.isFinite(c)) ? { x: v.x as number, y: v.y as number, z: v.z as number } : null
}
function box(raw: unknown): LocalBox | null {
  if (!raw || typeof raw !== 'object') return null
  const min = vec((raw as Record<string, unknown>).min), max = vec((raw as Record<string, unknown>).max)
  return min && max ? { min, max } : null
}

/** Размеры из недоверенных данных (.3dtc, автосохранение): битые записи отбрасываются. */
export function sanitizeDimensions(raw: unknown): Dimension[] {
  if (!Array.isArray(raw)) return []
  const out: Dimension[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const d = r as Record<string, unknown>
    const pointA = vec(d.pointA), pointB = vec(d.pointB), boxA = box(d.boxA), boxB = box(d.boxB)
    if (typeof d.id !== 'string' || typeof d.objectIdA !== 'string' || typeof d.objectIdB !== 'string' || !pointA || !pointB || !boxA || !boxB) continue
    out.push({
      id: d.id, type: 'linear',
      objectIdA: d.objectIdA, pointA, boxA,
      objectIdB: d.objectIdB, pointB, boxB,
      offset: clampDimensionOffset(typeof d.offset === 'number' ? d.offset : NaN),
      style: sanitizeDimensionStyle(d.style),
    })
  }
  return out
}

let dimCounter = 0
/** Новый id размера (уникален и между сессиями — размеры живут в файлах). */
export function newDimensionId(): string {
  const rnd = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `dim_${rnd}_${++dimCounter}`
}
