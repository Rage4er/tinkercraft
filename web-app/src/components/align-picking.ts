// ============================================================
// align-picking.ts — выбор грани для режима выравнивания (ALIGN-UI-REVIT)
// ============================================================
// Чистые функции поверх Three.js (тестируются в jsdom на настоящих мешах):
//  - pickFace: луч → первый треугольник → мировые нормаль грани и точка;
//  - planarFaceTriangles: все треугольники меша в той же плоскости, что и данный
//    (грань куба = 2 треугольника) — для подсветки ровно того, что встанет в плоскость.
// Производительность: Mesh.raycast сначала отсекает по boundingSphere и boundingBox
// геометрии и только потом перебирает треугольники; наведение вызывается с throttle.

import * as THREE from 'three'
import type { FacePick } from '../store/align-mode'

/** Больше — подсвечиваем только треугольник под курсором (перебор плоскости — O(n)). */
export const PLANAR_FACE_MAX_TRIANGLES = 50_000
/** Допуски «та же плоскость»: угол нормалей ≤ ~1°, расстояние до плоскости (мир, мм). */
const PLANAR_COS = Math.cos((1 * Math.PI) / 180)
const PLANAR_DIST = 1e-3

const _nm = new THREE.Matrix3()

/** Первое попадание луча в видимые меши → грань (мировые нормаль и точка) или null. */
export function pickFace(raycaster: THREE.Raycaster, meshes: THREE.Mesh[]): FacePick | null {
  const hits = raycaster.intersectObjects(meshes, false)
  for (const h of hits) {
    const id = h.object.userData.objectId as string | undefined
    if (!id || !h.face || h.faceIndex == null) continue
    const n = h.face.normal.clone().applyMatrix3(_nm.getNormalMatrix(h.object.matrixWorld)).normalize()
    return {
      objectId: id,
      triangleIndex: h.faceIndex,
      normal: { x: n.x, y: n.y, z: n.z },
      point: { x: h.point.x, y: h.point.y, z: h.point.z },
    }
  }
  return null
}

/** Вершины треугольника `tri` меша в мировых координатах. */
function triangleWorld(mesh: THREE.Mesh, tri: number, out: [THREE.Vector3, THREE.Vector3, THREE.Vector3]): boolean {
  const g = mesh.geometry as THREE.BufferGeometry
  const pos = g.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!pos) return false
  const idx = g.getIndex()
  const count = idx ? idx.count / 3 : pos.count / 3
  if (tri < 0 || tri >= count) return false
  for (let k = 0; k < 3; k++) {
    const vi = idx ? idx.getX(tri * 3 + k) : tri * 3 + k
    out[k].fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld)
  }
  return true
}

/**
 * Мировые вершины (по 9 чисел на треугольник) всех треугольников меша, лежащих в
 * плоскости треугольника `tri` и смотрящих в ту же сторону. Тяжёлый меш (больше
 * PLANAR_FACE_MAX_TRIANGLES) — только сам треугольник.
 */
export function planarFaceTriangles(mesh: THREE.Mesh, tri: number): Float32Array {
  mesh.updateMatrixWorld()
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const t: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [a, b, c]
  if (!triangleWorld(mesh, tri, t)) return new Float32Array()
  const n0 = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
  const d0 = n0.dot(a)
  const g = mesh.geometry as THREE.BufferGeometry
  const idx = g.getIndex()
  const count = idx ? idx.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3
  if (count > PLANAR_FACE_MAX_TRIANGLES) return new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z])
  const out: number[] = []
  const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    if (!triangleWorld(mesh, i, t)) continue
    n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a))
    const len = n.length()
    if (len < 1e-12) continue
    n.divideScalar(len)
    if (n.dot(n0) < PLANAR_COS) continue
    if (Math.abs(n0.dot(a) - d0) > PLANAR_DIST || Math.abs(n0.dot(b) - d0) > PLANAR_DIST || Math.abs(n0.dot(c) - d0) > PLANAR_DIST) continue
    out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
  }
  return new Float32Array(out)
}
