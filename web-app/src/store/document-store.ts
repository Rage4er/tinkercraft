// ============================================================
// Zustand store — TinkerCraftDocument с полным undo/redo
// ============================================================

import { create } from 'zustand/react'
import type {
  TinkerCraftOperation, AddShapeOperation, ImportMeshOperation,
  FilletOperation, MirrorOperation, AlignOperation, ResizeDimsOperation,
  SceneObject, ShapeType, ShapeParams, TransformNR, CsgBooleanOp, Vec3,
} from '../csg/types'
import {
  workerBuildShape, workerCsgBoolean, workerRebuildScene,
  workerClearAll, workerDeleteObjects, workerMirrorObject,
  workerApplyFillet, workerBuildImportedMesh,
} from '../csg/worker-client'
import { parseDoodle, serializeDoodle, openDoodleFilePicker, downloadBlob } from '../io/doodle-io'
import { saveProject as pmSave, updateProject as pmUpdate, loadProject as pmLoad } from '../io/project-manager'
import { downloadStl } from '../io/stl-export'
import { openStlFilePicker, parseStlFile } from '../io/stl-import'
import { autosaveSession, restoreSession } from '../io/autosave'

// ---- ID генератор ----
let _idCounter = 0
function nextId(prefix = 'obj'): string { return `${prefix}_${++_idCounter}` }

// ---- Цвета ----
const PALETTE = [
  '#89b4fa','#a6e3a1','#f9e2af','#cba6f7',
  '#f38ba8','#94e2d5','#fab387','#74c7ec',
]
function colorForIndex(n: number): string { return PALETTE[n % PALETTE.length] }

