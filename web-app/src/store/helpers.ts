// ============================================================
// Store helpers — shared utilities for document-store
// ============================================================

import type {
  SceneObject, ShapeType, ShapeParams, TransformNR, Vec3,
} from '../csg/types'

// ---- AABB (exported for unit testing) ----
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

// Computes the bbox center of a vertex buffer, shifts all vertices so the
// center is at the origin, and returns the center offset.  Used to normalise
// CSG result geometry so the Three.js pivot can be placed at the true world
// position of the result instead of always being at (0,0,0).
// Exported for unit testing.
export function extractAndCenter(vertices: Float32Array): { cx: number; cy: number; cz: number } {
  if (vertices.length === 0) return { cx: 0, cy: 0, cz: 0 }
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    if (vertices[i]   < minX) minX = vertices[i];   if (vertices[i]   > maxX) maxX = vertices[i]
    if (vertices[i+1] < minY) minY = vertices[i+1]; if (vertices[i+1] > maxY) maxY = vertices[i+1]
    if (vertices[i+2] < minZ) minZ = vertices[i+2]; if (vertices[i+2] > maxZ) maxZ = vertices[i+2]
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] -= cx; vertices[i+1] -= cy; vertices[i+2] -= cz
  }
  return { cx, cy, cz }
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
