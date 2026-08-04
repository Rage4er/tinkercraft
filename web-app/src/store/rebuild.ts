// ============================================================
// Rebuild helper — reconstructs scene objects from operation history
// Uses shared functions from csg/rebuildOps.ts for transform logic.
// ============================================================

import type {
  TinkerCraftOperation, SceneObject, ShapeType, ShapeParams,
  TransformNR, Vec3, AlignOperation,
} from '../csg/types'
import { workerRebuildScene } from '../csg/worker-client'
import { extractAndCenterInPlace, makeObject } from './helpers'
import {
  applyMoveDelta,
  applyMirrorToTransform,
  applyAlignToTransform,
  makeDefaultTransform,
  type RebuildTransform,
} from '../csg/rebuildOps'
import {
  createPrimitiveNode,
  createBooleanNode,
  createBakedNode,
  getNode,
} from '../csg/history-tree'
import { computeRSMatrix } from '../csg/worker-matrix'
import { notify } from './notifications'

/** Metadata accumulated over the operation chain. Exported for testing. */
export interface RebuildMeta {
  color: string
  shapeType: ShapeType
  params: ShapeParams
  transform: TransformNR
  visible: boolean
  name?: string
  // CSG result mesh data — stored for rebuildFromHistory reconstruction
  resultVertices?: Float32Array | number[]
  resultIndices?: Uint32Array | number[]
  resultNormals?: Float32Array | number[]
  originalBboxSize?: { x: number; y: number; z: number }
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
      // Mirror creates NEW objects. The originalIds hold the source objects'
      // transforms. We mirror each and store under the corresponding new id.
      const origIds = (op as { originalIds?: string[] }).originalIds ?? []
      for (let i = 0; i < origIds.length && i < op.ids.length; i++) {
        const origId = origIds[i]
        const newId = op.ids[i]
        const t = transforms[origId]
        if (t && meta[origId]) {
          const nt = applyMirrorToTransform(t as unknown as RebuildTransform, op.plane) as TransformNR
          transforms[newId] = nt
          meta[newId] = { ...meta[origId], transform: nt }
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
        // No more type casting — fields are now part of RebuildMeta interface.
        meta[op.resultId].resultVertices = op.resultVertices
        meta[op.resultId].resultIndices = op.resultIndices
        meta[op.resultId].resultNormals = op.resultNormals
        if (op.originalBboxSize) {
          meta[op.resultId].originalBboxSize = op.originalBboxSize
        }
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
        // FIX (CODE-R16-1): Use shared computeRSMatrix instead of duplicated inline math
        const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
          { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
          { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
        )
        for (let i = 0; i < storedVerts.length; i += 3) {
          const vx = storedVerts[i], vy = storedVerts[i + 1], vz = storedVerts[i + 2]
          // RS * v + pos
          finalVerts[i] = r00 * vx + r01 * vy + r02 * vz + px
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
            finalNorms[i] = r00 * nx + r01 * ny + r02 * nz
            finalNorms[i + 1] = r10 * nx + r11 * ny + r12 * nz
            finalNorms[i + 2] = r20 * nx + r21 * ny + r22 * nz
          }
          m.normals = finalNorms
        }
        continue
      }
      const { cx, cy, cz } = extractAndCenterInPlace(new Float32Array(m.vertices))
      meta[id] = { ...meta[id], transform: { ...meta[id].transform, x: cx, y: cy, z: cz } }
    }
  }

  const objects: Record<string, SceneObject> = {}
  for (const m of result.results) {
    const info = meta[m.objId]
    // For CSG results, use originalBboxSize if available
    const metaWithMesh = meta[m.objId] as RebuildMeta & { resultVertices?: Float32Array | number[]; resultIndices?: Uint32Array | number[]; resultNormals?: Float32Array | number[]; originalBboxSize?: { x: number; y: number; z: number } }
    const originalBboxSize = metaWithMesh.originalBboxSize
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
      originalBboxSize,
    })
  }
  return objects
}

// ---------------------------------------------------------------------------
// BuildTree reconstruction (called after rebuildFromHistory)
// ---------------------------------------------------------------------------

