// ============================================================
// Rebuild helper — reconstructs scene objects from operation history
// Uses shared functions from csg/rebuildOps.ts for transform logic.
// ============================================================

import type {
  TinkerCraftOperation, SceneObject, ShapeType, ShapeParams,
  TransformNR, Vec3, AlignOperation,
} from '../csg/types'
import { workerRebuildScene } from '../csg/worker-client'
import { extractAndCenter, makeObject } from './helpers'
import {
  applyMoveDelta,
  applyMirrorToTransform,
  applyAlignToTransform,
  makeDefaultTransform,
  type RebuildTransform,
} from '../csg/rebuildOps'

/** Metadata accumulated over the operation chain. Exported for testing. */
export interface RebuildMeta {
  color: string
  shapeType: ShapeType
  params: ShapeParams
  transform: TransformNR
  visible: boolean
  name?: string
}

/**
 * Build metadata (transforms, colors, params) from operation history.
 * Pure function — no WASM dependency. Exported for testing.
 * Returns { meta, csgResultIds } matching what rebuildFromHistory uses.
 */
export function buildRebuildMeta(ops: TinkerCraftOperation[]): {
  meta: Record<string, RebuildMeta>
  csgResultIds: Set<string>
} {
  const meta: Record<string, RebuildMeta> = {}
  const transforms: Record<string, TransformNR> = {}
  const csgResultIds = new Set<string>()

  for (const op of ops) {
    if (op.type === 'add_shape') {
      meta[op.id] = { color: op.color, shapeType: op.shapeType, params: op.params, transform: { ...op.transform }, visible: true }
      transforms[op.id] = { ...op.transform }

    } else if (op.type === 'import_mesh') {
      const t: TransformNR = { ...op.transform }
      meta[op.id] = { color: op.color, shapeType: 'import_mesh', params: {}, transform: t, visible: true, name: op.name }
      transforms[op.id] = t

    } else if (op.type === 'fillet') {
      if (meta[op.id]) meta[op.id] = { ...meta[op.id], params: { ...meta[op.id].params, filletRadius: op.radius } }

    } else if (op.type === 'move') {
      const d: Vec3 = op.delta
      const rd = (op as { rotDelta?: Vec3 }).rotDelta
      const sd = (op as { scaleDelta?: Vec3 }).scaleDelta
      for (const id of op.ids) {
        const t = transforms[id]
        if (t && meta[id]) {
          const nt = applyMoveDelta(t as unknown as RebuildTransform, d, rd, sd) as TransformNR
          transforms[id] = nt
          meta[id] = { ...meta[id], transform: nt }
        }
      }

    } else if (op.type === 'mirror') {
      for (const id of op.ids) {
        const t = transforms[id]
        if (t && meta[id]) {
          const nt = applyMirrorToTransform(t as unknown as RebuildTransform, op.plane) as TransformNR
          transforms[id] = nt
          meta[id] = { ...meta[id], transform: nt }
        }
      }

    } else if (op.type === 'align') {
      const axis = op.axis.toLowerCase() as 'x' | 'y' | 'z'
      const deltas = (op as AlignOperation & { deltas?: Record<string, number> }).deltas
      if (deltas) {
        for (const [id, delta] of Object.entries(deltas)) {
          const t = transforms[id]
          if (t && meta[id]) {
            const nt = applyAlignToTransform(t as unknown as RebuildTransform, axis, delta) as TransformNR
            transforms[id] = nt
            meta[id] = { ...meta[id], transform: nt }
          }
        }
      }

    } else if (op.type === 'resize_dims') {
      // Update params for resized object — fixes missing dimensions after undo/redo (WARN-R6-1)
      if (meta[op.id]) meta[op.id] = { ...meta[op.id], params: { ...meta[op.id].params, ...op.params } }

    } else if (op.type === 'color') {
      for (const id of op.ids) {
        if (meta[id]) meta[id] = { ...meta[id], color: op.color }
      }

    } else if (op.type === 'visibility') {
      // Track visibility — fixes hidden objects becoming visible after undo/redo (WARN-R6-6)
      for (const id of op.ids) {
        if (meta[id]) meta[id] = { ...meta[id], visible: op.visible }
      }

    } else if (op.type === 'rename') {
      if (meta[op.id]) meta[op.id] = { ...meta[op.id], name: op.name }

    } else if (op.type === 'delete') {
      for (const id of op.ids) { delete meta[id]; delete transforms[id] }

    } else if (op.type === 'group') {
      const srcColor = op.ids[0] ? meta[op.ids[0]]?.color ?? '#89b4fa' : '#89b4fa'
      for (const id of op.ids) { delete meta[id]; delete transforms[id] }
      if (op.resultId) {
        // FIX (CRIT-CSG-2): Use resultCenter from the GroupOperation as the
        // initial transform for CSG results. Without this, the transform would
        // default to {0,0,0} and the CSG geometry would appear at the origin
        // instead of at its actual position after undo/redo.
        const startT: TransformNR = op.resultCenter
          ? { x: op.resultCenter.x, y: op.resultCenter.y, z: op.resultCenter.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
          : makeDefaultTransform() as TransformNR
        meta[op.resultId] = { color: srcColor, shapeType: 'cube', params: {}, transform: startT, visible: true }
        transforms[op.resultId] = startT
        csgResultIds.add(op.resultId)
        // Store result mesh data for rebuild (FIX CRIT-CSG-2)
        // This replaces shapeType-based reconstruction which loses all CSG geometry.
        ;(meta[op.resultId] as RebuildMeta & { resultVertices?: Float32Array | number[]; resultIndices?: Uint32Array | number[]; resultNormals?: Float32Array | number[] }).resultVertices = op.resultVertices
        ;(meta[op.resultId] as RebuildMeta & { resultVertices?: Float32Array | number[]; resultIndices?: Uint32Array | number[]; resultNormals?: Float32Array | number[] }).resultIndices = op.resultIndices
        ;(meta[op.resultId] as RebuildMeta & { resultVertices?: Float32Array | number[]; resultIndices?: Uint32Array | number[]; resultNormals?: Float32Array | number[] }).resultNormals = op.resultNormals
      }
    }
  }

  return { meta, csgResultIds }
}

export async function rebuildFromHistory(
  ops: TinkerCraftOperation[],
): Promise<Record<string, SceneObject>> {
  const { meta, csgResultIds } = buildRebuildMeta(ops)
  const result = await workerRebuildScene(ops)

  // For CSG results the worker returns geometry at world positions.  Center
  // each result's vertices and store the bbox offset as the pivot position,
  // matching what the direct csgBoolean action does.
  // FIX (CRIT-CSG-2): If the GroupOperation has resultVertices/resultIndices,
  // use those instead of the worker's rebuilt geometry — this preserves the
  // exact CSG result from the original operation.
  const meshByObjId = new Map(result.results.map(m => [m.objId, m]))
  for (const id of csgResultIds) {
    const m = meshByObjId.get(id)
    if (m && meta[id]) {
      const metaWithMesh = meta[id] as RebuildMeta & { resultVertices?: Float32Array | number[]; resultIndices?: Uint32Array | number[]; resultNormals?: Float32Array | number[] }
      if (metaWithMesh.resultVertices && metaWithMesh.resultIndices) {
        // Use the stored CSG result mesh data directly. The mesh is already
        // centered at origin (extractAndCenter was applied when the CSG
        // operation was performed). Now apply the accumulated transform
        // (position/rotation/scale) from the operation chain.
        const t = meta[id].transform
        const storedVerts = new Float32Array(metaWithMesh.resultVertices)
        const finalVerts = new Float32Array(storedVerts.length)
        const { x: px, y: py, z: pz } = t
        const rx = t.rotX * (Math.PI / 180), ry = t.rotY * (Math.PI / 180), rz = t.rotZ * (Math.PI / 180)
        const Sx = t.scaleX, Sy = t.scaleY, Sz = t.scaleZ
        // Precompute RS matrix (same as buildTransformMatrix but applied to vertices)
        const cx = Math.cos(rx), sx_ = Math.sin(rx)
        const cy = Math.cos(ry), sy_ = Math.sin(ry)
        const cz = Math.cos(rz), sz_ = Math.sin(rz)
        const r00 = cz * cy * Sx, r01 = (cz * sy_ * sx_ - sz_ * cx) * Sy, r02 = (cz * sy_ * cx + sz_ * sx_) * Sz
        const r10 = sz_ * cy * Sx, r11 = (sz_ * sy_ * sx_ + cz * cx) * Sy, r12 = (sz_ * sy_ * sx_ - cz * sx_) * Sz
        const r20 = -sy_ * Sx, r21 = cy * sx_ * Sy, r22 = cy * cx * Sz
        for (let i = 0; i < storedVerts.length; i += 3) {
          const vx = storedVerts[i], vy = storedVerts[i + 1], vz = storedVerts[i + 2]
          // RS * v + pos
          finalVerts[i]     = r00 * vx + r01 * vy + r02 * vz + px
          finalVerts[i + 1] = r10 * vx + r11 * vy + r12 * vz + py
          finalVerts[i + 2] = r20 * vx + r21 * vy + r22 * vz + pz
        }
        m.vertices = finalVerts
        m.indices = new Uint32Array(metaWithMesh.resultIndices)
        if (metaWithMesh.resultNormals) {
          // Transform normals (no translation)
          const storedNorms = new Float32Array(metaWithMesh.resultNormals)
          const finalNorms = new Float32Array(storedNorms.length)
          for (let i = 0; i < storedNorms.length; i += 3) {
            const nx = storedNorms[i], ny = storedNorms[i + 1], nz = storedNorms[i + 2]
            finalNorms[i]     = r00 * nx + r01 * ny + r02 * nz
            finalNorms[i + 1] = r10 * nx + r11 * ny + r12 * nz
            finalNorms[i + 2] = r20 * nx + r21 * ny + r22 * nz
          }
          m.normals = finalNorms
        }
        continue
      }
      const { cx, cy, cz } = extractAndCenter(m.vertices)
      meta[id] = { ...meta[id], transform: { ...meta[id].transform, x: cx, y: cy, z: cz } }
    }
  }

  const objects: Record<string, SceneObject> = {}
  for (const m of result.results) {
    const info = meta[m.objId]
    objects[m.objId] = makeObject({
      id: m.objId,
      name: info?.name,
      shapeType: info?.shapeType ?? 'cube',
      params: info?.params ?? {},
      color: info?.color ?? '#89b4fa',
      transform: info?.transform ?? makeDefaultTransform() as TransformNR,
      visible: info?.visible ?? true,
      locked: false,
      vertices: m.vertices,
      indices: m.indices,
      normals: m.normals,
    })
  }
  return objects
}
