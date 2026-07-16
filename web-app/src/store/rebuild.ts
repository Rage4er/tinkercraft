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

export async function rebuildFromHistory(
  ops: TinkerCraftOperation[],
): Promise<Record<string, SceneObject>> {
  const result = await workerRebuildScene(ops)

  const meta: Record<string, { color: string; shapeType: ShapeType; params: ShapeParams; transform: TransformNR }> = {}
  const transforms: Record<string, TransformNR> = {}
  const csgResultIds = new Set<string>()

  for (const op of ops) {
    if (op.type === 'add_shape') {
      meta[op.id]       = { color: op.color, shapeType: op.shapeType, params: op.params, transform: { ...op.transform } }
      transforms[op.id] = { ...op.transform }

    } else if (op.type === 'import_mesh') {
      const t: TransformNR = { ...op.transform }
      meta[op.id]       = { color: op.color, shapeType: 'import_mesh', params: {}, transform: t }
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

    } else if (op.type === 'color') {
      for (const id of op.ids) {
        if (meta[id]) meta[id] = { ...meta[id], color: op.color }
      }

    } else if (op.type === 'delete') {
      for (const id of op.ids) { delete meta[id]; delete transforms[id] }

    } else if (op.type === 'group') {
      const srcColor = op.ids[0] ? meta[op.ids[0]]?.color ?? '#89b4fa' : '#89b4fa'
      for (const id of op.ids) { delete meta[id]; delete transforms[id] }
      if (op.resultId) {
        const nullT = makeDefaultTransform() as TransformNR
        meta[op.resultId]       = { color: srcColor, shapeType: 'cube', params: {}, transform: nullT }
        transforms[op.resultId] = nullT
        csgResultIds.add(op.resultId)
      }
    }
  }

  // For CSG results the worker returns geometry at world positions.  Center
  // each result's vertices and store the bbox offset as the pivot position,
  // matching what the direct csgBoolean action does.
  const meshByObjId = new Map(result.results.map(m => [m.objId, m]))
  for (const id of csgResultIds) {
    const m = meshByObjId.get(id)
    if (m && meta[id]) {
      const { cx, cy, cz } = extractAndCenter(m.vertices)
      meta[id] = { ...meta[id], transform: { ...meta[id].transform, x: cx, y: cy, z: cz } }
    }
  }

  const objects: Record<string, SceneObject> = {}
  for (const m of result.results) {
    const info = meta[m.objId]
    objects[m.objId] = makeObject({
      id:        m.objId,
      shapeType: info?.shapeType ?? 'cube',
      params:    info?.params    ?? {},
      color:     info?.color     ?? '#89b4fa',
      transform: info?.transform ?? makeDefaultTransform() as TransformNR,
      visible:   true,
      locked:    false,
      vertices:  m.vertices,
      indices:   m.indices,
      normals:   m.normals,
    })
  }
  return objects
}
