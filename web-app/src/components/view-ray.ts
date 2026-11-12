// ============================================================
// view-ray.ts — луч из курсора по АКТИВНОЙ камере вида (ORTHO-RAYCAST)
// ============================================================
// В ортографии вид рисует OrthographicCamera, а перспективная камера остаётся «ведущей» (её крутит
// OrbitControls, орто каждый кадр копирует её положение). Раньше линейка и гизмо брали перспективную
// камеру всегда: в ортографии луч из курсора уходил в сторону — тем дальше, чем ближе курсор к краю
// вида и чем дальше точка от глубины цели камеры; гизмо «улетал» при перетаскивании. Здесь — общий
// путь: луч строится `Raycaster.setFromCamera` по активной камере (для орто — параллельный луч из
// плоскости near), точка на рабочей плоскости — пересечение луча с плоскостью, без формулы
// «направление от позиции камеры» (она верна только для перспективы).

import * as THREE from 'three'

/** Экранные координаты курсора → NDC (−1…1) относительно прямоугольника вида. */
export function ndcFromClient(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): THREE.Vector2 {
  return new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1,
  )
}

/** Луч из курсора (NDC) по камере вида — перспективной или ортографической. */
export function rayFromCamera(ndc: THREE.Vector2, camera: THREE.Camera): THREE.Raycaster {
  camera.updateMatrixWorld()
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, camera)
  return raycaster
}

const _plane = new THREE.Plane()
/**
 * Точка рабочей плоскости z = `z` под курсором (луч ∩ плоскость) или null — луч параллелен плоскости
 * или плоскость позади камеры.
 */
export function groundPointOnRay(raycaster: THREE.Raycaster, z = 0): THREE.Vector3 | null {
  _plane.set(new THREE.Vector3(0, 0, 1), -z)
  return raycaster.ray.intersectPlane(_plane, new THREE.Vector3())
}

/** Гизмо (TransformControls) — на камере вида: попадание по ручкам, плоскость перетаскивания, размер. */
export function syncGizmoCamera(gizmo: { camera: THREE.Camera } | null, camera: THREE.Camera): boolean {
  if (!gizmo || gizmo.camera === camera) return false
  gizmo.camera = camera
  return true
}
