// ============================================================
// Zustand store — TinkerCraftDocument с полным undo/redo
// ============================================================
//
// Утилиты (computeAABB, extractAndCenter, makeObject, nextId, colorForIndex)
// вынесены в ./helpers.ts
// Интерфейс DocumentStore — в ./types.ts
// rebuildFromHistory — в ./rebuild.ts
// Реэкспорт computeAABB и extractAndCenter — для unit-тестов.

import { create } from 'zustand/react'
import type {
  TinkerCraftOperation, AddShapeOperation, ImportMeshOperation,
  FilletOperation, MirrorOperation, AlignOperation, ResizeDimsOperation,
  SceneObject, ShapeParams, TransformNR, Vec3,
} from '../csg/types'
import {
  workerBuildShape, workerCsgBoolean,
  workerClearAll, workerDeleteObjects, workerMirrorObject,
  workerApplyFillet, workerBuildImportedMesh,
} from '../csg/worker-client'
import { parseDoodle, serializeDoodle, openDoodleFilePicker, downloadBlob } from '../io/doodle-io'
import { notify } from './notifications'
import { saveProject as pmSave, updateProject as pmUpdate, loadProject as pmLoad } from '../io/project-manager'
import { downloadStl } from '../io/stl-export'
import { openStlFilePicker, parseStlFile } from '../io/stl-import'
import { autosaveSession, restoreSession } from '../io/autosave'

// Re-export for backward compatibility (unit tests import from here)
export { computeAABB, extractAndCenter } from './helpers'
import { computeAABB, extractAndCenter, makeObject, nextId, colorForIndex } from './helpers'
import type { ClipEntry } from './helpers'
import type { DocumentStore } from './types'
import { rebuildFromHistory } from './rebuild'
import { cacheSnapshot, getCachedSnapshot, clearSnapshots } from './snapshots'

