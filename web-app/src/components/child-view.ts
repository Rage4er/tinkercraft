// ============================================================
// child-view.ts — CSG-CHILD-VIEW: навигация и система координат окна
// ============================================================
// Окно ребёнка: и ребёнок, и каркас остального CSG сдвигаются на одну и ту же
// величину — центр рамки ребёнка в 0, поэтому контекст (каркас) вокруг ребёнка,
// а не в стороне. OrbitControls — вращение / зум / панорама, как в основном виде.

export interface ChildViewPoint { x: number; y: number; z: number }

export const CHILD_VIEW_CONTROLS = {
  enableRotate: true,
  enableZoom: true,
  enablePan: true,
  enableDamping: true,
  dampingFactor: 0.12,
} as const

/** Сдвиг содержимого окна: центр ребёнка → начало координат. */
export function childViewOffset(center: ChildViewPoint): ChildViewPoint {
  return { x: -center.x, y: -center.y, z: -center.z }
}
