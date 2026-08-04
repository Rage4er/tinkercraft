// ============================================================
// Store helpers — shared utilities for document-store
// ============================================================

import type {
  SceneObject, ShapeType, ShapeParams, TransformNR, Vec3,
} from '../csg/types'
import { OBJECT_COLORS } from '../constants'

// ---- AABB ----
export function computeAABB(vertices: Float32Array): { min: Vec3; max: Vec3 } {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i] < minX) minX = vertices[i]; if (vertices[i] > maxX) maxX = vertices[i]
    if (vertices[i + 1] < minY) minY = vertices[i + 1]; if (vertices[i + 1] > maxY) maxY = vertices[i + 1]
    if (vertices[i + 2] < minZ) minZ = vertices[i + 2]; if (vertices[i + 2] > maxZ) maxZ = vertices[i + 2]
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}

/** Returns bbox center for a vertex buffer (no mutation). */
export function computeCenter(vertices: Float32Array): Vec3 {
  const { min, max } = computeAABB(vertices)
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }
}

/** Shifts vertices so bbox center is at origin; MUTATES the input array in-place.
 *
 * FIX (CRIT-R16-2): Renamed from extractAndCenter to make the in-place
 * mutation explicit. Callers that need to preserve the original array
 * should pass a copy.
 *
 * @returns the offset {cx, cy, cz} that was subtracted from all vertices.
 */
export function extractAndCenterInPlace(vertices: Float32Array): { cx: number; cy: number; cz: number } {
  if (vertices.length === 0) return { cx: 0, cy: 0, cz: 0 }
  const c = computeCenter(vertices)
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= c.x; vertices[i + 1] -= c.y; vertices[i + 2] -= c.z
  }
  return { cx: c.x, cy: c.y, cz: c.z }
}

// Computes the bbox center of a vertex buffer, shifts all vertices so the
// center is at the origin, returns the offset, and returns the AABB of
// the CENTERED geometry (after shifting). Single-pass: O(n).
//
// Prefer this over extractAndCenterInPlace() + makeObject() (two passes) for
// CSG results where both centering and AABB-caching are needed.
export function extractAndCenterGetAABB(vertices: Float32Array): {
  cx: number; cy: number; cz: number
  aabb: { min: Vec3; max: Vec3 }
} {
  if (vertices.length === 0) return { cx: 0, cy: 0, cz: 0, aabb: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } }

  // Single pass: find bbox center, then shift + compute centered AABB
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i] < minX) minX = vertices[i]; if (vertices[i] > maxX) maxX = vertices[i]
    if (vertices[i + 1] < minY) minY = vertices[i + 1]; if (vertices[i + 1] > maxY) maxY = vertices[i + 1]
    if (vertices[i + 2] < minZ) minZ = vertices[i + 2]; if (vertices[i + 2] > maxZ) maxZ = vertices[i + 2]
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const cz = (minZ + maxZ) / 2

  // Shift + compute centered AABB in one pass
  let cMinX = Infinity, cMaxX = -Infinity
  let cMinY = Infinity, cMaxY = -Infinity
  let cMinZ = Infinity, cMaxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= cx; if (vertices[i] < cMinX) cMinX = vertices[i]; if (vertices[i] > cMaxX) cMaxX = vertices[i]
    vertices[i + 1] -= cy; if (vertices[i + 1] < cMinY) cMinY = vertices[i + 1]; if (vertices[i + 1] > cMaxY) cMaxY = vertices[i + 1]
    vertices[i + 2] -= cz; if (vertices[i + 2] < cMinZ) cMinZ = vertices[i + 2]; if (vertices[i + 2] > cMaxZ) cMaxZ = vertices[i + 2]
  }

  return { cx, cy, cz, aabb: { min: { x: cMinX, y: cMinY, z: cMinZ }, max: { x: cMaxX, y: cMaxY, z: cMaxZ } } }
}

/** Creates a SceneObject with cached AABB. Use everywhere a new object is created. */
// FIX (LOW-18-6): Accept optional pre-computed AABB to avoid redundant computeAABB calls.
export function makeObject(partial: Omit<SceneObject, 'aabb'> & { aabb?: SceneObject['aabb'] }): SceneObject {
  return { ...partial, aabb: partial.aabb ?? computeAABB(partial.vertices) }
}

// ---- ID generator ----
let _idCounter = 0
export function nextId(prefix = 'obj'): string { return `${prefix}_${++_idCounter}` }

/** Resets the ID counter (for testing only). */
export function resetIdCounter(): void { _idCounter = 0 }

// ---- Colors ----
export function colorForIndex(n: number): string { return OBJECT_COLORS[n % OBJECT_COLORS.length] }

// ---- Clipboard entry ----
export interface ClipEntry {
  shapeType: ShapeType
  params: ShapeParams
  color: string
  transform: TransformNR
  // For import_mesh:
  importVertices?: Float32Array
  importIndices?: Uint32Array
}
