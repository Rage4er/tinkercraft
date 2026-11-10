// ============================================================
// camera-fit — расстояние камеры «Вписать в экран» (F)
// ============================================================
//
// Камера встаёт в `центр сцены + FIT_DIR · dist` и смотрит в центр. Было: dist = 2,5 × наибольший
// размер рамки сцены — без угла обзора по горизонтали: в узком вьюпорте (окно 768×1024 — вьюпорт
// 248 × 883 px) сцена обрезалась по ширине (UX-AUDIT-39). Теперь dist не меньше, чем нужно, чтобы
// описанная сфера рамки вошла в меньший из углов обзора — вертикальный (fov) или горизонтальный
// (по соотношению сторон); на широком вьюпорте это меньше прежнего — остаётся прежнее (вид тот же).
// Ортографическая камера берёт полувысоту из того же расстояния (dist · tan 22,5° = полу-fov), а
// tan ≥ sin — сфера входит и в неё.

import type { Vec3 } from '../csg/types'

/** Направление от центра сцены к камере (не единичное — как было в Viewport3D). */
export const FIT_DIR: Readonly<Vec3> = { x: 0.5, y: -0.9, z: 0.6 }
/** Запас вокруг сферы сцены. */
export const FIT_MARGIN = 1.05

/**
 * Множитель `FIT_DIR` для «Вписать в экран»: сцена с рамкой `size` целиком во вьюпорте с
 * вертикальным углом обзора `fovDeg` и соотношением сторон `aspect` (ширина / высота).
 */
export function fitDistance(size: Vec3, fovDeg: number, aspect: number): number {
  const legacy = Math.max(size.x, size.y, size.z, 1) * 2.5
  const radius = Math.max(Math.hypot(size.x, size.y, size.z) / 2, 0.5)
  const halfV = (fovDeg * Math.PI) / 360
  const halfH = Math.atan(Math.tan(halfV) * Math.max(aspect, 1e-3))
  const need = (radius / Math.sin(Math.min(halfV, halfH))) * FIT_MARGIN
  return Math.max(legacy, need / Math.hypot(FIT_DIR.x, FIT_DIR.y, FIT_DIR.z))
}
