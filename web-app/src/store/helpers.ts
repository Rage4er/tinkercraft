// ============================================================
// Store helpers — shared utilities for document-store
// ============================================================

import type {
  SceneObject, ShapeType, ShapeParams, TransformNR, Vec3,
} from '../csg/types'

// ---- AABB ----
export function computeAABB(vertices: Float32Array): { min: Vec3; max: Vec3 } {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i]   < minX) minX = vertices[i];   if (vertices[i]   > maxX) maxX = vertices[i]
    if (vertices[i+1] < minY) minY = vertices[i+1]; if (vertices[i+1] > maxY) maxY = vertices[i+1]
    if (vertices[i+2] < minZ) minZ = vertices[i+2]; if (vertices[i+2] > maxZ) maxZ = vertices[i+2]
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}

/** Returns bbox center for a vertex buffer (no mutation). */
export function computeCenter(vertices: Float32Array): Vec3 {
  const { min, max } = computeAABB(vertices)
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 }
}

// Computes the bbox center of a vertex buffer, shifts all vertices so the
// center is at the origin, and returns the center offset.
export function extractAndCenter(vertices: Float32Array): { cx: number; cy: number; cz: number } {
  if (vertices.length === 0) return { cx: 0, cy: 0, cz: 0 }
  const c = computeCenter(vertices)
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= c.x; vertices[i+1] -= c.y; vertices[i+2] -= c.z
  }
  return { cx: c.x, cy: c.y, cz: c.z }
}

/** Creates a SceneObject with cached AABB. Use everywhere a new object is created. */
export function makeObject(partial: Omit<SceneObject, 'aabb'>): SceneObject {
  return { ...partial, aabb: computeAABB(partial.vertices) }
}

// ---- ID generator ----
let _idCounter = 0
export function nextId(prefix = 'obj'): string { return `${prefix}_${++_idCounter}` }

/** Resets the ID counter (for testing only). */
export function resetIdCounter(): void { _idCounter = 0 }

// ---- Colors ----
export const PALETTE = [
  '#89b4fa','#a6e3a1','#f9e2af','#cba6f7',
  '#f38ba8','#94e2d5','#fab387','#74c7ec',
]
export function colorForIndex(n: number): string { return PALETTE[n % PALETTE.length] }

// ---- Clipboard entry ----
export interface ClipEntry {
  shapeType: ShapeType
  params: ShapeParams
  color: string
  transform: TransformNR
  // For import_mesh:
  importVertices?: number[]
  importIndices?: number[]
}
