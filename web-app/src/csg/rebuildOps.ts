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
 * Mirror a transform across a plane.
 *
 * FIX (MIRROR-6): Correct mirror math. The axis PERPENDICULAR to the mirror
 * plane does NOT change. Axes IN the plane change sign.
 *
 * YZ plane (perpendicular axis = X):
 *   pos.x negated, rotX unchanged, scaleX = abs()
 *   rotY/rotZ negated, scaleY/scaleZ = abs()
 * XZ plane (perpendicular axis = Y):
 *   pos.y negated, rotY unchanged, scaleY = abs()
 *   rotX/rotZ negated, scaleX/scaleZ = abs()
 * XY plane (perpendicular axis = Z):
 *   pos.z negated, rotZ unchanged, scaleZ = abs()
 *   rotX/rotY negated, scaleX/scaleY = abs()
 *
 * FIX (MIRROR-SCALE): Scale is always positive (abs). Mirror geometry
 * is done via matrix transform, NOT via negative scale.
 */
export function applyMirrorToTransform(
  t: RebuildTransform,
  plane: 'XY' | 'XZ' | 'YZ',
): RebuildTransform {
  const nt = { ...t }
  console.log(`[MIRROR:applyMirrorToTransform] plane=${plane} BEFORE={x:${t.x}, y:${t.y}, z:${t.z}, rotX:${t.rotX}, rotY:${t.rotY}, rotZ:${t.rotZ}, scaleX:${t.scaleX}, scaleY:${t.scaleY}, scaleZ:${t.scaleZ}}`)
  if (plane === 'YZ') {
    nt.x = -nt.x
    // X is perpendicular to YZ → rotX and scaleX UNCHANGED
    // Y and Z are in the plane → negate rot, abs scale
    nt.rotY = -nt.rotY
    nt.rotZ = -nt.rotZ
    nt.scaleY = Math.abs(nt.scaleY)
    nt.scaleZ = Math.abs(nt.scaleZ)
  }
  if (plane === 'XZ') {
    nt.y = -nt.y
    // Y is perpendicular to XZ → rotY and scaleY UNCHANGED
    // X and Z are in the plane → negate rot, abs scale
    nt.rotX = -nt.rotX
    nt.rotZ = -nt.rotZ
    nt.scaleX = Math.abs(nt.scaleX)
    nt.scaleZ = Math.abs(nt.scaleZ)
  }
  if (plane === 'XY') {
    nt.z = -nt.z
    // Z is perpendicular to XY → rotZ and scaleZ UNCHANGED
    // X and Y are in the plane → negate rot, abs scale
    nt.rotX = -nt.rotX
    nt.rotY = -nt.rotY
    nt.scaleX = Math.abs(nt.scaleX)
    nt.scaleY = Math.abs(nt.scaleY)
  }
  console.log(`[MIRROR:applyMirrorToTransform] plane=${plane} AFTER={x:${nt.x}, y:${nt.y}, z:${nt.z}, rotX:${nt.rotX}, rotY:${nt.rotY}, rotZ:${nt.rotZ}, scaleX:${nt.scaleX}, scaleY:${nt.scaleY}, scaleZ:${nt.scaleZ}}`)
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