/**
 * Rebuild the build tree from operations.
 * Called after rebuildFromHistory to keep the tree in sync with the scene.
 * This is essential for undo/redo to work correctly with tree operations.
 */
export function rebuildBuildTree(
  ops: TinkerCraftOperation[],
  objects?: Record<string, SceneObject>,
): void {
  const transforms: Record<string, TransformNR> = {}

  for (const op of ops) {
    if (op.type === 'add_shape') {
      if (!getNode(op.id)) {
        createPrimitiveNode(op.id, op.shapeType, op.params, { ...op.transform })
      }
      transforms[op.id] = { ...op.transform }

    } else if (op.type === 'import_mesh') {
      transforms[op.id] = { ...op.transform }
      // Baked node created in registerBakedNodes() after mesh data is available
      // (called at end of rebuildBuildTree when `objects` parameter is provided)

    } else if (op.type === 'move') {
      const d: Vec3 = op.delta
      const rd = (op as { rotDelta?: Vec3 }).rotDelta
      const sd = (op as { scaleDelta?: Vec3 }).scaleDelta
      for (const id of op.ids) {
        const t = transforms[id]
        if (t) {
          const nt = applyMoveDelta(t as unknown as RebuildTransform, d, rd, sd) as TransformNR
          transforms[id] = nt
          // Update tree node transform if it exists
          const node = getNode(id)
          if (node && node.localTransform) {
            node.localTransform = { ...nt }
          }
        }
      }

    } else if (op.type === 'mirror') {
      const origIds = (op as { originalIds?: string[] }).originalIds ?? []
      for (let i = 0; i < origIds.length && i < op.ids.length; i++) {
        const origId = origIds[i]
        const newId = op.ids[i]
        const t = transforms[origId]
        if (t) {
          const nt = applyMirrorToTransform(t as unknown as RebuildTransform, op.plane) as TransformNR
          transforms[newId] = nt
          // Register mirrored primitive in tree
          const origNode = getNode(origId)
          if (origNode && origNode.type === 'primitive') {
            createPrimitiveNode(newId, origNode.shapeType!, { ...origNode.params! }, nt)
          } else if (origNode && origNode.type === 'baked') {
            createBakedNode(newId, origNode.vertices!, origNode.indices!, origNode.normals ?? null, nt)
          } else {
            // Fallback: create a placeholder primitive node
            createPrimitiveNode(newId, 'cube', {}, nt)
          }
        }
      }

    } else if (op.type === 'group') {
      for (const id of op.ids) { delete transforms[id] }
      if (op.resultId) {
        const startT: TransformNR = op.resultCenter
          ? { x: op.resultCenter.x, y: op.resultCenter.y, z: op.resultCenter.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
          : makeDefaultTransform() as TransformNR
        transforms[op.resultId] = startT
        // Register boolean node in tree
        const treeOp = op.treeOperation ?? 'union'
        try {
          // Pass the transform to the boolean node creation
          createBooleanNode(op.resultId, treeOp, op.ids[0], op.ids[1], startT)
        } catch (e) {
          // Tree creation failed (e.g., orphaned CSG) — notify user
          console.warn('[rebuildBuildTree] Failed to create boolean node:', op.resultId, e)
          // FIX (MED-18-8): Notify user about boolean node creation failure
          try { notify('Ошибка создания булевой операции', 'error') } catch { /* notify not available */ }
        }
      }
    }
  }

  // Register baked nodes for import_mesh operations that have mesh data
  if (objects) {
    registerBakedNodes(objects, ops)
  }
}

/**
 * Register baked nodes after rebuildFromHistory has the mesh data.
 */
export function registerBakedNodes(
  objects: Record<string, SceneObject>,
  ops: TinkerCraftOperation[],
): void {
  for (const op of ops) {
    if (op.type === 'import_mesh' && objects[op.id]) {
      const obj = objects[op.id]
      if (obj.vertices && obj.indices) {
        createBakedNode(op.id, obj.vertices, obj.indices, obj.normals ?? null, obj.transform)
      }
    }
  }
}
