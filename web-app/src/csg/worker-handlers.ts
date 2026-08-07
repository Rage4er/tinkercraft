// ============================================================
// Worker handlers — individual handlers for each operation
// Splitting the huge switch in worker.ts (800+ lines) into
// isolated functions for better readability and testability.
// ============================================================

import { buildSRTMatrixAroundCenter, buildTransformMatrix } from './worker-matrix'
import { FILLET_EPSILON, FILLET_MIN_RADIUS } from '../constants'
import type { RebuildTransform } from './rebuildOps'
import { applyMoveDelta, applyMirrorToTransform, applyAlignToTransform } from './rebuildOps'
import type { MirrorOperation } from './types'

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
  /** Frees the WASM memory — must be called when the object is no longer needed. */
  delete(): void
}

export interface CrossSection {
  translate(offset: [number, number]): CrossSection
  /** Frees the WASM memory — must be called when the object is no longer needed. */
  delete(): void
}

export interface ManifoldConstructor {
  new(mesh: {
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

// WASM API — initialized in initWasm(), exported for worker.ts
let _wasm: ManifoldAPI | null = null

export function getWasm(): ManifoldAPI {
  if (!_wasm) throw new Error('WASM not initialized — call initWasm() first')
  return _wasm
}

export function isWasmReady(): boolean {
  return _wasm !== null
}

/** Initialize manifold-3d WASM module. Must be called before any handler. */
export async function initWasm(): Promise<void> {
  const Module = await import('manifold-3d')
  const rawApi = await Module.default()

  if (!rawApi?.setup || !rawApi?.Manifold || !rawApi?.CrossSection) {
    throw new Error('Invalid manifold API: missing setup, Manifold, or CrossSection')
  }

  _wasm = rawApi as unknown as ManifoldAPI
  _wasm.setup()
  self.postMessage({ type: 'ready' })
}

/** Кэш manifold-объектов по id (null = non-manifold import, CSG not supported) */
export const cache = new Map<string, ManifoldObject | null>()

// --- Cache disposal helpers (CRIT-R8-1: prevent WASM memory leaks) ---

/** Safely delete a ManifoldObject's WASM memory. Ignores already-disposed objects. */
function safeDelete(m: ManifoldObject | null | undefined): void {
  if (!m) return
  try { m.delete() } catch { /* already disposed */ }
}

/** Replace a cache entry, disposing the previous object if it exists.
 *
 * FIX (SEC-R16-3): Basic check against disposed objects — attempt a no-op
 * access (toString) and skip caching if it fails, implying the object
 * has been disposed.
 */
export function setCached(id: string, m: ManifoldObject | null): void {
  if (m !== null) {
    try {
      // no-op access to verify the object is alive
      (m as unknown as { toString(): string }).toString()
    } catch {
      // Object has been disposed — do not cache it
      return
    }
  }
  safeDelete(cache.get(id))
  cache.set(id, m)
}

/** Dispose a cached manifold object and remove it from cache. */
export function disposeCached(id: string): void {
  safeDelete(cache.get(id))
  cache.delete(id)
}

/** Dispose all cached manifold objects and clear the cache. */
export function disposeAllCached(): void {
  for (const m of cache.values()) safeDelete(m)
  cache.clear()
}

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
  const wasm = getWasm()
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
    case 'sphere': {
      const r = params.radius ?? 12
      const seg = params.segments ?? 32
      if (r <= 0) return Manifold.cube([20, 20, 20], true)
      return Manifold.sphere(r, seg)
    }
    case 'cylinder': {
      const h = params.height ?? 30
      const r = params.radius ?? 10
      const seg = params.segments ?? 32
      if (h <= 0 || r <= 0) return Manifold.cube([20, 20, 20], true)
      return Manifold.cylinder(h, r, r, seg, true)
    }
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
      const result = Manifold.revolve(translated, segments)
      // Dispose intermediate CrossSection WASM objects
      translated.delete()
      circle.delete()
      return result
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
  const wasm = getWasm()
  const { Manifold } = wasm
  const maxR = Math.min(w, h, d) / 2 - FILLET_EPSILON
  const cr = Math.max(FILLET_MIN_RADIUS, Math.min(r, maxR))
  const hw = w / 2 - cr
  const hh = h / 2 - cr
  const hd = d / 2 - cr

  const cube = Manifold.cube([w, h, d], true)
  const refined = cube.refine(6)
  cube.delete()

  const warped = refined.warp((v: number[]) => {
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
  refined.delete()
  return warped
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

/** Apply only translation to manifold geometry. Disposes the source object. */
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
  const result = manifold.transform(m)
  manifold.delete()
  return result
}

/** Apply scale+rotation around the object's own world-space center before CSG. Disposes the source. */
export function applySRAroundCenter(manifold: ManifoldObject, t: RebuildTransform): ManifoldObject {
  const matrix = buildSRTMatrixAroundCenter(
    { x: t.x, y: t.y, z: t.z },
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const result = manifold.transform(matrix)
  manifold.delete()
  return result
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
  shapeType?: string
  params?: Record<string, number>
  transform?: {
    x: number
    y: number
    z: number
    rotX: number
    rotY: number
    rotZ: number
    scaleX: number
    scaleY: number
    scaleZ: number
  }
  /** Center point for mirror pivot (default: origin) */
  mirrorCenter?: { x: number; y: number; z: number }
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

  // Rebuild primitive using buildPrimitive (DRY: WARN-R8-3)
  let m = buildPrimitive(shapeType, safeP)

  // Apply translation
  const t = msg.transform
  const transformMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t.x, t.y, t.z, 1]
  const transformed = m.transform(transformMatrix)
  m.delete()
  m = transformed

  setCached(msg.objId, m)

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

  // DRY: use buildPrimitiveWithFillet instead of duplicated switch (WARN-R8-3)
  let m = buildPrimitiveWithFillet(shapeType, safeP, radius)

  // Apply translation
  const t = msg.transform
  const transformMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t.x, t.y, t.z, 1]
  const transformed = m.transform(transformMatrix)
  m.delete()
  m = transformed

  setCached(msg.objId, m)

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
  const wasm = getWasm()
  const t0 = performance.now()
  const verts = new Float32Array(msg.vertices)
  const tris = new Uint32Array(msg.indices)
  console.log(`[DIAG:handleBuildImportedMesh] objId=${msg.objId} verts=${verts.length} tris=${tris.length}`)
  try {
    const m = new wasm.Manifold({
      numProp: 3,
      vertProperties: verts,
      triVerts: tris,
    })
    console.log(`[DIAG:handleBuildImportedMesh] Manifold created successfully for ${msg.objId}`)
    setCached(msg.objId, m)
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
    console.warn(`[DIAG:handleBuildImportedMesh] Non-manifold for ${msg.objId}:`, me)
    const mesh = { vertices: verts, indices: tris, normals: null, tris: tris.length / 3 }
    setCached(msg.objId, null)
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
}

// --- BuildTree: rebuild a node from its tree definition ---

export interface RebuildTreeNodeMessage {
  reqId: string
  type: 'rebuildTreeNode'
  nodeId: string
  nodes: Array<{
    id: string
    type: 'primitive' | 'boolean' | 'baked'
    shapeType?: string
    params?: Record<string, number>
    localTransform?: { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX: number; scaleY: number; scaleZ: number }
    vertices?: number[]
    indices?: number[]
    normals?: number[]
    operation?: 'union' | 'subtract' | 'intersect'
    children?: string[]
  }>
  nodeIdPath: string[]
}

/** RebuildTreeNodeMessage node data type */
export type RebuildTreeNodeData = RebuildTreeNodeMessage['nodes'][number]

/**
 * Rebuild a tree node using worker. Sends node definition, rebuilds the subtree,
 * returns the extracted mesh. Used by history-tree rebuildNode when cache misses.
 *
 * NOTE: Returns mesh in WORLD coordinates (children transforms applied).
 * Centering and localTransform application is done by caller (applyCSGMeshes in history-tree.ts).
 */
export async function handleRebuildTreeNode(msg: RebuildTreeNodeMessage): Promise<void> {
  const t0 = performance.now()
  const wasm = getWasm()

  // Build a map of id → node data
  const nodeMap = new Map<string, RebuildTreeNodeMessage['nodes'][number]>()
  for (const n of msg.nodes) {
    nodeMap.set(n.id, n)
  }

  // Recursive function to rebuild a node and return ManifoldObject
  // rootId: the top-level node being rebuilt. Its localTransform is NOT applied
  // here (it's applied by applyCSGMeshes in history-tree.ts). Inner boolean nodes
  // get their localTransform applied after centering to position them correctly.
  function rebuildNode(id: string, rootId: string): ManifoldObject | null {
    const nd = nodeMap.get(id)
    if (!nd) return null

    let m: ManifoldObject | null = null

    if (nd.type === 'primitive') {
      // Build primitive
      const shapeType = nd.shapeType || 'cube'
      const params = nd.params || {}
      m = buildPrimitive(shapeType, params as Record<string, number>)
      // Apply transform
      const t = nd.localTransform || { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
      const matrix = buildTransformMatrix(
        { x: t.x, y: t.y, z: t.z },
        { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
        { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
      )
      const transformed = m.transform(matrix)
      m.delete()
      m = transformed

    } else if (nd.type === 'baked') {
      if (nd.vertices && nd.indices) {
        m = new wasm.Manifold({
          numProp: 3,
          vertProperties: new Float32Array(nd.vertices),
          triVerts: new Uint32Array(nd.indices),
        })
        // Baked geometry is centered at origin. Apply the node's world transform.
        // FIX (MIRROR-CSG-RS): Previously applied only translation, dropping the
        // rotation/scale of mirrored CSG results (baked nodes) used as nested
        // operands in a boolean tree — booleans were computed from unrotated/
        // unscaled simple shapes. Now apply full TRS when the transform has
        // non-trivial rotation/scale.
        const t = nd.localTransform || { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
        const hasRS = hasSR(t)
        let matrix: number[]
        if (hasRS) {
          matrix = buildTransformMatrix(
            { x: t.x, y: t.y, z: t.z },
            { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
            { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
          )
        } else {
          // Fast path: translation only.
          matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t.x, t.y, t.z, 1]
        }
        const transformed = m.transform(matrix)
        m.delete()
        m = transformed
      }

    } else if (nd.type === 'boolean' && nd.children && nd.operation) {
      const childA = rebuildNode(nd.children[0], rootId)
      const childB = rebuildNode(nd.children[1], rootId)
      if (childA && childB) {
        if (nd.operation === 'subtract') {
          m = childA.subtract(childB)
        } else if (nd.operation === 'intersect') {
          m = childA.intersect(childB)
        } else {
          m = childA.add(childB)
        }
        childA.delete()
        childB.delete()

        // Children have their transforms applied (world coordinates), so the boolean result
        // is also in world coordinates.
        //
        // For ROOT boolean node (id === rootId): center the result at origin so the
        // Three.js pivot (TRS) renders it at the mirrored position. The mirrored transform
        // from the frontend is applied via the pivot — the centered geometry + mirrored
        // TRS gives the correct mirrored CSG result.
        //
        // For INNER boolean nodes (id !== rootId): return the boolean result as-is
        // (in world coordinates). DO NOT center, shift, or apply localTransform.
        //
        // Why? The inner boolean's localTransform is STALE — moveTreeNode only updates
        // primitive/baked children, NOT boolean nodes. So localTransform.position is the
        // ORIGINAL centroid, not the current one. Using it would shift geometry by
        // (stale_centroid - actual_centroid), causing children to scatter.
        //
        // The ROOT boolean centers the final result at origin, which removes the overall
        // translation. Inner boolean results are in correct world coordinates relative
        // to each other and to sibling primitives (sphere). Root centering preserves
        // these relative positions while removing the absolute offset.
        if (id === rootId) {
          // Center root boolean — frontend pivot applies mirrored TRS
          const mesh = m.getMesh()
          const verts = mesh.vertProperties
          const numVerts = verts.length / mesh.numProp
          let cx = 0, cy = 0, cz = 0
          for (let i = 0; i < numVerts; i++) {
            cx += verts[i * mesh.numProp]
            cy += verts[i * mesh.numProp + 1]
            cz += verts[i * mesh.numProp + 2]
          }
          cx /= numVerts; cy /= numVerts; cz /= numVerts

          const centerMatrix = buildTransformMatrix(
            { x: -cx, y: -cy, z: -cz },
            { rotX: 0, rotY: 0, rotZ: 0 },
            { scaleX: 1, scaleY: 1, scaleZ: 1 },
          )
          const centered = m.transform(centerMatrix)
          m.delete()
          m = centered
        } else {
          // Inner boolean: pass-through. Return the boolean result as-is in world
          // coordinates. The ROOT boolean will center the final result.
          // See comment above for details.
        }
      }
    }

    return m
  }

  try {
    // Rebuild the target node
    const result = rebuildNode(msg.nodeId, msg.nodeId)
    if (!result) {
      safePostMessage({ reqId: msg.reqId, type: 'error', message: `Node ${msg.nodeId} not found` })
      return
    }

    const mesh = extractMesh(result)
    result.delete()

    safePostMessage(
      {
        reqId: msg.reqId,
        type: 'mesh',
        objId: msg.nodeId,
        vertices: mesh.vertices,
        indices: mesh.indices,
        normals: mesh.normals,
        tris: mesh.tris,
        ms: performance.now() - t0,
      },
      buildTransferList(mesh),
    )
  } catch (e: unknown) {
    safePostMessage({ reqId: msg.reqId, type: 'error', message: (e as Error).message })
  }
}

// --- Rebuild scene handler ---

/** Full rebuild from operation history. Requires wasm to be initialized.
 *
 * FIX (CRIT-R16-1): Wrapped in try/catch to ensure errors are reported back
 * to the main thread instead of silently failing and leaving the worker in
 * an inconsistent state. On error, the cache is disposed to prevent stale
 * objects from causing further issues.
 */
export async function handleRebuildScene(msg: RebuildSceneMessage): Promise<void> {
  const t0 = performance.now()
  disposeAllCached()

  try {
    const wasm = getWasm()
    const shapeInfos: Map<string, { shapeType: string; params: Record<string, number>; filletRadius: number }> = new Map()
    const currentTransforms: Map<string, RebuildTransform> = new Map()
    const ops = msg.operations as Record<string, unknown>[]

    for (const op of ops) {
      if (op.type === 'add_shape') {
        const raw = op.transform as {
          x: number; y: number; z: number
          rotX: number; rotY: number; rotZ: number
          scaleX?: number; scaleY?: number; scaleZ?: number
        }
        const t: RebuildTransform = {
          x: raw.x, y: raw.y, z: raw.z,
          rotX: raw.rotX, rotY: raw.rotY, rotZ: raw.rotZ,
          scaleX: raw.scaleX ?? 1, scaleY: raw.scaleY ?? 1, scaleZ: raw.scaleZ ?? 1,
        }
        const st = op.shapeType as string
        const par = op.params as Record<string, number>
        const m = applyTransform(buildPrimitive(st, sanitizeParams(par)), t)
        setCached(op.id as string, m)
        shapeInfos.set(op.id as string, { shapeType: st, params: par, filletRadius: 0 })
        currentTransforms.set(op.id as string, { ...t })
      } else if (op.type === 'import_mesh') {
        const raw = op.transform as { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; scaleX?: number; scaleY?: number; scaleZ?: number } | undefined
        const t: RebuildTransform = raw
          ? { x: raw.x, y: raw.y, z: raw.z, rotX: raw.rotX, rotY: raw.rotY, rotZ: raw.rotZ, scaleX: raw.scaleX ?? 1, scaleY: raw.scaleY ?? 1, scaleZ: raw.scaleZ ?? 1 }
          : { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
        currentTransforms.set(op.id as string, t)
        shapeInfos.set(op.id as string, { shapeType: 'import_mesh', params: {}, filletRadius: 0 })
      } else if (op.type === 'fillet') {
        const id = op.id as string
        const info = shapeInfos.get(id)
        const t = currentTransforms.get(id)
        if (info && t && info.shapeType !== 'import_mesh') {
          const r = op.radius as number
          info.filletRadius = r
          const m = applyTransform(buildPrimitiveWithFillet(info.shapeType, info.params, r), t)
          setCached(id, m)
        }
      } else if (op.type === 'move') {
        const d = op.delta as { x: number; y: number; z: number }
        const rd = (op as { rotDelta?: { x: number; y: number; z: number } }).rotDelta
        const sd = (op as { scaleDelta?: { x: number; y: number; z: number } }).scaleDelta
        for (const id of op.ids as string[]) {
          const info = shapeInfos.get(id)
          const t = currentTransforms.get(id)
          if (t) {
            const nt = applyMoveDelta(t, d, rd, sd)
            currentTransforms.set(id, nt)
            if (info) {
              const fresh = buildPrimitiveWithFillet(info.shapeType, info.params, info.filletRadius)
              const fullMatrix = buildTransformMatrix(
                { x: nt.x, y: nt.y, z: nt.z },
                { rotX: nt.rotX, rotY: nt.rotY, rotZ: nt.rotZ },
                { scaleX: nt.scaleX, scaleY: nt.scaleY, scaleZ: nt.scaleZ },
              )
              const tm = fresh.transform(fullMatrix)
              fresh.delete()
              setCached(id, tm)
            }
          } else {
            const cm = cache.get(id)
            if (cm) setCached(id, cm.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d.x, d.y, d.z, 1]))
          }
        }
      } else if (op.type === 'mirror') {
        const flip = getMirrorMatrix(op.plane as string)
        // Mirror creates NEW objects. Look up transforms from originalIds.
        const mirrorOp = op as unknown as MirrorOperation
        const origIds = mirrorOp.originalIds ?? []
        for (let i = 0; i < origIds.length && i < mirrorOp.ids.length; i++) {
          const origId = origIds[i]
          const newId = mirrorOp.ids[i]
          const cm = cache.get(newId)
          if (cm) {
            setCached(newId, cm.transform(flip))
          } else {
            const origT = currentTransforms.get(origId)
            const origShape = shapeInfos.get(origId)
            if (origT && origShape) {
              const nt = applyMirrorToTransform(origT, op.plane as 'XY' | 'XZ' | 'YZ')
              const m = applyTransform(buildPrimitiveWithFillet(origShape.shapeType, origShape.params, origShape.filletRadius), nt)
              setCached(newId, m)
              currentTransforms.set(newId, nt)
            }
          }
        }
      } else if (op.type === 'align') {
        const deltas = op.deltas as Record<string, number> | undefined
        if (deltas) {
          const axis = (op.axis as string).toLowerCase() as 'x' | 'y' | 'z'
          for (const [id, delta] of Object.entries(deltas)) {
            const info = shapeInfos.get(id)
            const t = currentTransforms.get(id)
            if (t) {
              const nt = applyAlignToTransform(t, axis, delta)
              currentTransforms.set(id, nt)
              if (info) {
                const m = applyTransform(buildPrimitiveWithFillet(info.shapeType, info.params, info.filletRadius), nt)
                setCached(id, m)
              } else {
                const dx = axis === 'x' ? delta : 0
                const dy = axis === 'y' ? delta : 0
                const dz = axis === 'z' ? delta : 0
                const cm = cache.get(id)
                if (cm) setCached(id, cm.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1]))
              }
            } else {
              const cm = cache.get(id)
              if (cm) {
                const dx = axis === 'x' ? delta : 0
                const dy = axis === 'y' ? delta : 0
                const dz = axis === 'z' ? delta : 0
                setCached(id, cm.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1]))
              }
            }
          }
        }
      } else if (op.type === 'resize_dims') {
        const id = op.id as string
        const np = op.params as Record<string, number>
        const info = shapeInfos.get(id)
        const t = currentTransforms.get(id)
        if (info && t) {
          info.params = { ...info.params, ...np }
          const m = applyTransform(buildPrimitiveWithFillet(info.shapeType, info.params, info.filletRadius), t)
          setCached(id, m)
        }
      } else if (op.type === 'group') {
        const ids = op.ids as string[]
        const resultId = op.resultId as string | undefined
        // FIX (CRIT-CSG-2): If resultVertices/resultIndices are stored in the
        // operation, use them directly instead of rebuilding from operands.
        // This preserves exact CSG geometry through undo/redo.
        const resultVerts = op.resultVertices as Float32Array | number[] | undefined
        const resultIdxs = op.resultIndices as Uint32Array | number[] | undefined
        if (resultVerts && resultIdxs && resultId) {
          // FIX (MED-18-16): Validate array sizes to prevent malicious/corrupt data
          // from creating gigantic arrays (buffer overflow / OOM protection)
          const vertCount = resultVerts instanceof Float32Array ? resultVerts.length : (resultVerts as ArrayLike<number>).length
          const idxCount = resultIdxs instanceof Uint32Array ? resultIdxs.length : (resultIdxs as ArrayLike<number>).length
          if (vertCount > 10_000_000 || idxCount > 30_000_000) {
            console.error(`[rebuild] resultVertices (${vertCount}) or resultIndices (${idxCount}) exceeds safety limit — skipping`)
            continue
          }
          // Build Manifold from stored vertices/indices
          const wasm = getWasm()
          const verts = new Float32Array(resultVerts)
          const tris = new Uint32Array(resultIdxs)
          try {
            let m = new wasm.Manifold({
              numProp: 3,
              vertProperties: verts,
              triVerts: tris,
            })
            // Apply accumulated transform (from move/mirror/align after group).
            // FIX (CRIT-CSG-2): If resultCenter is stored, use it as the initial
            // position — the mesh is centered at origin, so translation = resultCenter.
            let t: RebuildTransform | undefined
            if (currentTransforms.has(resultId)) {
              t = currentTransforms.get(resultId) as RebuildTransform
            } else if (op.resultCenter) {
              // First group operation with resultCenter — use it as initial position
              t = { x: (op.resultCenter as { x: number; y: number; z: number }).x, y: (op.resultCenter as { x: number; y: number; z: number }).y, z: (op.resultCenter as { x: number; y: number; z: number }).z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
              currentTransforms.set(resultId, t)
            }
            if (t) {
              if (hasSR(t)) {
                m = applySRAroundCenter(m, t)
              } else {
                const tm = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, t.x, t.y, t.z, 1]
                m = m.transform(tm)
              }
            }
            disposeCached(ids[0])
            disposeCached(ids[1])
            setCached(resultId, m)
          } catch (me) {
            // Non-manifold — cache as null
            console.warn('[Worker] Non-manifold CSG result:', me)
            disposeCached(ids[0])
            disposeCached(ids[1])
            setCached(resultId, null)
          }
        } else if (ids.length >= 2) {
          // Fallback: rebuild CSG from operands (legacy path for pre-fix operations)
          let a = cache.get(ids[0])
          let b = cache.get(ids[1])
          if (a && b) {
            const tA = currentTransforms.get(ids[0])
            const tB = currentTransforms.get(ids[1])
            if (tA && hasSR(tA)) a = applySRAroundCenter(a, tA)
            if (tB && hasSR(tB)) b = applySRAroundCenter(b, tB)
            let result: ManifoldObject
            const treeOp = op.treeOperation ?? 'union'
            if (treeOp === 'intersect') result = a.intersect(b)
            else if (treeOp === 'subtract') result = a.subtract(b)
            else result = a.add(b)
            disposeCached(ids[0])
            disposeCached(ids[1])
            setCached(resultId as string, result)
          }
        }
      } else if (op.type === 'delete') {
        for (const id of op.ids as string[]) {
          disposeCached(id)
          shapeInfos.delete(id)
          currentTransforms.delete(id)
        }
      }
      // visibility / color — no geometry change
    }

    const results: Array<{
      objId: string
      vertices: Float32Array
      indices: Uint32Array
      normals: Float32Array | null
      tris: number
    }> = []
    const transfers: ArrayBuffer[] = []
    for (const [objId, m] of cache) {
      if (!m) continue
      try {
        const { vertices, indices, normals, tris } = extractMesh(m)
        results.push({ objId, vertices, indices, normals, tris })
        transfers.push(vertices.buffer as ArrayBuffer, indices.buffer as ArrayBuffer)
        if (normals) transfers.push(normals.buffer as ArrayBuffer)
      } catch (extractErr) {
        // CRIT-9: Если extractMesh упал для одного объекта, не прерываем весь цикл.
        // Пропускаем проблемный объект, чтобы не потерять Transferable буферы других объектов.
        console.warn(`[Worker] extractMesh failed for ${objId}:`, extractErr)
        continue
      }
    }

    safePostMessage(
      { reqId: msg.reqId, type: 'sceneBuilt', results, ms: performance.now() - t0 },
      transfers,
    )
  } catch (err) {
    // FIX (CRIT-R16-1): On error, dispose cache to prevent stale objects
    // and send error back to main thread
    disposeAllCached()
    safePostMessage({ reqId: msg.reqId, type: 'error', message: `rebuildScene failed: ${String(err)}` })
  }
}

/** Handle csgBoolean message. */
export async function handleCsgBoolean(msg: CsgBooleanMessage): Promise<void> {
  const t0 = performance.now()
  let a = cache.get(msg.idA)
  let b = cache.get(msg.idB)
  if (!a || !b) throw new Error(`Objects not found: ${msg.idA}, ${msg.idB}`)

  // Note: caller (document-store.csgBoolean) must call workerSyncObjects() first
  // to ensure worker cache has geometry with correct position/rotation/scale.
  // The transformA/transformB parameters are legacy and kept for backward compat.

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

  disposeCached(msg.idA)
  disposeCached(msg.idB)
  setCached(msg.resultId, result)

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

// --- Sync objects (rebuild worker cache from store data) ---

export interface SyncObjectsMessage {
  reqId: string
  type: 'syncObjects'
  entries: Array<{
    objId: string
    shapeType: string
    params: Record<string, number>
    transform: RebuildTransform
  }>
}

/** Rebuild worker cache entries from store data. Fixes stale cache after undo/redo and move operations. */
export async function handleSyncObjects(msg: SyncObjectsMessage): Promise<void> {
  // Build fresh primitives with full TRS (position + rotation + scale) around origin.
  // For imported meshes (non-manifold, cached as null) we skip.
  for (const e of msg.entries) {
    // Skip if already cached as non-manifold (imported mesh that couldn't be manifold-created)
    const existing = cache.get(e.objId)
    if (existing === null) continue

    const params = sanitizeParams(e.params)
    const m = buildPrimitive(e.shapeType, params)
    let success = false
    try {
      const fullMatrix = buildTransformMatrix(
        { x: e.transform.x, y: e.transform.y, z: e.transform.z },
        { rotX: e.transform.rotX, rotY: e.transform.rotY, rotZ: e.transform.rotZ },
        { scaleX: e.transform.scaleX, scaleY: e.transform.scaleY, scaleZ: e.transform.scaleZ },
      )
      const tm = m.transform(fullMatrix)
      setCached(e.objId, tm)
      success = true
    } finally {
      // FIX (LOW-18-15): Dispose on error to prevent WASM memory leak
      if (!success) m.delete()
    }
  }

  safePostMessage({ reqId: msg.reqId, type: 'ok' })
}

// --- Combined sync + CSG boolean (PERF-R6-2: single round-trip) ---

export interface CsgBooleanSyncMessage {
  reqId: string
  type: 'csgBooleanSync'
  idA: string
  idB: string
  op: string
  resultId: string
  transformA: RebuildTransform
  transformB: RebuildTransform
  shapeA?: { shapeType: string; params: Record<string, number> }
  shapeB?: { shapeType: string; params: Record<string, number> }
}

/**
 * Combined sync + CSG boolean in one handler (PERF-R6-2).
 * Always rebuilds both operands in cache with fresh TRS, then performs the boolean.
 * Uses buildTransformMatrix (TRS around origin) for primitives centered at (0,0,0).
 *
 * FIX (CRIT-CSG-3): Always sync operands regardless of cache state.
 * Previous logic skipped sync when operand was already in cache, causing:
 * 1. CSG operations to use stale positions (operand moved after last sync)
 * 2. Operand disposal after boolean → "Objects not found" on next operation
 * Now: sync always applies fresh TRS, then disposes operands after boolean.
 * For CSG results / imported meshes (shapeType=undefined), skip rebuild
 * since they can't be rebuilt from shapeType+params — rely on previous sync.
 */
export async function handleCsgBooleanSync(msg: CsgBooleanSyncMessage): Promise<void> {
  const t0 = performance.now()

  // Sync operand A — build primitive at origin, apply TRS
  // FIX (CRIT-CSG-3): Always rebuild from shapeType/params when available,
  // regardless of cache state. This ensures the operand has the correct
  // position/rotation/scale for the boolean operation.
  if (msg.shapeA) {
    const params = sanitizeParams(msg.shapeA.params)
    const m = buildPrimitive(msg.shapeA.shapeType, params)
    const fullMatrix = buildTransformMatrix(
      { x: msg.transformA.x, y: msg.transformA.y, z: msg.transformA.z },
      { rotX: msg.transformA.rotX, rotY: msg.transformA.rotY, rotZ: msg.transformA.rotZ },
      { scaleX: msg.transformA.scaleX, scaleY: msg.transformA.scaleY, scaleZ: msg.transformA.scaleZ },
    )
    setCached(msg.idA, m.transform(fullMatrix))
    // FIX (HIGH-18-11): Dispose operand primitive after applying transform to prevent WASM memory leak
    m.delete()
  }
  // If shapeA is undefined (CSG result or imported mesh), skip rebuild —
  // rely on previous syncObjectsForOperation that called workerSyncMesh.

  // Sync operand B — same logic
  if (msg.shapeB) {
    const params = sanitizeParams(msg.shapeB.params)
    const m = buildPrimitive(msg.shapeB.shapeType, params)
    const fullMatrix = buildTransformMatrix(
      { x: msg.transformB.x, y: msg.transformB.y, z: msg.transformB.z },
      { rotX: msg.transformB.rotX, rotY: msg.transformB.rotY, rotZ: msg.transformB.rotZ },
      { scaleX: msg.transformB.scaleX, scaleY: msg.transformB.scaleY, scaleZ: msg.transformB.scaleZ },
    )
    setCached(msg.idB, m.transform(fullMatrix))
    // FIX (HIGH-18-11): Dispose operand primitive after applying transform to prevent WASM memory leak
    m.delete()
  }

  // Perform boolean
  const a = cache.get(msg.idA)
  const b = cache.get(msg.idB)
  if (!a || !b) throw new Error(`Objects not found: ${msg.idA}, ${msg.idB}`)

  let result: ManifoldObject
  switch (msg.op) {
    case 'union': result = a.add(b); break
    case 'subtract': result = a.subtract(b); break
    default: result = a.intersect(b)
  }

  disposeCached(msg.idA)
  disposeCached(msg.idB)
  setCached(msg.resultId, result)

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

/** Handle mirrorObject message.
 *
 * Используется ТОЛЬКО для import_mesh (не-примитивов).
 * Для примитивов mirror делается через build tree (mirrorNodeRecursive + rebuildNode).
 *
 * Логика для import_mesh:
 * 1. Геометрия src уже содержит baked transform (позицию/ротацию/scale).
 * 2. translate к mirrorCenter → mirror → translate обратно (отражаем геометрию).
 * 3. Применяем transform с новой позицией (newPos = 2*mirrorCenter - originalPos)
 *    и отражёнными rot/scale.
 */
export async function handleMirrorObject(msg: MirrorObjectMessage): Promise<void> {
  const t0 = performance.now()
  const src = cache.get(msg.objId)
  if (!src) throw new Error(`Object not found: ${msg.objId}`)

  // Mirror center: translate geometry to center, mirror, translate back
  const mc = msg.mirrorCenter ?? { x: 0, y: 0, z: 0 }

  let mesh: MeshResult

  // Для примитивов (shapeType и params присутствуют):
  // 1. Строим примитив (origin)
  // 2. Зеркалим геометрию относительно origin через mirror matrix
  // 3. Применяем transform (отражённая позиция, отражённый rot, abs scale)
  //
  // FIX (MIRROR-GEOMETRY): Scale always positive (abs). Mirror geometry
  // is done via matrix transform, NOT via negative scale. Negative scale
  // = 180° flip, not a mirror reflection.
  if (msg.shapeType && msg.params) {
    const fresh = buildPrimitive(msg.shapeType, msg.params)

    // 1. Mirror geometry относительно origin
    const mirrorMatrix = getMirrorMatrix(msg.plane)
    const mirrored = fresh.transform(mirrorMatrix)
    safeDelete(fresh)

    // 2. Apply transform (отражённая позиция, отражённый rot, abs scale)
    if (msg.transform) {
      const t = msg.transform
      const transformMatrix = buildTransformMatrix(
        { x: t.x, y: t.y, z: t.z },
        { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
        {
          scaleX: Math.abs(t.scaleX),
          scaleY: Math.abs(t.scaleY),
          scaleZ: Math.abs(t.scaleZ),
        }
      )
      const transformed = mirrored.transform(transformMatrix)
      safeDelete(mirrored)
      setCached(msg.objId, transformed)
      mesh = extractMesh(transformed)
    } else {
      setCached(msg.objId, mirrored)
      mesh = extractMesh(mirrored)
    }
  }
  // Для CSG / импорта (shapeType/params отсутствуют):
  // 1. Translate к mirrorCenter
  // 2. Mirror геометрии относительно mirrorCenter
  // 3. Translate обратно по msg.transform.position (mirroredPos)
  // 4. Применяем rotation/scale (position=0, geometry уже в mirroredPos)
  // 5. Store resultTransform = identity (geometry уже позиционирована worker)
  //
  // FIX (MIRROR-GEOMETRY): Scale always positive (abs). Mirror geometry
  // is done via matrix transform relative to mirrorCenter.
  else {
    if (!msg.transform) throw new Error(`Transform is required for CSG/import objects`)

    const t = msg.transform

    // 1. Translate to mirror center
    const toCenter = buildTransformMatrix(
      { x: mc.x, y: mc.y, z: mc.z },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 }
    )
    const atCenter = src.transform(toCenter)
    safeDelete(src)
    // 2. Mirror (относительно mirrorCenter)
    const mirrorMatrix = getMirrorMatrix(msg.plane)
    const mirrored = atCenter.transform(mirrorMatrix)
    safeDelete(atCenter)
    // 3. Translate back по msg.transform.position (mirroredPos)
    const backToPos = buildTransformMatrix(
      { x: t.x, y: t.y, z: t.z },
      { rotX: 0, rotY: 0, rotZ: 0 },
      { scaleX: 1, scaleY: 1, scaleZ: 1 }
    )
    const atMirroredPos = mirrored.transform(backToPos)
    safeDelete(mirrored)

    // 4. Применяем rotation/scale (position=0, geometry уже в mirroredPos)
    const rotMatrix = buildTransformMatrix(
      { x: 0, y: 0, z: 0 },
      { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
      {
        scaleX: Math.abs(t.scaleX),
        scaleY: Math.abs(t.scaleY),
        scaleZ: Math.abs(t.scaleZ),
      }
    )
    const fullyTransformed = atMirroredPos.transform(rotMatrix)
    safeDelete(atMirroredPos)

    setCached(msg.objId, fullyTransformed)
    mesh = extractMesh(fullyTransformed)
  }

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

// --- Sync mesh from vertices/indices (for CSG results) ---

export interface SyncMeshMessage {
  reqId: string
  type: 'syncMesh'
  objId: string
  vertices: Float32Array | number[]
  indices: Uint32Array | number[]
  transform: RebuildTransform
}

/**
 * Sync a mesh into worker cache from raw vertices/indices.
 * Used for CSG results and imported meshes that cannot be rebuilt from shapeType+params.
 *
 * FIX (CRIT-CSG-5 / MIRROR-CSG-RS): CSG result meshes are centered at origin.
 * The transform carries the full TRS (position + rotation + scale). Rotation/scale
 * are applied at render time via the Three.js pivot (Viewport3D), so the stored
 * vertices do NOT have rotation/scale baked in.
 *
 * For booleans to work, the worker cache manifold must be at the object's true
 * world position WITH rotation/scale applied. Two cases:
 *  - Translation-only transform (normal CSG results from csgBoolean): fast path —
 *    apply only translation (v' = v + pos).
 *  - Transform with non-trivial rotation/scale (mirrored CSG results, CSG results
 *    moved with rotation/scale, imported meshes): apply full TRS
 *    (v' = RS·v + pos) via buildTransformMatrix. Without this, booleans on
 *    mirrored/rotated/scaled CSG results lose rotation/scale and produce
 *    incorrect geometry.
 */
export async function handleSyncMesh(msg: SyncMeshMessage): Promise<void> {
  const wasm = getWasm()
  const verts = new Float32Array(msg.vertices)
  const tris = new Uint32Array(msg.indices)
  const hasRotationOrScale = hasSR(msg.transform)
  console.log(`[DIAG:handleSyncMesh] objId=${msg.objId} verts=${verts.length} tris=${tris.length} transform=(${msg.transform.x}, ${msg.transform.y}, ${msg.transform.z}) hasSR=${hasRotationOrScale}`)
  try {
    let m = new wasm.Manifold({
      numProp: 3,
      vertProperties: verts,
      triVerts: tris,
    })
    console.log(`[DIAG:handleSyncMesh] Manifold created successfully for ${msg.objId}`)
    // Geometry is centered at origin. Apply the object's world transform so the
    // cached manifold is at the correct world position with rotation/scale.
    let matrix: number[]
    if (hasRotationOrScale) {
      // Full TRS: v' = RS·v + pos (geometry centered at origin).
      matrix = buildTransformMatrix(
        { x: msg.transform.x, y: msg.transform.y, z: msg.transform.z },
        { rotX: msg.transform.rotX, rotY: msg.transform.rotY, rotZ: msg.transform.rotZ },
        { scaleX: msg.transform.scaleX, scaleY: msg.transform.scaleY, scaleZ: msg.transform.scaleZ },
      )
    } else {
      // Fast path: translation only (normal CSG results have translation-only transform).
      matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, msg.transform.x, msg.transform.y, msg.transform.z, 1]
    }
    m = m.transform(matrix)
    setCached(msg.objId, m)
    console.log(`[DIAG:handleSyncMesh] Cached ${msg.objId} as ManifoldObject`)
    safePostMessage({ reqId: msg.reqId, type: 'ok' })
  } catch (me) {
    // Non-manifold — cache as null (CSG not supported for this object)
    console.warn(`[DIAG:handleSyncMesh] Non-manifold for ${msg.objId}:`, me)
    setCached(msg.objId, null)
    safePostMessage({ reqId: msg.reqId, type: 'ok' })
  }
}
