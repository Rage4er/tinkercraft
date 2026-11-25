// ============================================================
// curved-wireframe.ts — VIEW-MODES: каркас для гладких фигур
// ============================================================
// EdgesGeometry (порог 30°) не даёт рёбер на сфере/цилиндре — гладкая
// поверхность. Для wireframe строим низкополигональную сетку
// (WireframeGeometry): сфера — меридианы/параллели, цилиндр/конус —
// образующие + кольца, тор — кольца, капсула/труба — как тела вращения.

import * as THREE from 'three'
import type { ShapeParams, ShapeType } from '../csg/types'

/** Гладкие фигуры: для каркаса нужна сетка, а не EdgesGeometry */
export const CURVED_WIREFRAME: ReadonlySet<ShapeType> = new Set<ShapeType>([
  'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'tube',
])

const num = (v: number | undefined, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback

/**
 * Низкополигональная сетка фигуры в локальных координатах приложения (Z-up).
 * `null` — фигура не из набора / нет сетки.
 */
export function curvedWireframeGeometry(shapeType: ShapeType, params: ShapeParams): THREE.BufferGeometry | null {
  let base: THREE.BufferGeometry
  if (shapeType === 'sphere') {
    base = new THREE.SphereGeometry(num(params.radius, 12), 12, 8)
  } else if (shapeType === 'cylinder') {
    base = new THREE.CylinderGeometry(num(params.radius, 10), num(params.radius, 10), num(params.height, 20), 12, 1, false)
    base.rotateX(Math.PI / 2)
  } else if (shapeType === 'cone') {
    base = new THREE.ConeGeometry(num(params.radius, 10), num(params.height, 24), 12, 1, false)
    base.rotateX(Math.PI / 2)
  } else if (shapeType === 'torus') {
    base = new THREE.TorusGeometry(num(params.torusRadius, 15), num(params.tubeRadius, 4), 8, 16)
  } else if (shapeType === 'capsule') {
    base = new THREE.CapsuleGeometry(num(params.radius, 8), num(params.height, 30), 4, 8)
    base.rotateX(Math.PI / 2)
  } else if (shapeType === 'tube') {
    base = new THREE.CylinderGeometry(num(params.radius, 12), num(params.radius, 12), num(params.height, 20), 12, 1, true)
    base.rotateX(Math.PI / 2)
  } else {
    return null
  }
  const wire = new THREE.WireframeGeometry(base)
  base.dispose()
  return wire
}
