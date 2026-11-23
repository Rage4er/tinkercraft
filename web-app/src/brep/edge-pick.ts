// ============================================================
// edge-pick.ts — FILLET-CHAMFER-BREP: выбор ребра B-Rep лучом
// ============================================================
// Чистая функция над THREE: линии рёбер (LineSegments с userData.brepEdgeIndex)
// и луч из камеры. Порог — в мировых единицах (`raycaster.params.Line.threshold`).

import type * as THREE from 'three'

export const BREP_LINE_THRESHOLD = 2.5

export function pickBrepEdgeIndex(
  raycaster: THREE.Raycaster,
  lines: THREE.Object3D[],
  threshold = BREP_LINE_THRESHOLD,
): number | null {
  if (lines.length === 0) return null
  raycaster.params.Line = { threshold }
  const hits = raycaster.intersectObjects(lines, false)
  if (hits.length === 0) return null
  const idx = hits[0].object.userData.brepEdgeIndex
  return typeof idx === 'number' ? idx : null
}
