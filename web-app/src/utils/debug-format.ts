// ============================================================
// Debug formatting helpers
// ============================================================
// Форматирование данных для диагностических логов.
// В продакшн-сборке полностью tree-shaken.

import { isDev } from './debug'

/** true — только в режиме разработки */
const dev = isDev

/**
 * Форматирует трансформ объекта.
 * @example fmtTransform(obj) → "pos(20.0,20.0,20.0) rot(0.0,0.0,0.0) scl(1.00,1.00,1.00)"
 */
export function fmtTransform(t: {
  x: number; y: number; z: number
  rotX: number; rotY: number; rotZ: number
  scaleX: number; scaleY: number; scaleZ: number
}): string {
  return `pos(${t.x.toFixed(1)},${t.y.toFixed(1)},${t.z.toFixed(1)}) rot(${t.rotX.toFixed(1)},${t.rotY.toFixed(1)},${t.rotZ.toFixed(1)}) scl(${t.scaleX.toFixed(2)},${t.scaleY.toFixed(2)},${t.scaleZ.toFixed(2)})`
}

/**
 * Форматирует параметры фигуры.
 * @example fmtParams(obj) → "width=20 height=20 depth=20"
 */
export function fmtParams(params: Record<string, number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
}

/**
 * Форматирует 3D-точку.
 * @example fmtPoint({x:20, y:20, z:20}) → "(20.00,20.00,20.00)"
 */
export function fmtPoint(p: { x: number; y: number; z: number }): string {
  return `(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)})`
}

/**
 * Форматирует 2D-точку.
 * @example fmtPoint2({x:908, y:506}) → "(908,506)"
 */
export function fmtPoint2(p: { x: number; y: number }): string {
  return `(${p.x},${p.y})`
}
