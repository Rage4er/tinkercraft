// ============================================================
// Rebuild operations — shared logic for worker.ts (rebuildScene)
// and rebuild.ts (rebuildFromHistory).
// Single source of truth for transform manipulation.
// ============================================================

import type {
  TinkerCraftOperation,
  TransformNR,
  Vec3,
  ShapeType,
  ShapeParams,
} from './types'

/** Внутреннее представление трансформации для rebuild-цепочки */
export interface RebuildTransform {
  x: number; y: number; z: number
  rotX: number; rotY: number; rotZ: number
  scaleX: number; scaleY: number; scaleZ: number
}

/** Метаданные примитива для пересборки из базовой формы */
export interface ShapeMeta {
  shapeType: ShapeType
  params: ShapeParams
  filletRadius: number
}

/**
 * Применить delta трансформации к текущей трансформации.
 * Аддитивное применение — корректно, так как delta = newScale - oldScale.
 */
export function applyMoveDelta(
  t: RebuildTransform,
  delta?: Vec3,
  rotDelta?: Vec3,
  scaleDelta?: Vec3,
): RebuildTransform {
  return {
    x: t.x + (delta?.x ?? 0),
    y: t.y + (delta?.y ?? 0),
    z: t.z + (delta?.z ?? 0),
    rotX: t.rotX + (rotDelta?.x ?? 0),
    rotY: t.rotY + (rotDelta?.y ?? 0),
    rotZ: t.rotZ + (rotDelta?.z ?? 0),
    scaleX: t.scaleX + (scaleDelta?.x ?? 0),
    scaleY: t.scaleY + (scaleDelta?.y ?? 0),
    scaleZ: t.scaleZ + (scaleDelta?.z ?? 0),
  }
}

/**
 * Применить зеркало к трансформации (позиция + вращение).
 * Геометрия зеркалится отдельно через manifold matrix.
 * При отражении по плоскости вращение вокруг перпендикулярной оси инвертируется
 * (зеркало меняет handedness координатной системы).
 */
export function applyMirrorToTransform(
  t: RebuildTransform,
  plane: 'XY' | 'XZ' | 'YZ',
): RebuildTransform {
  const nt = { ...t }
  if (plane === 'YZ') { nt.x = -nt.x; nt.rotX = -nt.rotX }
  if (plane === 'XZ') { nt.y = -nt.y; nt.rotY = -nt.rotY }
  if (plane === 'XY') { nt.z = -nt.z; nt.rotZ = -nt.rotZ }
  return nt
}

/**
 * Применить выравнивание к трансформации.
 */
export function applyAlignToTransform(
  t: RebuildTransform,
  axis: 'x' | 'y' | 'z',
  delta: number,
): RebuildTransform {
  return { ...t, [axis]: t[axis] + delta }
}

/**
 * Стандартная трансформация по умолчанию.
 */
export function makeDefaultTransform(): RebuildTransform {
  return {
    x: 0, y: 0, z: 0,
    rotX: 0, rotY: 0, rotZ: 0,
    scaleX: 1, scaleY: 1, scaleZ: 1,
  }
}
