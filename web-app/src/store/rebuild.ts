// ============================================================
// Rebuild helper — reconstructs scene objects from operation history
// ============================================================

import type {
  TinkerCraftOperation, SceneObject, ShapeType, ShapeParams,
  TransformNR, Vec3, AlignOperation,
} from '../csg/types'
import { workerRebuildScene } from '../csg/worker-client'
import { extractAndCenter, makeObject } from './helpers'

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
          const nt: TransformNR = {
            ...t,
            x: t.x + d.x, y: t.y + d.y, z: t.z + d.z,
            rotX: t.rotX + (rd?.x ?? 0),
            rotY: t.rotY + (rd?.y ?? 0),
            rotZ: t.rotZ + (rd?.z ?? 0),
            scaleX: t.scaleX + (sd?.x ?? 0),
            scaleY: t.scaleY + (sd?.y ?? 0),
            scaleZ: t.scaleZ + (sd?.z ?? 0),
          }
          transforms[id] = nt
          meta[id] = { ...meta[id], transform: nt }
        }
      }

    } else if (op.type === 'mirror') {
      for (const id of op.ids) {
        const t = transforms[id]
        if (t && meta[id]) {
          const nt: TransformNR = { ...t }
          if (op.plane === 'YZ') nt.x = -nt.x
          if (op.plane === 'XZ') nt.y = -nt.y
          if (op.plane === 'XY') nt.z = -nt.z
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
            const nt: TransformNR = { ...t, [axis]: t[axis] + delta }
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
        const nullT: TransformNR = { x:0,y:0,z:0,rotX:0,rotY:0,rotZ:0,scaleX:1,scaleY:1,scaleZ:1 }
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
      transform: info?.transform ?? { x:0,y:0,z:0,rotX:0,rotY:0,rotZ:0,scaleX:1,scaleY:1,scaleZ:1 },
      visible:   true,
      locked:    false,
      vertices:  m.vertices,
      indices:   m.indices,
      normals:   m.normals,
    })
  }
  return objects
}
