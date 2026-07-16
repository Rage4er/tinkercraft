// ============================================================
// Worker handlers — individual handlers for each operation
// Splitting the huge switch in worker.ts (800+ lines) into
// isolated functions for better readability and testability.
// ============================================================

import { buildSRTMatrixAroundCenter } from './worker-matrix'
import type { RebuildTransform } from './rebuildOps'

// --- Type definitions (moved from worker.ts to avoid circular deps) ---

export interface ManifoldMesh {
  numProp: number
  vertProperties: Float32Array
  triVerts: ArrayBuffer
}

export interface ManifoldObject {
  transform(matrix: number[]): ManifoldObject
  add(other: ManifoldObject): ManifoldObject
  subtract(other: ManifoldObject): ManifoldObject
  intersect(other: ManifoldObject): ManifoldObject
  getMesh(): ManifoldMesh
  refine(recursions: number): ManifoldObject
  warp(fn: (v: number[]) => void): ManifoldObject
}

export interface CrossSection {
  translate(offset: [number, number]): CrossSection
}

export interface ManifoldConstructor {
  new (mesh: {
    vertProperties: Float32Array
    triVerts: Uint32Array | ArrayBuffer
    numProp: number
  }): ManifoldObject
  cube(size: [number, number, number], center: boolean): ManifoldObject
  sphere(radius: number, segments: number): ManifoldObject
  cylinder(
    height: number,
    radiusTop: number,
    radiusBottom: number,
    segments: number,
    center: boolean,
  ): ManifoldObject
  revolve(crossSection: CrossSection, segments: number): ManifoldObject
}

export interface CrossSectionConstructor {
  circle(radius: number, segments: number): CrossSection
}

export interface ManifoldAPI {
  Manifold: ManifoldConstructor
  CrossSection: CrossSectionConstructor
  setup(): void
}

// --- Worker globals (available in Web Worker context) ---
declare const self: Worker & typeof globalThis
declare const wasm: ManifoldAPI

/** Кэш manifold-объектов по id (null = non-manifold import, CSG not supported) */
export const cache = new Map<string, ManifoldObject | null>()

// --- ShapeInfo for rebuild ---
export interface ShapeInfo {
  shapeType: string
  params: Record<string, number>
  filletRadius: number
}

/** Re-export RebuildTransform for worker.ts */
export type { RebuildTransform }

// --- Validation ---

/** Clamp a value to [min, max]; returns min for NaN/Infinity. */
export function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, v))
}

/** Sanitise user-supplied params: drop non-numbers, clamp to ±1e6. */
export function sanitizeParams(params: Record<string, unknown>): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [key, val] of Object.entries(params)) {
    if (key.startsWith('_')) continue
    const n = typeof val === 'number' ? val : NaN
    result[key] = Number.isFinite(n) ? clamp(n, -1e6, 1e6) : 0
  }
  return result
}

// --- Safe postMessage ---

/** Safe postMessage wrapper with try/catch for DataCloneError. */
export function safePostMessage(msg: unknown, transferList?: ArrayBuffer[]): void {
  try {
    if (transferList && transferList.length > 0) {
      (self as Worker).postMessage(msg, transferList as Transferable[])
    } else {
      self.postMessage(msg)
    }
  } catch (err) {
    console.error('[Worker] postMessage failed:', err)
    self.postMessage({
      type: 'error',
      message: `postMessage failed: ${String(err)}`,
    })
  }
}

// --- Build primitives ---