// ---- Store ----

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  operations:       [],
  historyIndex:     0,
  objects:          {},
  selectedIds:      [],
  clipboard:        [],
  fileName:         null,
  modified:         false,
  busy:             false,
  lastCsgMs:        null,
  currentProjectId: null,

  // ── Добавить фигуру ──
  addShape: async (shapeType, params) => {
    const { objects, operations, historyIndex } = get()
    const idx = Object.keys(objects).length
    const id  = nextId('obj')
    const transform: TransformNR = { x: idx * 25, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const color = colorForIndex(idx)
    const defaultParams: ShapeParams =
      shapeType === 'sphere'   ? { radius: 12, segments: 32 }
      : shapeType === 'cone'   ? { radius: 10, height: 24, segments: 32 }
      : shapeType === 'torus'  ? { torusRadius: 15, tubeRadius: 4, segments: 32, tubeSegments: 16 }
      : shapeType === 'prism'  ? { radius: 12, height: 20, sides: 6 }
      : shapeType === 'pyramid'? { radius: 12, height: 20, sides: 4 }
      : { width: 20, height: 20, depth: 20 }
    const finalParams = params ?? defaultParams
    const op: AddShapeOperation = { type: 'add_shape', id, shapeType, params: finalParams, color, transform }
    set({ busy: true })
    try {
      const t0   = performance.now()
      const mesh = await workerBuildShape(id, shapeType, finalParams, transform)
      const ms   = performance.now() - t0
      const obj: SceneObject = makeObject({ id, shapeType, params: finalParams, color, transform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('addShape:', e) }
  },

  // ── Добавить произвольный меш (текст, и т.д.) ──
  addRawMesh: async (name, vertices, indices) => {
    const { objects, operations, historyIndex } = get()
    const id    = nextId('txt')
    const color = colorForIndex(Object.keys(objects).length)
    const transform: TransformNR = { x: Object.keys(objects).length * 25, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    set({ busy: true })
    try {
      const t0     = performance.now()
      const result = await workerBuildImportedMesh(id, vertices, indices)
      const ms     = performance.now() - t0
      const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color, transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices, normals: result.normals })
      const op: ImportMeshOperation = { type: 'import_mesh', id, name, color, transform, vertices, indices }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('addRawMesh:', e) }
  },

  // ── Импорт STL ──
  importStl: async () => {
    const file = await openStlFilePicker()
    if (!file) return
    const mesh = await parseStlFile(file)
    if (!mesh) { notify('Не удалось прочитать STL файл', 'error'); return }

    const { objects, operations, historyIndex } = get()
    const id    = nextId('stl')
    const color = colorForIndex(Object.keys(objects).length)
    set({ busy: true })
    try {
      const t0     = performance.now()
      const result = await workerBuildImportedMesh(id, mesh.vertices, mesh.indices)
      const ms     = performance.now() - t0

      const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color, transform: mesh.transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices })
      const op: ImportMeshOperation = { type: 'import_mesh', id, name: mesh.name, color, transform: mesh.transform, vertices: mesh.vertices, indices: mesh.indices }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); notify(`Ошибка импорта STL: ${e}`, 'error') }
  },

  // ── Fillet ──
  applyFillet: async (id, radius) => {
    const { objects, operations, historyIndex } = get()
    const obj = objects[id]
    if (!obj) return
    set({ busy: true })
    try {
      const t0   = performance.now()
      const mesh = await workerApplyFillet(id, obj.shapeType, obj.params, radius, obj.transform)
      const ms   = performance.now() - t0
      const op: FilletOperation = { type: 'fillet', id, radius }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: { ...obj, params: { ...obj.params, filletRadius: radius }, vertices: mesh.vertices, indices: mesh.indices } }
      set({
        operations: newOps,
        historyIndex: newOps.length,
        objects: newObjects,
        modified: true,
        busy: false,
        lastCsgMs: ms,
      })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('applyFillet:', e) }
  },

  // ── Copy ──
  copySelected: () => {
    const { selectedIds, objects } = get()
    const clips: ClipEntry[] = selectedIds.flatMap(id => {
      const obj = objects[id]
      if (!obj) return []
      const entry: ClipEntry = { shapeType: obj.shapeType, params: obj.params, color: obj.color, transform: obj.transform }
      if (obj.shapeType === 'import_mesh') {
        entry.importVertices = Array.from(obj.vertices)
        entry.importIndices  = Array.from(obj.indices)
      }
      return [entry]
    })
    if (clips.length > 0) set({ clipboard: clips })
  },

  // ── Paste ──
  pasteClipboard: async () => {
    const { clipboard, objects, operations, historyIndex } = get()
    if (clipboard.length === 0) return
    set({ busy: true })
    try {
      const t0 = performance.now()
      let newObjects = { ...objects }
      const newOps = [...operations.slice(0, historyIndex)]
      const pastedIds: string[] = []

      for (const clip of clipboard) {
        const id        = nextId('obj')
        const transform: TransformNR = { ...clip.transform, x: clip.transform.x + 15, y: clip.transform.y + 0, z: clip.transform.z + 15 }

        if (clip.shapeType === 'import_mesh' && clip.importVertices && clip.importIndices) {
          const result = await workerBuildImportedMesh(id, clip.importVertices, clip.importIndices)
          const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color: clip.color, transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices })
          const op: ImportMeshOperation = { type: 'import_mesh', id, name: 'pasted', color: clip.color, transform, vertices: clip.importVertices, indices: clip.importIndices }
          newObjects = { ...newObjects, [id]: obj }
          newOps.push(op)
        } else {
          const mesh = await workerBuildShape(id, clip.shapeType, clip.params, transform)
          const obj: SceneObject = makeObject({ id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
          const op: AddShapeOperation = { type: 'add_shape', id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform }
          newObjects = { ...newObjects, [id]: obj }
          newOps.push(op)
        }
        pastedIds.push(id)
      }

      const ms = performance.now() - t0
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: pastedIds, modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('paste:', e) }
  },

  // ── Delete ──
  deleteSelected: async () => {
    const { selectedIds, objects, operations, historyIndex } = get()
    const ids = selectedIds.filter(id => objects[id])
    if (ids.length === 0) return
    const op: TinkerCraftOperation = { type: 'delete', ids }
    const newObjects = { ...objects }
    for (const id of ids) delete newObjects[id]
    await workerDeleteObjects(ids)
    const newOps = [...operations.slice(0, historyIndex), op]
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [], modified: true })
    cacheSnapshot(newOps.length, newObjects)
  },

  selectObjects: (ids, add) => {
    const { selectedIds } = get()
    if (add) {
      const s = new Set(selectedIds)
      for (const id of ids) { if (s.has(id)) s.delete(id); else s.add(id) }
      set({ selectedIds: [...s] })
    } else {
      set({ selectedIds: ids })
    }
  },

  clearSelection: () => set({ selectedIds: [] }),

  // ── CSG ──
  csgBoolean: async (op) => {
    const { selectedIds, objects, operations, historyIndex } = get()
    if (selectedIds.length !== 2) return
    const [idA, idB] = selectedIds
    if (!objects[idA] || !objects[idB]) return
    const resultId = nextId('csg')
    set({ busy: true })
    try {
      const t0   = performance.now()
      // Pass scale+rotation of each operand so the worker can apply them
      // temporarily before the boolean op (cached geometry has translation only).
      const srOf = (id: string) => {
        const t = objects[id].transform
        return { x: t.x, y: t.y, z: t.z, rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ, scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ }
      }
      const mesh = await workerCsgBoolean(idA, idB, op, resultId, srOf(idA), srOf(idB))
      const ms   = performance.now() - t0
      // Center result geometry at origin so the Three.js pivot can be placed at
      // the true world position (bbox center of the boolean result).
      const { cx, cy, cz } = extractAndCenter(mesh.vertices)
      const newObj: SceneObject = makeObject({ id: resultId, shapeType: 'cube', params: {}, color: objects[idA].color, transform: { x:cx,y:cy,z:cz,rotX:0,rotY:0,rotZ:0,scaleX:1,scaleY:1,scaleZ:1 }, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
      const newObjects = { ...objects }; delete newObjects[idA]; delete newObjects[idB]; newObjects[resultId] = newObj
      const histOp: TinkerCraftOperation = { type: 'group', ids: [idA, idB], isHull: false, isIntersect: op === 'intersect', subtractOp: op === 'subtract', resultId } as TinkerCraftOperation
      const newOps = [...operations.slice(0, historyIndex), histOp]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [resultId], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('csgBoolean:', e) }
  },

  // ── Move ──
  moveObject: async (id, transform) => {
    const { objects, operations, historyIndex } = get()
    const obj = objects[id]
    if (!obj) return
    const delta: Vec3 = { x: transform.x - obj.transform.x, y: transform.y - obj.transform.y, z: transform.z - obj.transform.z }
    const rotDelta: Vec3 = { x: transform.rotX - obj.transform.rotX, y: transform.rotY - obj.transform.rotY, z: transform.rotZ - obj.transform.rotZ }
    const scaleDelta: Vec3 = { x: transform.scaleX - obj.transform.scaleX, y: transform.scaleY - obj.transform.scaleY, z: transform.scaleZ - obj.transform.scaleZ }
    const eps = 1e-6
    const hasPos   = Math.abs(delta.x) > eps || Math.abs(delta.y) > eps || Math.abs(delta.z) > eps
    const hasRot   = Math.abs(rotDelta.x) > eps || Math.abs(rotDelta.y) > eps || Math.abs(rotDelta.z) > eps
    const hasScale = Math.abs(scaleDelta.x) > eps || Math.abs(scaleDelta.y) > eps || Math.abs(scaleDelta.z) > eps
    const kind = hasScale && !hasPos && !hasRot ? 'scale' : hasRot && !hasPos && !hasScale ? 'rotate' : 'translate'
    const op: TinkerCraftOperation = { type: 'move', ids: [id], delta, rotDelta, scaleDelta, kind }
    const newOps = [...operations.slice(0, historyIndex), op]
    const newObjects = { ...objects, [id]: { ...obj, transform } }
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshot(newOps.length, newObjects)
  },

  // ── Color ──
  setColor: (id, color) => {
    const { objects, operations, historyIndex } = get()
    if (!objects[id]) return
    const op: TinkerCraftOperation = { type: 'color', ids: [id], color }
    const newOps = [...operations.slice(0, historyIndex), op]
    const newObjects = { ...objects, [id]: { ...objects[id], color } }
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshot(newOps.length, newObjects)
  },

  // ── Visibility ──
  toggleVisible: (id) => {
    const { objects, operations, historyIndex } = get()
    if (!objects[id]) return
    const newVis = !objects[id].visible
    const op: TinkerCraftOperation = { type: 'visibility', ids: [id], visible: newVis }
    const newOps = [...operations.slice(0, historyIndex), op]
    const newObjects = { ...objects, [id]: { ...objects[id], visible: newVis } }
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshot(newOps.length, newObjects)
  },

  // ── Mirror ──
  mirrorSelected: async (plane) => {
    const { selectedIds, objects, operations, historyIndex } = get()
    const ids = selectedIds.filter(id => objects[id])
    if (ids.length === 0) return
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = { ...objects }
      for (const id of ids) {
        const mesh = await workerMirrorObject(id, plane)
        const obj  = newObjects[id]
        const t    = { ...obj.transform }
        if (plane === 'YZ') t.x = -t.x
        if (plane === 'XZ') t.y = -t.y
        if (plane === 'XY') t.z = -t.z
        newObjects[id] = makeObject({ ...obj, transform: t, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
      }
      const op: MirrorOperation = { type: 'mirror', ids, plane }
      const newOps = [...operations.slice(0, historyIndex), op]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('mirrorSelected:', e) }
  },

  // ── Align ──
  alignSelected: async (axis, anchor) => {
    const { selectedIds, objects, operations, historyIndex } = get()
    const ids = selectedIds.filter(id => objects[id])
    if (ids.length < 2) return
    const ax = axis.toLowerCase() as 'x' | 'y' | 'z'
    const bboxes = ids.map(id => ({ id, bbox: objects[id].aabb ?? computeAABB(objects[id].vertices) }))
    let targetValue: number
    switch (anchor) {
      case 'min':    targetValue = Math.min(...bboxes.map(b => b.bbox.min[ax])); break
      case 'max':    targetValue = Math.max(...bboxes.map(b => b.bbox.max[ax])); break
      default: { const all = bboxes.flatMap(b => [b.bbox.min[ax], b.bbox.max[ax]]); targetValue = (Math.min(...all) + Math.max(...all)) / 2 }
    }
    const deltas: Record<string, number> = {}
    for (const { id, bbox } of bboxes) {
      const cur = anchor === 'min' ? bbox.min[ax] : anchor === 'max' ? bbox.max[ax] : (bbox.min[ax] + bbox.max[ax]) / 2
      deltas[id] = targetValue - cur
    }
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = { ...objects }
      for (const { id } of bboxes) {
        const delta = deltas[id]
        if (Math.abs(delta) < 0.001) continue
        const obj = newObjects[id]
        const dx = axis === 'X' ? delta : 0, dy = axis === 'Y' ? delta : 0, dz = axis === 'Z' ? delta : 0
        const nt: TransformNR = { ...obj.transform, x: obj.transform.x + dx, y: obj.transform.y + dy, z: obj.transform.z + dz }
        const mesh = await workerBuildShape(id, obj.shapeType, obj.params, nt)
        newObjects[id] = makeObject({ ...obj, transform: nt, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
      }
      const op: AlignOperation & { deltas: Record<string, number> } = { type: 'align', ids, axis, anchor, deltas }
      const newOps = [...operations.slice(0, historyIndex), op as unknown as TinkerCraftOperation]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('alignSelected:', e) }
  },

  // ── Undo ──
  undo: async () => {
    const { historyIndex, operations } = get()
    if (historyIndex === 0) return
    const newIdx = historyIndex - 1
    set({ busy: true })
    try {
      const t0 = performance.now()
      const cached = getCachedSnapshot(newIdx)
      const newObjects = cached ?? await rebuildFromHistory(operations.slice(0, newIdx))
      if (!cached) cacheSnapshot(newIdx, newObjects)
      set({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: performance.now() - t0 })
    } catch (e) { set({ busy: false }); console.error('undo:', e) }
  },

  // ── Redo ──
  redo: async () => {
    const { historyIndex, operations } = get()
    if (historyIndex >= operations.length) return
    const newIdx = historyIndex + 1
    set({ busy: true })
    try {
      const t0 = performance.now()
      const cached = getCachedSnapshot(newIdx)
      const newObjects = cached ?? await rebuildFromHistory(operations.slice(0, newIdx))
      if (!cached) cacheSnapshot(newIdx, newObjects)
      set({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: performance.now() - t0 })
    } catch (e) { set({ busy: false }); console.error('redo:', e) }
  },

  // ── Jump to history ──
  jumpToHistory: async (index) => {
    const { historyIndex, operations } = get()
    const newIdx = Math.max(0, Math.min(index, operations.length))
    if (newIdx === historyIndex) return
    set({ busy: true })
    try {
      const t0 = performance.now()
      const cached = getCachedSnapshot(newIdx)
      const newObjects = cached ?? await rebuildFromHistory(operations.slice(0, newIdx))
      if (!cached) cacheSnapshot(newIdx, newObjects)
      set({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: performance.now() - t0 })
    } catch (e) { set({ busy: false }); console.error('jumpToHistory:', e) }
  },

  // ── Clear ──
  clearScene: async () => {
    await workerClearAll()
    clearSnapshots()
    set({ operations: [], historyIndex: 0, objects: {}, selectedIds: [], modified: false, fileName: null, lastCsgMs: null })
  },

  // ── Open .doodle ──
  openDoodle: async () => {
    const picked = await openDoodleFilePicker()
    if (!picked) return
    set({ busy: true })
    try {
      const doc = await parseDoodle(picked.buffer)
      await workerClearAll()
      clearSnapshots()
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(doc.operations)
      set({ operations: doc.operations, historyIndex: doc.operations.length, objects: newObjects, selectedIds: [], fileName: picked.file.name, modified: false, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshot(doc.operations.length, newObjects)
    } catch (e) { set({ busy: false }); notify(`Ошибка открытия: ${e}`, 'error') }
  },

  // ── Save .doodle ──
  saveDoodle: async () => {
    const { operations, historyIndex, fileName } = get()
    const opsToSave = operations.slice(0, historyIndex)
    const blob = await serializeDoodle(opsToSave)
    downloadBlob(blob, (fileName ?? 'untitled') + (fileName?.endsWith('.doodle') ? '' : '.doodle'))
    set({ modified: false })
  },

  // ── Export STL ──
  exportStl: () => {
    const { objects, fileName } = get()
    downloadStl(Object.values(objects), (fileName?.replace(/\.doodle$/, '') ?? 'tinkercraft') + '.stl')
  },

  // ── Resize dims ──
  resizeObject: async (id, params) => {
    const { objects, operations, historyIndex } = get()
    const obj = objects[id]
    if (!obj || obj.shapeType === 'import_mesh') return
    const mergedParams = { ...obj.params, ...params }
    set({ busy: true })
    try {
      const t0   = performance.now()
      const mesh = await workerBuildShape(id, obj.shapeType, mergedParams, obj.transform)
      const ms   = performance.now() - t0
      const op: ResizeDimsOperation = { type: 'resize_dims', id, params: mergedParams }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: makeObject({ ...obj, params: mergedParams, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals }) }
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('resizeObject:', e) }
  },

  // ── Extrude ──
  extrudeSelected: async (axis, depth) => {
    const { selectedIds, objects, operations, historyIndex } = get()
    if (selectedIds.length !== 1) return
    const id  = selectedIds[0]
    const obj = objects[id]
    if (!obj) return

    const bbox = obj.aabb ?? computeAABB(obj.vertices)
    const size = { x: bbox.max.x - bbox.min.x, y: bbox.max.y - bbox.min.y, z: bbox.max.z - bbox.min.z }

    let slabW: number, slabH: number, slabD: number
    let slabX: number, slabY: number, slabZ: number
    const ad = Math.abs(depth)
    if (axis === 'X') {
      slabW = ad; slabH = size.y; slabD = size.z
      slabX = depth > 0 ? bbox.max.x + ad / 2 : bbox.min.x - ad / 2
      slabY = (bbox.min.y + bbox.max.y) / 2
      slabZ = (bbox.min.z + bbox.max.z) / 2
    } else if (axis === 'Y') {
      slabW = size.x; slabH = ad; slabD = size.z
      slabX = (bbox.min.x + bbox.max.x) / 2
      slabY = depth > 0 ? bbox.max.y + ad / 2 : bbox.min.y - ad / 2
      slabZ = (bbox.min.z + bbox.max.z) / 2
    } else {
      slabW = size.x; slabH = size.y; slabD = ad
      slabX = (bbox.min.x + bbox.max.x) / 2
      slabY = (bbox.min.y + bbox.max.y) / 2
      slabZ = depth > 0 ? bbox.max.z + ad / 2 : bbox.min.z - ad / 2
    }

    const slabId   = nextId('slab')
    const resultId = nextId('ext')
    set({ busy: true })
    try {
      const t0 = performance.now()
      const slabT: TransformNR = { x: slabX, y: slabY, z: slabZ, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
      const slabP: ShapeParams = { width: slabW, height: slabH, depth: slabD }
      await workerBuildShape(slabId, 'cube', slabP, slabT)
      const resultMesh = await workerCsgBoolean(id, slabId, 'union', resultId)
      const ms = performance.now() - t0
      const { cx: ex, cy: ey, cz: ez } = extractAndCenter(resultMesh.vertices)
      const newObj: SceneObject = makeObject({ id: resultId, shapeType: 'cube', params: {}, color: obj.color, transform: { x:ex,y:ey,z:ez,rotX:0,rotY:0,rotZ:0,scaleX:1,scaleY:1,scaleZ:1 }, visible: true, locked: false, vertices: resultMesh.vertices, indices: resultMesh.indices, normals: resultMesh.normals })
      const addOp: AddShapeOperation = { type: 'add_shape', id: slabId, shapeType: 'cube', params: slabP, color: obj.color, transform: slabT }
      const grpOp: TinkerCraftOperation = { type: 'group', ids: [id, slabId], isHull: false, isIntersect: false, resultId } as TinkerCraftOperation
      const newObjects = { ...objects }; delete newObjects[id]; newObjects[resultId] = newObj
      const newOps = [...operations.slice(0, historyIndex), addOp, grpOp]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [resultId], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshot(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('extrudeSelected:', e) }
  },

  // ── Rename ──
  renameObject: (id, name) => {
    const { objects } = get()
    if (!objects[id]) return
    const op: TinkerCraftOperation = { type: 'rename', id, name } as TinkerCraftOperation
    const { operations, historyIndex } = get()
    const newOps = [...operations.slice(0, historyIndex), op]
    const newObjects = { ...objects, [id]: { ...objects[id], name } }
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshot(newOps.length, newObjects)
  },

  // ── Autosave ──
  triggerAutosave: async () => {
    const { operations, historyIndex, fileName } = get()
    await autosaveSession(operations.slice(0, historyIndex), historyIndex, fileName)
  },

  restoreAutosave: async () => {
    const entry = await restoreSession()
    if (!entry || entry.operations.length === 0) return false
    await workerClearAll()
    clearSnapshots()
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(entry.operations)
      set({ operations: entry.operations, historyIndex: entry.historyIndex, objects: newObjects, selectedIds: [], fileName: entry.fileName, modified: false, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshot(entry.historyIndex, newObjects)
      return true
    } catch (e) { set({ busy: false }); return false }
  },

  // ── Project Manager ──
  saveToProject: async (name) => {
    const { operations, historyIndex, objects, currentProjectId } = get()
    const ops = operations.slice(0, historyIndex)
    const count = Object.keys(objects).length
    if (currentProjectId) {
      await pmUpdate(currentProjectId, name, ops, count)
    } else {
      const meta = await pmSave(name, ops, count)
      set({ currentProjectId: meta.id })
    }
  },

  loadFromProject: async (id) => {
    const record = await pmLoad(id)
    if (!record) return
    await workerClearAll()
    clearSnapshots()
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(record.operations)
      set({ operations: record.operations, historyIndex: record.operations.length, objects: newObjects, selectedIds: [], fileName: null, modified: false, busy: false, lastCsgMs: performance.now() - t0, currentProjectId: id })
      cacheSnapshot(record.operations.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('loadFromProject:', e) }
  },
}))
