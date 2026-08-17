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
import { notify } from './notifications'
import i18n from '../i18n'
import { devLog } from '../utils/debug'

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
      const deltas = op.deltas
      devLog('ALIGN:rebuildMeta', { opId: op, axis, deltas, ids: op.ids })
      for (const [id, delta] of Object.entries(deltas)) {
        const t = transforms[id]
        if (t && meta[id]) {
          const nt = applyAlignToTransform(t as unknown as RebuildTransform, axis, delta) as TransformNR
          transforms[id] = nt
          meta[id] = { ...meta[id], transform: nt }
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
      // FIX (PASTE-CSG-COLOR): For pasted CSG (ids: []), use op.color directly.
      const srcColor = op.ids.length > 0
        ? (op.ids[0] ? meta[op.ids[0]]?.color ?? '#89b4fa' : '#89b4fa')
        : (op.color ?? '#89b4fa')
      for (const id of op.ids) { delete meta[id]; delete transforms[id] }
      if (op.resultId) {
        // FIX (CRIT-CSG-2): Use resultCenter from the GroupOperation as the
        // initial transform for CSG results. Without this, the transform would
        // default to {0,0,0} and the CSG geometry would appear at the origin
        // instead of at its actual position after undo/redo.
        const startT: TransformNR = op.resultCenter
          ? { x: op.resultCenter.x, y: op.resultCenter.y, z: op.resultCenter.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
          : makeDefaultTransform() as TransformNR
        meta[op.resultId] = { color: srcColor, shapeType: op.shapeType ?? 'csg', params: {}, transform: startT, visible: true }
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
        // The stored CSG result mesh data is ALREADY centered at origin
        // (extractAndCenter was applied when the CSG operation was performed).
        // Keep vertices centered — the accumulated transform (position/rotation/
        // scale) from the operation chain is applied at render time via the pivot
        // (Viewport3D) and in the worker via handleSyncMesh (full TRS).
        //
        // FIX (MIRROR-CSG-RS): Previously this baked RS (rotation/scale) into the
        // vertices AND kept the RS in the transform, causing double-application
        // after undo/redo (both at render and in subsequent boolean operations).
        m.vertices = new Float32Array(metaWithMesh.resultVertices)
        m.indices = new Uint32Array(metaWithMesh.resultIndices)
        if (metaWithMesh.resultNormals) {
          m.normals = new Float32Array(metaWithMesh.resultNormals)
        }
        continue
      }
      // FIX (LOW-18-9): extractAndCenterInPlace mutates in-place, so vertices are already centered.
      // Only update meta with the center offset.
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
        const treeOp = op.treeOperation ?? 'union'

        // FIX (PASTE-CSG-TREE): Pasted CSG has ids: [] (no children).
        // Register as baked node from stored mesh data instead of boolean node.
        if (op.ids.length === 0) {
          if (objects && objects[op.resultId]) {
            const obj = objects[op.resultId]
            createBakedNode(op.resultId, obj.vertices, obj.indices, obj.normals ?? null, startT)
          }
          continue
        }

        // FIX (CYCLE-CSG): Verify children exist in tree before creating boolean node.
        const childAId = op.ids[0]
        const childBId = op.ids[1]
        const childA = getNode(childAId)
        const childB = getNode(childBId)

        if (!childA || !childB) {
          // FIX (CSG-MISSING-CHILD): If child is missing but we have stored mesh data,
          // register as baked node instead of skipping entirely.
          if (objects && objects[op.resultId]) {
            const obj = objects[op.resultId]
            createBakedNode(op.resultId, obj.vertices, obj.indices, obj.normals ?? null, startT)
          } else {
            console.warn(
              `[rebuildBuildTree] Skipping group ${op.resultId}: children not in tree. ` +
              `childA=${childAId} (${childA ? 'found' : 'missing'}), ` +
              `childB=${childBId} (${childB ? 'found' : 'missing'})`,
            )
          }
          continue
        }

        // FIX (CYCLE-CSG): Reset parentId on children before creating boolean node.
        // During jumpToHistory / loadFromProject, children may already have parentId
        // pointing to a previous tree node. Without reset, isAncestor() returns true
        // and createBooleanNode throws "Cannot create cycle in tree".
        childA.parentId = undefined
        childB.parentId = undefined

        try {
          // Pass the transform to the boolean node creation
          createBooleanNode(op.resultId, treeOp, childAId, childBId, startT)
        } catch (e) {
          // Tree creation failed (e.g., orphaned CSG, cycle detection) — skip
          console.warn(
            `[rebuildBuildTree] Failed to create boolean node ${op.resultId}:`,
            e,
            '\n  children:', { childA: childAId, childB: childBId },
            '\n  operation:', treeOp,
          )
          // FIX (MED-18-8): Notify user about boolean node creation failure
          try { notify(i18n.t('errors.csgFailed'), 'error') } catch { /* notify not available */ }
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