/** Build a manifold primitive from shape type and params. */
export function buildPrimitive(shapeType: string, params: Record<string, number>): ManifoldObject {
  const { Manifold } = wasm
  switch (shapeType) {
    case 'cube': {
      let width = params.width
      let height = params.height
      let depth = params.depth
      if (width === undefined || width <= 0) width = 20
      if (height === undefined || height <= 0) height = 20
      if (depth === undefined || depth <= 0) depth = 20
      return Manifold.cube([width, height, depth], true)
    }
    case 'sphere':
      return Manifold.sphere(params.radius ?? 12, params.segments ?? 32)
    case 'cylinder':
      return Manifold.cylinder(
        params.height ?? 30,
        params.radius ?? 10,
        params.radius ?? 10,
        params.segments ?? 32,
        true,
      )
    case 'cone':
      return Manifold.cylinder(
        params.height ?? 30,
        params.radius ?? 10,
        0,
        params.segments ?? 32,
        true,
      )
    case 'torus': {
      const torusRadius = params.torusRadius ?? 15
      const tubeRadius = params.tubeRadius ?? 4
      const segments = Math.max(8, Math.round(params.segments ?? 32))
      const tubeSegs = Math.max(4, Math.round(params.tubeSegments ?? 16))
      const { CrossSection } = wasm
      const circle = CrossSection.circle(tubeRadius, tubeSegs)
      const translated = circle.translate([torusRadius, 0])
      return Manifold.revolve(translated, segments)
    }
    case 'prism': {
      const sides = Math.max(3, Math.round(params.sides ?? 6))
      return Manifold.cylinder(
        params.height ?? 20,
        params.radius ?? 12,
        params.radius ?? 12,
        sides,
        true,
      )
    }
    case 'pyramid': {
      const sides = Math.max(3, Math.round(params.sides ?? 4))
      return Manifold.cylinder(
        params.height ?? 20,
        params.radius ?? 12,
        0,
        sides,
        true,
      )
    }
    default:
      return Manifold.cube([20, 20, 20], true)
  }
}

/** Build a rounded box via warp + refine (only for cube). */
export function buildRoundedBox(w: number, h: number, d: number, r: number): ManifoldObject {
  const { Manifold } = wasm
  const maxR = Math.min(w, h, d) / 2 - 0.1
  const cr = Math.max(0.01, Math.min(r, maxR))
  const hw = w / 2 - cr
  const hh = h / 2 - cr
  const hd = d / 2 - cr

  const cube = Manifold.cube([w, h, d], true)
  const refined = cube.refine(6)

  return refined.warp((v: number[]) => {
    const x = v[0], y = v[1], z = v[2]
    const ex = Math.max(0, Math.abs(x) - hw)
    const ey = Math.max(0, Math.abs(y) - hh)
    const ez = Math.max(0, Math.abs(z) - hd)
    const len = Math.sqrt(ex * ex + ey * ey + ez * ez)
    if (len < 1e-9) return
    const s = cr / len
    v[0] = Math.sign(x) * hw + ex * s * Math.sign(x || 1)
    v[1] = Math.sign(y) * hh + ey * s * Math.sign(y || 1)
    v[2] = Math.sign(z) * hd + ez * s * Math.sign(z || 1)
  })
}

/** Build primitive with optional fillet (only works for cube). */
export function buildPrimitiveWithFillet(
  shapeType: string,
  params: Record<string, number>,
  r: number,
): ManifoldObject {
  if (r > 0 && shapeType === 'cube') {
    return buildRoundedBox(
      params.width ?? 20,
      params.height ?? 20,
      params.depth ?? 20,
      r,
    )
  }
  return buildPrimitive(shapeType, params)
}

// --- Transform helpers ---

/** Apply only translation to manifold geometry. */
export function applyTransform(
  manifold: ManifoldObject,
  t: { x: number; y: number; z: number },
): ManifoldObject {
  const m: number[] = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    t.x, t.y, t.z, 1,
  ]
  return manifold.transform(m)
}

