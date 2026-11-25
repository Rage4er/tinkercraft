// ============================================================
// curved-wireframe.ts — VIEW-MODES: каркас для гладких фигур
// ============================================================
// EdgesGeometry (порог 30°) не даёт рёбер на сфере/цилиндре/конусе/торе —
// гладкая поверхность. Для wireframe/hidden-line строим низкополигональную
// сетку (WireframeGeometry / спираль) из параметров фигуры.
//
// Позиция: локальная система объекта — как у основного меша (COM в origin):
//   цилиндр/труба/капсула — bbox-центр (−h/2…h/2);
//   конус — COM: база −h/4, вершина 3h/4 (Manifold COM-центрирование);
//   сфера/тор — центр; пружина — симметрично по высоте (bbox-центр).
//   Куб/призма/пирамида — плоские, им достаточно EdgesGeometry.

import * as THREE from 'three'
import type { ShapeParams, ShapeType } from '../csg/types'

/** Гладкие фигуры: для каркаса нужна сетка, а не EdgesGeometry */
export const CURVED_WIREFRAME: ReadonlySet<ShapeType> = new Set<ShapeType>([
  'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'tube', 'spring',
])

/** CSG-результат: полный triangle-wireframe допустим только для небольших мешей */
export const CSG_WIREFRAME_MAX_TRIS = 20_000

const num = (v: number | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback

/** Спираль пружины — низкополигональная осевая линия проволоки (пары вершин). */
function springWireframe(params: ShapeParams): THREE.BufferGeometry {
  const R = num(params.radius, 10)
  const h = num(params.height, 30)
  const turns = Math.max(0.5, Math.min(100, num(params.turns, 5)))
  const wire = num(params.wireRadius, 1.5)
  const perTurn = 12
  const n = Math.max(12, Math.ceil(turns * perTurn))
  const positions: number[] = []
  const point = (i: number): [number, number, number] => {
    const t = (i / n) * turns * Math.PI * 2
    const z = -h / 2 + wire + (i / n) * Math.max(0.001, h - 2 * wire)
    return [R * Math.cos(t), R * Math.sin(t), z]
  }
  for (let i = 0; i < n; i++) {
    const a = point(i)
    const b = point(i + 1)
    positions.push(...a, ...b)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geo
}

/**
 * Низкополигональная сетка фигуры в локальных координатах приложения (Z-up).
 * `null` — фигура не из набора.
 */
export function curvedWireframeGeometry(shapeType: ShapeType, params: ShapeParams): THREE.BufferGeometry | null {
  let base: THREE.BufferGeometry
  if (shapeType === 'sphere') {
    base = new THREE.SphereGeometry(num(params.radius, 12), 12, 8)
  } else if (shapeType === 'cylinder') {
    base = new THREE.CylinderGeometry(num(params.radius, 10), num(params.radius, 10), num(params.height, 20), 12, 1, false)
    base.rotateX(Math.PI / 2)
  } else if (shapeType === 'cone') {
    const h = num(params.height, 24)
    base = new THREE.ConeGeometry(num(params.radius, 10), h, 12, 1, false)
    base.rotateX(Math.PI / 2)
    // COM-центрирование (как Manifold centerManifoldToCOM): база −h/4, вершина 3h/4
    base.translate(0, 0, h / 4)
  } else if (shapeType === 'torus') {
    base = new THREE.TorusGeometry(num(params.torusRadius, 15), num(params.tubeRadius, 4), 8, 16)
  } else if (shapeType === 'capsule') {
    const r = num(params.radius, 8)
    const h = Math.max(2 * r, num(params.height, 30))
    // CapsuleGeometry: length — цилиндрическая часть; полная высота = length + 2r
    base = new THREE.CapsuleGeometry(r, Math.max(0.001, h - 2 * r), 4, 8)
    base.rotateX(Math.PI / 2)
  } else if (shapeType === 'tube') {
    base = new THREE.CylinderGeometry(num(params.radius, 12), num(params.radius, 12), num(params.height, 20), 12, 1, true)
    base.rotateX(Math.PI / 2)
  } else if (shapeType === 'spring') {
    return springWireframe(params)
  } else {
    return null
  }
  const wire = new THREE.WireframeGeometry(base)
  base.dispose()
  return wire
}

/**
 * CSG-результат: triangle-wireframe всего меша (для небольших CSG).
 * `null` — меш слишком тяжёлый (остаются EdgesGeometry-рёбра).
 */
export function csgWireframeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const tris = (geometry.index?.count ?? geometry.attributes.position.count) / 3
  if (!Number.isFinite(tris) || tris <= 0 || tris > CSG_WIREFRAME_MAX_TRIS) return null
  return new THREE.WireframeGeometry(geometry)
}