// ---- AABB ----
function computeAABB(vertices: Float32Array) {
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

// ---- Clipboard entry ----
interface ClipEntry {
  shapeType: ShapeType
  params: ShapeParams
  color: string
  transform: TransformNR
  // For import_mesh:
  importVertices?: number[]
  importIndices?: number[]
}

// ---- Типы store ----
export interface DocumentStore {
  operations:   TinkerCraftOperation[]
  historyIndex: number
  objects:      Record<string, SceneObject>
  selectedIds:  string[]
  clipboard:    ClipEntry[]
  fileName:     null | string
  modified:     boolean
  busy:         boolean
  lastCsgMs:    null | number

  currentProjectId: string | null

  // Actions
  addShape:        (shapeType: ShapeType, params?: ShapeParams) => Promise<void>
  importStl:       () => Promise<void>
  deleteSelected:  () => Promise<void>
  selectObjects:   (ids: string[], add: boolean) => void
  clearSelection:  () => void
  csgBoolean:      (op: CsgBooleanOp) => Promise<void>
  moveObject:      (id: string, transform: TransformNR) => Promise<void>
  resizeObject:    (id: string, params: ShapeParams) => Promise<void>
  extrudeSelected: (axis: 'X'|'Y'|'Z', depth: number) => Promise<void>
  renameObject:    (id: string, name: string) => void
  setColor:        (id: string, color: string) => void
  toggleVisible:   (id: string) => void
  mirrorSelected:  (plane: 'XY' | 'XZ' | 'YZ') => Promise<void>
  alignSelected:   (axis: 'X' | 'Y' | 'Z', anchor: 'min' | 'center' | 'max') => Promise<void>
  applyFillet:     (id: string, radius: number) => Promise<void>
  copySelected:    () => void
  pasteClipboard:  () => Promise<void>
  undo:            () => Promise<void>
  redo:            () => Promise<void>
  jumpToHistory:   (index: number) => Promise<void>
  clearScene:      () => Promise<void>
  openDoodle:      () => Promise<void>
  saveDoodle:      () => Promise<void>
  exportStl:       () => void
  triggerAutosave: () => Promise<void>
  restoreAutosave: () => Promise<boolean>
  saveToProject:   (name: string) => Promise<void>
  loadFromProject: (id: string) => Promise<void>
}

// ---- Rebuild helper ----

async function rebuildFromHistory(ops: TinkerCraftOperation[]): Promise<Record<string, SceneObject>> {
  const result = await workerRebuildScene(ops)

  const meta: Record<string, { color: string; shapeType: ShapeType; params: ShapeParams; transform: TransformNR }> = {}
  const transforms: Record<string, TransformNR> = {}

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
      }
    }
  }

  const objects: Record<string, SceneObject> = {}
  for (const m of result.results) {
    const info = meta[m.objId]
    objects[m.objId] = {
      id:        m.objId,
      shapeType: info?.shapeType ?? 'cube',
      params:    info?.params    ?? {},
      color:     info?.color     ?? '#89b4fa',
      transform: info?.transform ?? { x:0,y:0,z:0,rotX:0,rotY:0,rotZ:0,scaleX:1,scaleY:1,scaleZ:1 },
      visible:   true,
      locked:    false,
      vertices:  m.vertices,
      indices:   m.indices,
    }
  }
  return objects
}

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
    const defaultParams: ShapeParams = shapeType === 'sphere' || shapeType === 'cone'
      ? { radius: 12, height: 24 }
      : { width: 20, height: 20, depth: 20 }
    const finalParams = params ?? defaultParams
    const op: AddShapeOperation = { type: 'add_shape', id, shapeType, params: finalParams, color, transform }
    set({ busy: true })
    try {
      const t0   = performance.now()
      const mesh = await workerBuildShape(id, shapeType, finalParams, transform)
      const ms   = performance.now() - t0
      const obj: SceneObject = { id, shapeType, params: finalParams, color, transform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices }
      const newOps = [...operations.slice(0, historyIndex), op]
      set({ operations: newOps, historyIndex: newOps.length, objects: { ...objects, [id]: obj }, modified: true, busy: false, lastCsgMs: ms })
    } catch (e) { set({ busy: false }); console.error('addShape:', e) }
  },

  // ── Импорт STL ──
  importStl: async () => {
    const file = await openStlFilePicker()
    if (!file) return
    const mesh = await parseStlFile(file)
    if (!mesh) { alert('Не удалось прочитать STL файл'); return }

    const { objects, operations, historyIndex } = get()
    const id    = nextId('stl')
    const color = colorForIndex(Object.keys(objects).length)
    set({ busy: true })
    try {
      const t0     = performance.now()
      const result = await workerBuildImportedMesh(id, mesh.vertices, mesh.indices)
      const ms     = performance.now() - t0

      const obj: SceneObject = { id, shapeType: 'import_mesh', params: {}, color, transform: mesh.transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices }
      const op: ImportMeshOperation = { type: 'import_mesh', id, name: mesh.name, color, transform: mesh.transform, vertices: mesh.vertices, indices: mesh.indices }
      const newOps = [...operations.slice(0, historyIndex), op]
      set({ operations: newOps, historyIndex: newOps.length, objects: { ...objects, [id]: obj }, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
    } catch (e) { set({ busy: false }); alert(`Ошибка импорта STL:\n${e}`) }
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
      set({
        operations: newOps,
        historyIndex: newOps.length,
        objects: { ...objects, [id]: { ...obj, params: { ...obj.params, filletRadius: radius }, vertices: mesh.vertices, indices: mesh.indices } },
        modified: true,
        busy: false,
        lastCsgMs: ms,
      })
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
          const obj: SceneObject = { id, shapeType: 'import_mesh', params: {}, color: clip.color, transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices }
          const op: ImportMeshOperation = { type: 'import_mesh', id, name: 'pasted', color: clip.color, transform, vertices: clip.importVertices, indices: clip.importIndices }
          newObjects = { ...newObjects, [id]: obj }
          newOps.push(op)
        } else {
          const mesh = await workerBuildShape(id, clip.shapeType, clip.params, transform)
          const obj: SceneObject = { id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices }
          const op: AddShapeOperation = { type: 'add_shape', id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform }
          newObjects = { ...newObjects, [id]: obj }
          newOps.push(op)
        }
        pastedIds.push(id)
      }

      const ms = performance.now() - t0
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: pastedIds, modified: true, busy: false, lastCsgMs: ms })
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
      const mesh = await workerCsgBoolean(idA, idB, op, resultId)
      const ms   = performance.now() - t0
      const newObj: SceneObject = { id: resultId, shapeType: 'cube', params: {}, color: objects[idA].color, transform: { x:0,y:0,z:0,rotX:0,rotY:0,rotZ:0,scaleX:1,scaleY:1,scaleZ:1 }, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices }
      const newObjects = { ...objects }; delete newObjects[idA]; delete newObjects[idB]; newObjects[resultId] = newObj
      const histOp: TinkerCraftOperation = { type: 'group', ids: [idA, idB], isHull: false, isIntersect: op === 'intersect', subtractOp: op === 'subtract', resultId } as TinkerCraftOperation
      const newOps = [...operations.slice(0, historyIndex), histOp]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [resultId], modified: true, busy: false, lastCsgMs: ms })
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
    const op: TinkerCraftOperation = { type: 'move', ids: [id], delta, rotDelta, scaleDelta }
    const newOps = [...operations.slice(0, historyIndex), op]
    set({ operations: newOps, historyIndex: newOps.length, objects: { ...objects, [id]: { ...obj, transform } }, modified: true })
  },

  // ── Color ──
  setColor: (id, color) => {
    const { objects, operations, historyIndex } = get()
    if (!objects[id]) return
    const op: TinkerCraftOperation = { type: 'color', ids: [id], color }
    const newOps = [...operations.slice(0, historyIndex), op]
    set({ operations: newOps, historyIndex: newOps.length, objects: { ...objects, [id]: { ...objects[id], color } }, modified: true })
  },

  // ── Visibility ──
  toggleVisible: (id) => {
    const { objects, operations, historyIndex } = get()
    if (!objects[id]) return
    const newVis = !objects[id].visible
    const op: TinkerCraftOperation = { type: 'visibility', ids: [id], visible: newVis }
    const newOps = [...operations.slice(0, historyIndex), op]
    set({ operations: newOps, historyIndex: newOps.length, objects: { ...objects, [id]: { ...objects[id], visible: newVis } }, modified: true })
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
        newObjects[id] = { ...obj, transform: t, vertices: mesh.vertices, indices: mesh.indices }
      }
      const op: MirrorOperation = { type: 'mirror', ids, plane }
      const newOps = [...operations.slice(0, historyIndex), op]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: performance.now() - t0 })
    } catch (e) { set({ busy: false }); console.error('mirrorSelected:', e) }
  },

  // ── Align ──
  alignSelected: async (axis, anchor) => {
    const { selectedIds, objects, operations, historyIndex } = get()
    const ids = selectedIds.filter(id => objects[id])
    if (ids.length < 2) return
    const ax = axis.toLowerCase() as 'x' | 'y' | 'z'
    const bboxes = ids.map(id => ({ id, bbox: computeAABB(objects[id].vertices) }))
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
        newObjects[id] = { ...obj, transform: nt, vertices: mesh.vertices, indices: mesh.indices }
      }
      const op: AlignOperation & { deltas: Record<string, number> } = { type: 'align', ids, axis, anchor, deltas }
      const newOps = [...operations.slice(0, historyIndex), op as unknown as TinkerCraftOperation]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: performance.now() - t0 })
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
      const newObjects = await rebuildFromHistory(operations.slice(0, newIdx))
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
      const newObjects = await rebuildFromHistory(operations.slice(0, newIdx))
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
      const newObjects = await rebuildFromHistory(operations.slice(0, newIdx))
      set({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: performance.now() - t0 })
    } catch (e) { set({ busy: false }); console.error('jumpToHistory:', e) }
  },

  // ── Clear ──
  clearScene: async () => {
    await workerClearAll()
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
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(doc.operations)
      set({ operations: doc.operations, historyIndex: doc.operations.length, objects: newObjects, selectedIds: [], fileName: picked.file.name, modified: false, busy: false, lastCsgMs: performance.now() - t0 })
    } catch (e) { set({ busy: false }); alert(`Ошибка открытия:\n${e}`) }
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
      set({ operations: newOps, historyIndex: newOps.length, objects: { ...objects, [id]: { ...obj, params: mergedParams, vertices: mesh.vertices, indices: mesh.indices } }, modified: true, busy: false, lastCsgMs: ms })
    } catch (e) { set({ busy: false }); console.error('resizeObject:', e) }
  },

  // ── Extrude ──
  extrudeSelected: async (axis, depth) => {
    const { selectedIds, objects, operations, historyIndex } = get()
    if (selectedIds.length !== 1) return
    const id  = selectedIds[0]
    const obj = objects[id]
    if (!obj) return

    const bbox = computeAABB(obj.vertices)
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
      const newObj: SceneObject = { id: resultId, shapeType: 'cube', params: {}, color: obj.color, transform: { x:0,y:0,z:0,rotX:0,rotY:0,rotZ:0,scaleX:1,scaleY:1,scaleZ:1 }, visible: true, locked: false, vertices: resultMesh.vertices, indices: resultMesh.indices }
      const addOp: AddShapeOperation = { type: 'add_shape', id: slabId, shapeType: 'cube', params: slabP, color: obj.color, transform: slabT }
      const grpOp: TinkerCraftOperation = { type: 'group', ids: [id, slabId], isHull: false, isIntersect: false, resultId } as TinkerCraftOperation
      const newObjects = { ...objects }; delete newObjects[id]; newObjects[resultId] = newObj
      const newOps = [...operations.slice(0, historyIndex), addOp, grpOp]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [resultId], modified: true, busy: false, lastCsgMs: ms })
    } catch (e) { set({ busy: false }); console.error('extrudeSelected:', e) }
  },

  // ── Rename ──
  renameObject: (id, name) => {
    const { objects } = get()
    if (!objects[id]) return
    const op: TinkerCraftOperation = { type: 'rename', id, name } as TinkerCraftOperation
    const { operations, historyIndex } = get()
    const newOps = [...operations.slice(0, historyIndex), op]
    set({ operations: newOps, historyIndex: newOps.length, objects: { ...objects, [id]: { ...objects[id], name } }, modified: true })
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
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(entry.operations)
      set({ operations: entry.operations, historyIndex: entry.historyIndex, objects: newObjects, selectedIds: [], fileName: entry.fileName, modified: false, busy: false, lastCsgMs: performance.now() - t0 })
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
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(record.operations)
      set({ operations: record.operations, historyIndex: record.operations.length, objects: newObjects, selectedIds: [], fileName: null, modified: false, busy: false, lastCsgMs: performance.now() - t0, currentProjectId: id })
    } catch (e) { set({ busy: false }); console.error('loadFromProject:', e) }
  },
}))