/** Apply scale+rotation around the object's own world-space center before CSG. */
export function applySRAroundCenter(manifold: ManifoldObject, t: RebuildTransform): ManifoldObject {
  const matrix = buildSRTMatrixAroundCenter(
    { x: t.x, y: t.y, z: t.z },
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  return manifold.transform(matrix)
}

/** Returns true when the transform has non-trivial rotation or scale. */
export function hasSR(t: {
  rotX: number; rotY: number; rotZ: number
  scaleX: number; scaleY: number; scaleZ: number
}): boolean {
  return (
    Math.abs(t.rotX) > 1e-6 || Math.abs(t.rotY) > 1e-6 || Math.abs(t.rotZ) > 1e-6 ||
    Math.abs(t.scaleX - 1) > 1e-6 || Math.abs(t.scaleY - 1) > 1e-6 || Math.abs(t.scaleZ - 1) > 1e-6
  )
}

/** Get mirror matrix for a plane. */
export function getMirrorMatrix(plane: string): number[] {
  switch (plane) {
    case 'YZ':
      return [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    case 'XZ':
      return [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    case 'XY':
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1]
    default:
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  }
}

// --- Mesh extraction ---

export interface MeshResult {
  vertices: Float32Array
  indices: Uint32Array
  normals: Float32Array | null
  tris: number
}

/** Extract mesh data from manifold object. */
export function extractMesh(manifold: ManifoldObject): MeshResult {
  const mesh = manifold.getMesh()
  const numProp = mesh.numProp ?? 3
  const raw: Float32Array = mesh.vertProperties
  let vertices: Float32Array
  let normals: Float32Array | null = null

  if (numProp === 3) {
    vertices = new Float32Array(raw)
  } else {
    const count = raw.length / numProp
    vertices = new Float32Array(count * 3)
    if (numProp >= 6) {
      normals = new Float32Array(count * 3)
      for (let i = 0; i < count; i++) {
        vertices[i * 3] = raw[i * numProp]
        vertices[i * 3 + 1] = raw[i * numProp + 1]
        vertices[i * 3 + 2] = raw[i * numProp + 2]
        normals[i * 3] = raw[i * numProp + 3]
        normals[i * 3 + 1] = raw[i * numProp + 4]
        normals[i * 3 + 2] = raw[i * numProp + 5]
      }
    } else {
      for (let i = 0; i < count; i++) {
        vertices[i * 3] = raw[i * numProp]
        vertices[i * 3 + 1] = raw[i * numProp + 1]
        vertices[i * 3 + 2] = raw[i * numProp + 2]
      }
    }
  }
  const indices = new Uint32Array(mesh.triVerts)
  return { vertices, indices, normals, tris: indices.length / 3 }
}

// --- Transfer list builder ---

/** Build transfer list for postMessage from mesh data. */
function buildTransferList(mesh: MeshResult): ArrayBuffer[] {
  const list: ArrayBuffer[] = [mesh.vertices.buffer as ArrayBuffer, mesh.indices.buffer as ArrayBuffer]
  if (mesh.normals) list.push(mesh.normals.buffer as ArrayBuffer)
  return list
}

// --- Message handlers ---

export interface BuildShapeMessage {
  reqId: string
  type: 'buildShape'
  objId: string
  shapeType: string
  params: Record<string, number>
  transform: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX?: number; scaleY?: number; scaleZ?: number }
}

export interface ApplyFilletMessage {
  reqId: string
  type: 'applyFillet'
  objId: string
  shapeType: string
  params: Record<string, number>
  radius: number
  transform: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX?: number; scaleY?: number; scaleZ?: number }
}

export interface BuildImportedMeshMessage {
  reqId: string
  type: 'buildImportedMesh'
  objId: string
  vertices: number[]
  indices: number[]
}

export interface CsgBooleanMessage {
  reqId: string
  type: 'csgBoolean'
  idA: string
  idB: string
  resultId: string
  op: 'union' | 'subtract' | 'intersect'
  transformA?: RebuildTransform
  transformB?: RebuildTransform
}

export interface MirrorObjectMessage {
  reqId: string
  type: 'mirrorObject'
  objId: string
  plane: 'XY' | 'XZ' | 'YZ'
}

export interface RebuildSceneMessage {
  reqId: string
  type: 'rebuildScene'
  operations: Record<string, unknown>[]
}

export interface DeleteObjectsMessage {
  reqId: string
  type: 'deleteObjects'
  ids: string[]
}

export interface ClearAllMessage {
  reqId: string
  type: 'clearAll'
}

// --- Handler implementations ---

/** Handle buildShape message. */
export async function handleBuildShape(msg: BuildShapeMessage): Promise<void> {
  const t0 = performance.now()
  const shapeType = msg.shapeType
  const safeP = sanitizeParams(msg.params)
  let m = buildPrimitive(shapeType, safeP)
  m = applyTransform(m, msg.transform)
  cache.set(msg.objId, m)

  const mesh = extractMesh(m)
  safePostMessage(
    {
      reqId: msg.reqId,
      type: 'mesh',
      objId: msg.objId,
      vertices: mesh.vertices,
      indices: mesh.indices,
      normals: mesh.normals,
      tris: mesh.tris,
      ms: performance.now() - t0,
    },
    buildTransferList(mesh),
  )
}

