// ============================================================
// child-view.ts — CSG-CHILD-VIEW: навигация и камера копии основного вида
// ============================================================
// Окно ребёнка — копия основного вьюпорта: та же сцена/координаты и та же
// камера на момент открытия (position/up/target/fov/zoom). Без отдельной
// центровки на ребёнке. OrbitControls — свободная навигация, как в основном.

import type * as THREE from 'three'

export interface ChildViewPoint { x: number; y: number; z: number }

export const CHILD_VIEW_CONTROLS = {
  enableRotate: true,
  enableZoom: true,
  enablePan: true,
  enableDamping: true,
  dampingFactor: 0.12,
} as const

export interface MainViewSnapshot {
  kind: 'perspective' | 'orthographic'
  position: ChildViewPoint
  up: ChildViewPoint
  target: ChildViewPoint
  fov?: number
  zoom?: number
  ortho?: { left: number; right: number; top: number; bottom: number }
}

/** Снимок камеры основного вида (для стартовой камеры маленького окна). */
export function snapshotMainView(
  camera: THREE.Camera,
  target: ChildViewPoint,
): MainViewSnapshot {
  const persp = camera as THREE.PerspectiveCamera
  const ortho = camera as THREE.OrthographicCamera
  const isOrtho = (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera === true
  return {
    kind: isOrtho ? 'orthographic' : 'perspective',
    position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
    up: { x: camera.up.x, y: camera.up.y, z: camera.up.z },
    target: { x: target.x, y: target.y, z: target.z },
    ...(isOrtho
      ? { zoom: ortho.zoom, ortho: { left: ortho.left, right: ortho.right, top: ortho.top, bottom: ortho.bottom } }
      : { fov: persp.fov }),
  }
}
