// ============================================================
// Worker handlers — individual handlers for each operation
// Splitting the huge switch in worker.ts (800+ lines) into
// isolated functions for better readability and testability.
// ============================================================

import { buildSRTMatrixAroundCenter } from './worker-matrix'
import type { RebuildTransform } from './rebuildOps'
import { applyMoveDelta, applyMirrorToTransform, applyAlignToTransform } from './rebuildOps'

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
      const wasm = getWasm()
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
  const wasm = getWasm()
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
  const wasm = getWasm()
  const { Manifold } = wasm
  const t0 = performance.now()
  const shapeType = msg.shapeType
  const safeP = sanitizeParams(msg.params)

  // Rebuild primitive using the imported Manifold constructor
  let m: ManifoldObject
  switch (shapeType) {
    case 'cube': {
      let width = safeP.width, height = safeP.height, depth = safeP.depth
      if (!width || width <= 0) width = 20
      if (!height || height <= 0) height = 20
      if (!depth || depth <= 0) depth = 20
      m = Manifold.cube([width, height, depth], true)
      break
    }
    case 'sphere':
      m = Manifold.sphere(safeP.radius ?? 12, safeP.segments ?? 32)
      break
    case 'cylinder':
      m = Manifold.cylinder(safeP.height ?? 30, safeP.radius ?? 10, safeP.radius ?? 10, safeP.segments ?? 32, true)
      break
    case 'cone':
      m = Manifold.cylinder(safeP.height ?? 30, safeP.radius ?? 10, 0, safeP.segments ?? 32, true)
      break
    case 'torus': {
      const torusRadius = safeP.torusRadius ?? 15
      const tubeRadius = safeP.tubeRadius ?? 4
      const segments = Math.max(8, Math.round(safeP.segments ?? 32))
      const tubeSegs = Math.max(4, Math.round(safeP.tubeSegments ?? 16))
      const { CrossSection } = wasm
      const circle = CrossSection.circle(tubeRadius, tubeSegs)
      const translated = circle.translate([torusRadius, 0])
      m = Manifold.revolve(translated, segments)
      break
    }
    case 'prism': {
      const sides = Math.max(3, Math.round(safeP.sides ?? 6))
      m = Manifold.cylinder(safeP.height ?? 20, safeP.radius ?? 12, safeP.radius ?? 12, sides, true)
      break
    }
    case 'pyramid': {
      const sides = Math.max(3, Math.round(safeP.sides ?? 4))
      m = Manifold.cylinder(safeP.height ?? 20, safeP.radius ?? 12, 0, sides, true)
      break
    }
    default:
      m = Manifold.cube([20, 20, 20], true)
  }

  // Apply translation
  const t = msg.transform
  const transformMatrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, t.x, t.y, t.z, 1]
  m = m.transform(transformMatrix)

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
  const wasm = getWasm()
  const { Manifold } = wasm
  const t0 = performance.now()
  const shapeType = msg.shapeType
  const safeP = sanitizeParams(msg.params)
  const radius = clamp(msg.radius, 0, 1e4)

  let m: ManifoldObject
  if (radius > 0 && shapeType === 'cube') {
    // Build rounded box via warp + refine
    const w = safeP.width ?? 20, h = safeP.height ?? 20, d = safeP.depth ?? 20
    const maxR = Math.min(w, h, d) / 2 - 0.1
    const cr = Math.max(0.01, Math.min(radius, maxR))
    const hw = w / 2 - cr, hh = h / 2 - cr, hd = d / 2 - cr
    const cube = Manifold.cube([w, h, d], true)
    const refined = cube.refine(6)
    m = refined.warp((v: number[]) => {
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
  } else {
    // Build primitive without fillet
    switch (shapeType) {
      case 'cube': {
        let width = safeP.width, height = safeP.height, depth = safeP.depth
        if (!width || width <= 0) width = 20
        if (!height || height <= 0) height = 20
        if (!depth || depth <= 0) depth = 20
        m = Manifold.cube([width, height, depth], true)
        break
      }
      case 'sphere':
        m = Manifold.sphere(safeP.radius ?? 12, safeP.segments ?? 32)
        break
      case 'cylinder':
        m = Manifold.cylinder(safeP.height ?? 30, safeP.radius ?? 10, safeP.radius ?? 10, safeP.segments ?? 32, true)
        break
      case 'cone':
        m = Manifold.cylinder(safeP.height ?? 30, safeP.radius ?? 10, 0, safeP.segments ?? 32, true)
        break
      default:
        m = Manifold.cube([20, 20, 20], true)
    }
  }

  const t = msg.transform
  const transformMatrix = [1,0,0,0, 0,1,0,0, 0,0,1,0, t.x, t.y, t.z, 1]
  m = m.transform(transformMatrix)

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
  const wasm = getWasm()
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

// --- Rebuild scene handler ---

/** Full rebuild from operation history. Requires wasm to be initialized. */
export async function handleRebuildScene(msg: RebuildSceneMessage): Promise<void> {
  const t0 = performance.now()
  cache.clear()

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
      cache.set(op.id as string, m)
      shapeInfos.set(op.id as string, { shapeType: st, params: par, filletRadius: 0 })
      currentTransforms.set(op.id as string, { ...t })
    } else if (op.type === 'import_mesh') {
      const t: RebuildTransform = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
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
        cache.set(id, m)
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
            const m = applyTransform(buildPrimitiveWithFillet(info.shapeType, info.params, info.filletRadius), nt)
            cache.set(id, m)
          }
        } else {
          const cm = cache.get(id)
          if (cm) cache.set(id, cm.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, d.x, d.y, d.z, 1]))
        }
      }
    } else if (op.type === 'mirror') {
      const flip = getMirrorMatrix(op.plane as string)
      for (const id of op.ids as string[]) {
        const cm = cache.get(id)
        if (cm) cache.set(id, cm.transform(flip))
        const t = currentTransforms.get(id)
        if (t) {
          const nt = applyMirrorToTransform(t, op.plane as 'XY' | 'XZ' | 'YZ')
          currentTransforms.set(id, nt)
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
              cache.set(id, m)
            } else {
              const dx = axis === 'x' ? delta : 0
              const dy = axis === 'y' ? delta : 0
              const dz = axis === 'z' ? delta : 0
              const cm = cache.get(id)
              if (cm) cache.set(id, cm.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1]))
            }
          } else {
            const cm = cache.get(id)
            if (cm) {
              const dx = axis === 'x' ? delta : 0
              const dy = axis === 'y' ? delta : 0
              const dz = axis === 'z' ? delta : 0
              cache.set(id, cm.transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1]))
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
        cache.set(id, m)
      }
    } else if (op.type === 'group') {
      const ids = op.ids as string[]
      let a = cache.get(ids[0])
      let b = cache.get(ids[1])
      if (a && b) {
        const tA = currentTransforms.get(ids[0])
        const tB = currentTransforms.get(ids[1])
        if (tA && hasSR(tA)) a = applySRAroundCenter(a, tA)
        if (tB && hasSR(tB)) b = applySRAroundCenter(b, tB)
        let result: ManifoldObject
        const isIntersect = op.isIntersect as boolean
        const subtractOp = op.subtractOp as boolean | undefined
        if (isIntersect) result = a.intersect(b)
        else if (subtractOp) result = a.subtract(b)
        else result = a.add(b)
        cache.delete(ids[0])
        cache.delete(ids[1])
        cache.set(op.resultId as string, result)
      }
    } else if (op.type === 'delete') {
      for (const id of op.ids as string[]) {
        cache.delete(id)
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
    const { vertices, indices, normals, tris } = extractMesh(m)
    results.push({ objId, vertices, indices, normals, tris })
    transfers.push(vertices.buffer as ArrayBuffer, indices.buffer as ArrayBuffer)
    if (normals) transfers.push(normals.buffer as ArrayBuffer)
  }

  safePostMessage(
    { reqId: msg.reqId, type: 'sceneBuilt', results, ms: performance.now() - t0 },
    transfers,
  )
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
  // Build fresh primitives with full SRT (position + rotation + scale) around center.
  // For imported meshes (non-manifold, cached as null) we skip.
  for (const e of msg.entries) {
    // Skip if already cached as non-manifold (imported mesh that couldn't be manifold-created)
    const existing = cache.get(e.objId)
    if (existing === null) continue

    const params = sanitizeParams(e.params)
    const m = buildPrimitive(e.shapeType, params)
    // Apply full SRT around center (matches what handleRebuildScene does for primitives)
    const fullMatrix = buildSRTMatrixAroundCenter(
      { x: e.transform.x, y: e.transform.y, z: e.transform.z },
      { rotX: e.transform.rotX, rotY: e.transform.rotY, rotZ: e.transform.rotZ },
      { scaleX: e.transform.scaleX, scaleY: e.transform.scaleY, scaleZ: e.transform.scaleZ },
    )
    const tm = m.transform(fullMatrix)
    cache.set(e.objId, tm)
  }

  safePostMessage({ reqId: msg.reqId, type: 'ok' })
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
