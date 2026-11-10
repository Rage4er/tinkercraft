// ============================================================
// shadow-follow.ts — тени там, где смотрит камера (SHADOW-BOUNDS-400)
// ============================================================
// Раньше область теней солнца была ±200 мм у начала координат (ортокамера тени), а плоскость-приёмник
// теней — 400 × 400 мм там же: объект дальше 200 мм от начала координат тени не отбрасывал, хотя сетка
// с GRID-ADAPTIVE бесконечная. Теперь область теней и приёмник следуют за центром вида (цель камеры), а
// размер области растёт с отдалением камеры (не меньше прежних ±200 мм):
//  • направление солнца — прежнее (SUN_DIR), солнце — над центром области на расстоянии ≥ 2 × размера;
//  • центр привязан к текселю карты теней в плоскости света, размер — ступенями ×1,25: при сдвиге и
//    масштабе вида тени не «дрожат» (тексели не сдвигаются на доли);
//  • смещения (bias) — в мировых единицах как при ±200 мм: depth bias × (диапазон глубины), normal bias ×
//    (размер текселя) — тени не отрываются от объектов и не рябят при любом размере.

import * as THREE from 'three'

/** Направление на солнце (как прежняя позиция солнца (100, −80, 200) относительно начала координат). */
export const SUN_DIR = new THREE.Vector3(100, -80, 200).normalize()
/** Полуразмер области теней не меньше, мм (прежний SUN_SHADOW_RANGE). */
export const SHADOW_MIN_HALF = 200
/** Полуразмер области теней — столько × расстояние камеры до цели (видимая область у цели). */
export const SHADOW_HALF_PER_DISTANCE = 1
/** Полуразмер — ступенями: SHADOW_MIN_HALF × SHADOW_HALF_STEP^k. */
export const SHADOW_HALF_STEP = 1.25
/** Прежние смещения при полуразмере 200 мм и глубине 1000 мм. */
const BASE_DEPTH_RANGE = 1000
const BASE_DEPTH_BIAS = -0.002
const BASE_NORMAL_BIAS = 0.05

export interface ShadowFrustum {
  /** Центр области на плоскости (привязан к текселю). */
  center: THREE.Vector3
  /** Полуразмер области (ортокамера тени: −half…half). */
  half: number
  /** Позиция солнца (центр + SUN_DIR × расстояние). */
  sunPosition: THREE.Vector3
  near: number
  far: number
  bias: number
  normalBias: number
}

/** Полуразмер области теней для расстояния камеры до цели: ≥ 200 мм, ступенями ×1,25. */
export function shadowHalfFor(viewDistance: number): number {
  const want = Math.max(SHADOW_MIN_HALF, viewDistance * SHADOW_HALF_PER_DISTANCE)
  const k = Math.ceil(Math.log(want / SHADOW_MIN_HALF) / Math.log(SHADOW_HALF_STEP) - 1e-9)
  return SHADOW_MIN_HALF * Math.pow(SHADOW_HALF_STEP, Math.max(0, k))
}

const _m = new THREE.Matrix4()
const _x = new THREE.Vector3()
const _y = new THREE.Vector3()
const _z = new THREE.Vector3()
const _up = new THREE.Vector3(0, 1, 0)   // up камеры тени (Object3D.DEFAULT_UP — как у DirectionalLightShadow)

/**
 * Область теней для вида с целью `target` и расстоянием камеры `viewDistance`; `mapSize` — сторона карты
 * теней (тексель = 2·half / mapSize). Центр — в ближайшем узле текселей в осях света (в плоскости света —
 * тени не дрожат; вдоль луча — область не меняется от сдвига вида меньше текселя).
 */
export function shadowFrustumFor(target: { x: number; y: number; z: number }, viewDistance: number, mapSize: number): ShadowFrustum {
  const half = shadowHalfFor(viewDistance)
  const texel = (2 * half) / mapSize
  // оси плоскости света (как у камеры тени: lookAt от солнца к цели, up = (0, 1, 0))
  _m.lookAt(SUN_DIR, new THREE.Vector3(0, 0, 0), _up)
  _x.setFromMatrixColumn(_m, 0)
  _y.setFromMatrixColumn(_m, 1)
  _z.setFromMatrixColumn(_m, 2)
  const c = new THREE.Vector3(target.x, target.y, target.z)
  for (const axis of [_x, _y, _z]) { const p = c.dot(axis); c.addScaledVector(axis, Math.round(p / texel) * texel - p) }
  const dist = Math.max(500, 2 * half)
  const near = 0.1
  const far = dist + 2 * half + 500
  return {
    center: c,
    half,
    sunPosition: c.clone().addScaledVector(SUN_DIR, dist),
    near,
    far,
    bias: BASE_DEPTH_BIAS * (BASE_DEPTH_RANGE / (far - near)),
    normalBias: BASE_NORMAL_BIAS * (half / SHADOW_MIN_HALF),
  }
}

/** Применить область к солнцу и приёмнику теней (плоскость `ground` — геометрия `groundSize` × `groundSize`). */
export function applyShadowFrustum(sun: THREE.DirectionalLight, ground: THREE.Object3D, groundSize: number, f: ShadowFrustum): void {
  sun.position.copy(f.sunPosition)
  sun.target.position.copy(f.center)
  sun.target.updateMatrixWorld()
  const cam = sun.shadow.camera
  cam.left = cam.bottom = -f.half
  cam.right = cam.top = f.half
  cam.near = f.near
  cam.far = f.far
  cam.updateProjectionMatrix()
  sun.shadow.bias = f.bias
  sun.shadow.normalBias = f.normalBias
  ground.position.x = f.center.x
  ground.position.y = f.center.y
  const s = (2 * f.half) / groundSize
  ground.scale.set(s, s, 1)
}

/** Одна и та же область (центр и размер) — не пересчитывать камеру тени. */
export function sameShadowFrustum(a: ShadowFrustum | null, b: ShadowFrustum): boolean {
  return a !== null && a.half === b.half && a.center.distanceToSquared(b.center) < 1e-12
}