/** Handle applyFillet message. */
export async function handleApplyFillet(msg: ApplyFilletMessage): Promise<void> {
  const t0 = performance.now()
  const shapeType = msg.shapeType
  const safeP = sanitizeParams(msg.params)
  const radius = clamp(msg.radius, 0, 1e4)
  let m = buildPrimitiveWithFillet(shapeType, safeP, radius)
  m = applyTransform(m, msg.transform)
  cache.set(msg.objId, m)

  const mesh = extractMesh(m)
  safePostMessage(
    {
      reqId: msg.reqId,
      type: 'mesh',
      objId: msg.objId,
      vertices: mesh.vertices,
      indices: mesh.indices,
      normals: mesh.normals,
      tris: mesh.tris,
      ms: performance.now() - t0,
    },
    buildTransferList(mesh),
  )
}

/** Handle buildImportedMesh message. */
export async function handleBuildImportedMesh(msg: BuildImportedMeshMessage): Promise<void> {
  const t0 = performance.now()
  const verts = new Float32Array(msg.vertices)
  const tris = new Uint32Array(msg.indices)
  try {
    const m = new wasm.Manifold({
      numProp: 3,
      vertProperties: verts,
      triVerts: tris,
    })
    cache.set(msg.objId, m)
    const mesh = extractMesh(m)
    safePostMessage(
      {
        reqId: msg.reqId,
        type: 'mesh',
        objId: msg.objId,
        vertices: mesh.vertices,
        indices: mesh.indices,
        normals: mesh.normals,
        tris: mesh.tris,
        ms: performance.now() - t0,
      },
      buildTransferList(mesh),
    )
  } catch (me) {
    // Non-manifold STL — return raw mesh without CSG support
    const mesh = { vertices: verts, indices: tris, normals: null, tris: tris.length / 3 }
    cache.set(msg.objId, null)
    safePostMessage(
      {
        reqId: msg.reqId,
        type: 'mesh',
        objId: msg.objId,
        vertices: mesh.vertices,
        indices: mesh.indices,
        tris: mesh.tris,
        ms: performance.now() - t0,
        nonManifold: true,
      },
      [mesh.vertices.buffer, mesh.indices.buffer],
    )
  }
}

/** Handle csgBoolean message. */
export async function handleCsgBoolean(msg: CsgBooleanMessage): Promise<void> {
  const t0 = performance.now()
  let a = cache.get(msg.idA)
  let b = cache.get(msg.idB)
  if (!a || !b) throw new Error(`Objects not found: ${msg.idA}, ${msg.idB}`)

  // Apply scale+rotation around each object's center before CSG
  if (msg.transformA && hasSR(msg.transformA)) a = applySRAroundCenter(a, msg.transformA)
  if (msg.transformB && hasSR(msg.transformB)) b = applySRAroundCenter(b, msg.transformB)

  let result: ManifoldObject
  switch (msg.op) {
    case 'union':
      result = a.add(b)
      break
    case 'subtract':
      result = a.subtract(b)
      break
    default:
      result = a.intersect(b)
  }

  cache.delete(msg.idA)
  cache.delete(msg.idB)
  cache.set(msg.resultId, result)

  const mesh = extractMesh(result)
  safePostMessage(
    {
      reqId: msg.reqId,
      type: 'mesh',
      objId: msg.resultId,
      vertices: mesh.vertices,
      indices: mesh.indices,
      normals: mesh.normals,
      tris: mesh.tris,
      ms: performance.now() - t0,
    },
    buildTransferList(mesh),
  )
}

/** Handle mirrorObject message. */
export async function handleMirrorObject(msg: MirrorObjectMessage): Promise<void> {
  const t0 = performance.now()
  const src = cache.get(msg.objId)
  if (!src) throw new Error(`Object not found: ${msg.objId}`)
  const m = src.transform(getMirrorMatrix(msg.plane))
  cache.set(msg.objId, m)

  const mesh = extractMesh(m)
  safePostMessage(
    {
      reqId: msg.reqId,
      type: 'mesh',
      objId: msg.objId,
      vertices: mesh.vertices,
      indices: mesh.indices,
      normals: mesh.normals,
      tris: mesh.tris,
      ms: performance.now() - t0,
    },
    buildTransferList(mesh),
  )
}
