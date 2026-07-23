// ============================================================
// Zustand store — TinkerCraftDocument с полным undo/redo
// ============================================================
//
// Utilities (computeAABB, extractAndCenter, makeObject, nextId, colorForIndex)
// moved to ./helpers.ts
// DocumentStore interface — in ./types.ts
// rebuildFromHistory — in ./rebuild.ts
// Re-export computeAABB and extractAndCenter — for unit tests.

import { create } from 'zustand/react'
import type {
  TinkerCraftOperation, AddShapeOperation, ImportMeshOperation,
  FilletOperation, MirrorOperation, AlignOperation, ResizeDimsOperation,
  MoveOperation, ColorOperation, GroupOperation, RenameOperation, HideShowOperation,
  DeleteOperation,
  SceneObject, ShapeParams, TransformNR, Vec3,
  TreeNode,
} from '../csg/types'
import {
  workerBuildShape, workerCsgBoolean, workerCsgBooleanWithSync,
  workerBuildImportedMesh, workerApplyFillet,
  workerMirrorObject, workerRebuildScene,
  workerDeleteObjects, workerClearAll, workerSyncObjects, workerSyncMesh,
} from '../csg/worker-client'
import { parseDoodle, serializeDoodle, openDoodleFilePicker, downloadBlob } from '../io/doodle-io'
import { notify } from './notifications'
import { saveProject as pmSave, updateProject as pmUpdate, loadProject as pmLoad } from '../io/project-manager'
import { downloadStl } from '../io/stl-export'
import { openStlFilePicker, parseStlFile } from '../io/stl-import'
import { autosaveSession, restoreSession } from '../io/autosave'

// Re-export for backward compatibility (unit tests import from here)
export { computeAABB, extractAndCenter, extractAndCenterGetAABB } from './helpers'
import { computeAABB, extractAndCenter, extractAndCenterGetAABB, makeObject, nextId, colorForIndex } from './helpers'
import type { ClipEntry } from './helpers'
import type { DocumentStore } from './types'
import { rebuildFromHistory } from './rebuild'
import { cacheSnapshot, getCachedSnapshot, clearSnapshots, cacheTreeSnapshot, getCachedTreeSnapshot } from './snapshots'
import { OBJECT_SPACING, PASTE_OFFSET, MOVE_DELTA_EPSILON } from '../constants'
import {
  createPrimitiveNode,
  createBooleanNode,
  createBakedNode,
  mirrorTreeNode,
  cloneSubtree,
  rebuildNode,
  computeNodeBBox,
  bboxCenter,
  getNode,
  deleteNode,
  clearTree,
  moveTreeNode,
} from '../csg/history-tree'
import { getAllNodes } from '../csg/history-tree'

// ── Tree snapshot helpers ──

/** Restore build tree from cached snapshot */
function restoreTreeFromSnapshot(index: number): void {
  const treeSnap = getCachedTreeSnapshot(index)
  if (!treeSnap) return

  clearTree()
  for (const nd of treeSnap.nodes) {
    if (nd.type === 'primitive' && nd.shapeType && nd.params) {
      createPrimitiveNode(nd.id, nd.shapeType as any, nd.params, nd.localTransform!)
    } else if (nd.type === 'baked') {
      const verts = nd.vertices ? new Float32Array(nd.vertices) : undefined
      const idxs = nd.indices ? new Uint32Array(nd.indices) : undefined
      const nrm = nd.normals ? new Float32Array(nd.normals) : null
      createBakedNode(nd.id, verts!, idxs!, nrm, nd.localTransform!)
    } else if (nd.type === 'boolean' && nd.operation && nd.children) {
      createBooleanNode(nd.id, nd.operation, nd.children[0], nd.children[1])
    }
  }
}

/**
 * Wrapper around cacheSnapshot that also caches the build tree.
 * Replace all cacheSnapshot calls with this.
 */
function cacheSnapshotWithTree(index: number, objects: Record<string, SceneObject>): void {
  cacheSnapshotWithTree(index, objects)
  // Cache tree nodes (only the structure, not cached mesh/BBox/hash)
  const treeNodesMap = new Map<string, TreeNode>()
  for (const n of getAllNodes()) {
    treeNodesMap.set(n.id, n)
  }
  cacheTreeSnapshot(index, treeNodesMap)
}

// ---- Store ----

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  operations: [],
  historyIndex: 0,
  objects: {},
  selectedIds: [],
  clipboard: [],
  fileName: null,
  modified: false,
  busy: false,
  lastCsgMs: null,
  currentProjectId: null,

  // ── Добавить фигуру ──
  addShape: async (shapeType, params) => {
    if (get().busy) return
    const { objects, operations, historyIndex } = get()
    const idx = Object.keys(objects).length
    const id = nextId('obj')
    const transform: TransformNR = { x: idx * OBJECT_SPACING, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const color = colorForIndex(idx)
    const defaultParams: ShapeParams =
      shapeType === 'sphere' ? { radius: 12, segments: 32 }
        : shapeType === 'cone' ? { radius: 10, height: 24, segments: 32 }
          : shapeType === 'torus' ? { torusRadius: 15, tubeRadius: 4, segments: 32, tubeSegments: 16 }
            : shapeType === 'prism' ? { radius: 12, height: 20, sides: 6 }
              : shapeType === 'pyramid' ? { radius: 12, height: 20, sides: 4 }
                : { width: 20, height: 20, depth: 20 }
    const finalParams = params ?? defaultParams
    const op: AddShapeOperation = { type: 'add_shape', id, shapeType, params: finalParams, color, transform }
    set({ busy: true })
    try {
      const t0 = performance.now()
      const mesh = await workerBuildShape(id, shapeType, finalParams, transform)
      const ms = performance.now() - t0
      const obj: SceneObject = makeObject({ id, shapeType, params: finalParams, color, transform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      // Register in build tree
      createPrimitiveNode(id, shapeType, finalParams, transform)
    } catch (e) { set({ busy: false }); console.error('addShape:', e) }
  },

  // ── Добавить произвольный меш (текст, и т.д.) ──
  addRawMesh: async (name, vertices, indices) => {
    if (get().busy) return
    const { objects, operations, historyIndex } = get()
    const id = nextId('txt')
    const color = colorForIndex(Object.keys(objects).length)
    const transform: TransformNR = { x: Object.keys(objects).length * OBJECT_SPACING, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    set({ busy: true })
    try {
      const t0 = performance.now()
      const result = await workerBuildImportedMesh(id, vertices, indices)
      const ms = performance.now() - t0
      const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color, transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices, normals: result.normals })
      const op: ImportMeshOperation = { type: 'import_mesh', id, name, color, transform, vertices, indices }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      // Register baked node in build tree
      createBakedNode(id, result.vertices, result.indices, result.normals, transform)
    } catch (e) { set({ busy: false }); console.error('addRawMesh:', e) }
  },

  // ── Импорт STL ──
  importStl: async () => {
    if (get().busy) return
    const file = await openStlFilePicker()
    if (!file) return
    const mesh = await parseStlFile(file)
    if (!mesh) { notify('Не удалось прочитать STL файл', 'error'); return }

    const { objects, operations, historyIndex } = get()
    const id = nextId('stl')
    const color = colorForIndex(Object.keys(objects).length)
    set({ busy: true })
    try {
      const t0 = performance.now()
      const result = await workerBuildImportedMesh(id, mesh.vertices, mesh.indices)
      const ms = performance.now() - t0

      // BUG-R8-1: Передаём normals в makeObject для корректного рендеринга
      const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color, transform: mesh.transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices, normals: result.normals })
      const op: ImportMeshOperation = { type: 'import_mesh', id, name: mesh.name, color, transform: mesh.transform, vertices: mesh.vertices, indices: mesh.indices }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      // Register baked node in build tree
      createBakedNode(id, result.vertices, result.indices, result.normals, mesh.transform)
    } catch (e) { set({ busy: false }); notify(`Ошибка импорта STL: ${e}`, 'error') }
  },

  // ── Fillet ──
  applyFillet: async (id, radius) => {
    if (get().busy) return
    const { objects, operations, historyIndex } = get()
    const obj = objects[id]
    if (!obj) return
    set({ busy: true })
    try {
      const t0 = performance.now()
      const mesh = await workerApplyFillet(id, obj.shapeType, obj.params, radius, obj.transform)
      const ms = performance.now() - t0
      const op: FilletOperation = { type: 'fillet', id, radius }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObj = makeObject({
        ...obj,
        params: { ...obj.params, filletRadius: radius },
        vertices: mesh.vertices,
        indices: mesh.indices,
        normals: mesh.normals,
      })
      const newObjects = { ...objects, [id]: newObj }
      set({
        operations: newOps,
        historyIndex: newOps.length,
        objects: newObjects,
        modified: true,
        busy: false,
        lastCsgMs: ms,
      })
      cacheSnapshotWithTree(newOps.length, newObjects)
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
        // PERF-R8-1: Храним TypedArray вместо number[] для экономии памяти (8×)
        entry.importVertices = new Float32Array(obj.vertices)
        entry.importIndices = new Uint32Array(obj.indices)
      }
      return [entry]
    })
    if (clips.length > 0) set({ clipboard: clips })
  },

  // ── Paste ──
  pasteClipboard: async () => {
    if (get().busy) return
    const { clipboard, objects, operations, historyIndex } = get()
    if (clipboard.length === 0) return
    set({ busy: true })
    const pastedIds: string[] = []
    try {
      const t0 = performance.now()
      let newObjects = { ...objects }
      const newOps = [...operations.slice(0, historyIndex)]

      for (const clip of clipboard) {
        const id = nextId('obj')
        const transform: TransformNR = { ...clip.transform, x: clip.transform.x + PASTE_OFFSET, y: clip.transform.y + 0, z: clip.transform.z + PASTE_OFFSET }

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
      cacheSnapshotWithTree(newOps.length, newObjects)
    } catch (e) {
      set({ busy: false })
      // Clean up partially created objects from worker cache
      if (pastedIds.length > 0) {
        workerDeleteObjects(pastedIds).catch(() => { })
      }
      console.error('paste:', e)
    }
  },

  // ── Delete ──
  deleteSelected: async () => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    const ids = selectedIds.filter(id => objects[id])
    if (ids.length === 0) return
    const op: DeleteOperation = { type: 'delete', ids }
    const newObjects = { ...objects }
    for (const id of ids) {
      delete newObjects[id]
      // Remove from build tree
      deleteNode(id)
    }
    try {
      await workerDeleteObjects(ids)
    } catch (e) {
      console.error('deleteSelected:', e)
      notify('Ошибка удаления объектов', 'error')
      return // do not update store if worker is out of sync
    }
    const newOps = [...operations.slice(0, historyIndex), op]
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [], modified: true })
    cacheSnapshotWithTree(newOps.length, newObjects)
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
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    if (selectedIds.length !== 2) return
    const [idA, idB] = selectedIds
    if (!objects[idA] || !objects[idB]) return
    const resultId = nextId('csg')
    set({ busy: true })
    try {
      const t0 = performance.now()
      // FIX (CRIT-CSG-2): Sync operands that can't be rebuilt from shapeType/params
      // (CSG results with shapeType='cube', params={} and imported meshes) into
      // worker cache using their actual mesh data + transform. After this,
      // workerCsgBooleanWithSync will skip rebuilding these operands (cache.has
      // check in handleCsgBooleanSync) and use the synced mesh with correct
      // position/rotation/scale.
      const syncOperand = async (id: string) => {
        const obj = objects[id]
        if (!obj) return
        // For CSG results (shapeType='cube' with no params) and imported meshes,
        // sync the actual mesh data + transform. Regular primitives will be synced by
        // workerCsgBooleanWithSync via buildTransformMatrix.
        if (obj.shapeType === 'cube' && !obj.params.width) {
          await workerSyncMesh(id, obj.vertices, obj.indices, obj.transform).catch(() => {})
        } else if (obj.shapeType === 'import_mesh') {
          await workerSyncMesh(id, obj.vertices, obj.indices, obj.transform).catch(() => {})
        }
      }
      await syncOperand(idA)
      await syncOperand(idB)
      // Now perform CSG — workerCsgBooleanWithSync will:
      // - skip operands already in cache (CSG results, imported meshes synced above)
      // - rebuild regular primitives from shapeType/params via buildTransformMatrix
      const srOf = (id: string) => {
        const t = objects[id].transform
        return { x: t.x, y: t.y, z: t.z, rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ, scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ }
      }
      const mesh = await workerCsgBooleanWithSync(
        idA, idB, op, resultId, srOf(idA), srOf(idB),
        { shapeType: objects[idA].shapeType, params: objects[idA].params },
        { shapeType: objects[idB].shapeType, params: objects[idB].params },
      )
      const ms = performance.now() - t0
      // Single-pass: center geometry at origin + compute AABB (PERF-R6-1)
      const { cx, cy, cz, aabb } = extractAndCenterGetAABB(mesh.vertices)
      // Store original bbox size for CSG results — used to compute scale relative to original dimensions
      const originalBboxSize = { x: aabb.max.x - aabb.min.x, y: aabb.max.y - aabb.min.y, z: aabb.max.z - aabb.min.z }
      const newObj: SceneObject = { id: resultId, shapeType: 'cube', params: {}, color: objects[idA].color, transform: { x: cx, y: cy, z: cz, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals, aabb, originalBboxSize }
      const newObjects = { ...objects }; delete newObjects[idA]; delete newObjects[idB]; newObjects[resultId] = newObj
      // FIX (CRIT-CSG-2): Store result vertices/indices AND center position
      // in GroupOperation so rebuildFromHistory can reconstruct the CSG result
      // geometry at the correct position.
      const histOp: GroupOperation = { type: 'group', ids: [idA, idB], isHull: false, isIntersect: op === 'intersect', subtractOp: op === 'subtract', resultId, resultVertices: mesh.vertices, resultIndices: mesh.indices, resultNormals: mesh.normals ?? undefined, resultCenter: { x: cx, y: cy, z: cz }, originalBboxSize: originalBboxSize, treeOperation: op as 'union' | 'subtract' | 'intersect' }
      const newOps = [...operations.slice(0, historyIndex), histOp]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [resultId], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      // Register boolean node in build tree
      createBooleanNode(resultId, op as 'union' | 'subtract' | 'intersect', idA, idB)
      // Rebuild tree node to cache the mesh in history-tree
      rebuildNode(resultId).catch(e => console.error('[csgBoolean] rebuildNode failed:', e))
    } catch (e) { set({ busy: false }); console.error('csgBoolean:', e) }
  },

  // ── Move ──
  moveObject: async (id, transform) => {
    if (get().busy) return
    const { objects, operations, historyIndex } = get()
    const obj = objects[id]
    if (!obj) return
    const delta: Vec3 = { x: transform.x - obj.transform.x, y: transform.y - obj.transform.y, z: transform.z - obj.transform.z }
    const rotDelta: Vec3 = { x: transform.rotX - obj.transform.rotX, y: transform.rotY - obj.transform.rotY, z: transform.rotZ - obj.transform.rotZ }
    const scaleDelta: Vec3 = { x: transform.scaleX - obj.transform.scaleX, y: transform.scaleY - obj.transform.scaleY, z: transform.scaleZ - obj.transform.scaleZ }
    const hasPos = delta.x !== 0 || delta.y !== 0 || delta.z !== 0
    const hasRot = rotDelta.x !== 0 || rotDelta.y !== 0 || rotDelta.z !== 0
    const hasScale = scaleDelta.x !== 0 || scaleDelta.y !== 0 || scaleDelta.z !== 0
    const kind = hasScale && !hasPos && !hasRot ? 'scale' : hasRot && !hasPos && !hasScale ? 'rotate' : 'translate'
    const op: MoveOperation = { type: 'move', ids: [id], delta, rotDelta, scaleDelta, kind }
    const newOps = [...operations.slice(0, historyIndex), op]
    const newObjects = { ...objects, [id]: { ...obj, transform } }
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshotWithTree(newOps.length, newObjects)
    // BuildTree: move the node in the tree (updates localTransform on all primitives in subtree)
    moveTreeNode(id, { x: delta.x, y: delta.y, z: delta.z })
    // Sync worker cache so subsequent CSG/mirror operations use correct position (WARN-R6-2)
    // FIX (CRIT-CSG-3): For CSG results (shapeType='cube' with no params) and imported meshes,
    // use workerSyncMesh to preserve actual geometry. workerSyncObjects rebuilds from shapeType/params
    // which loses all CSG geometry (shapeType='cube', params={} → default cube).
    if (obj.shapeType === 'cube' && !obj.params.width) {
      // CSG result — sync actual mesh data
      workerSyncMesh(id, obj.vertices, obj.indices, { x: transform.x, y: transform.y, z: transform.z, rotX: transform.rotX, rotY: transform.rotY, rotZ: transform.rotZ, scaleX: transform.scaleX, scaleY: transform.scaleY, scaleZ: transform.scaleZ }).catch(e => console.error('moveObject syncMesh:', e))
    } else if (obj.shapeType === 'import_mesh') {
      // Imported mesh — sync actual mesh data
      workerSyncMesh(id, obj.vertices, obj.indices, { x: transform.x, y: transform.y, z: transform.z, rotX: transform.rotX, rotY: transform.rotY, rotZ: transform.rotZ, scaleX: transform.scaleX, scaleY: transform.scaleY, scaleZ: transform.scaleZ }).catch(e => console.error('moveObject syncMesh:', e))
    } else {
      // Regular primitive — sync via shapeType/params (more efficient)
      workerSyncObjects([{
        objId: id,
        shapeType: obj.shapeType,
        params: obj.params,
        transform: { x: transform.x, y: transform.y, z: transform.z, rotX: transform.rotX, rotY: transform.rotY, rotZ: transform.rotZ, scaleX: transform.scaleX, scaleY: transform.scaleY, scaleZ: transform.scaleZ },
      }]).catch(e => console.error('moveObject sync:', e))
    }
  },

  // ── Color ──
  setColor: (id, color, skipHistory = false) => {
    const { objects, operations, historyIndex } = get()
    if (!objects[id]) return
    const newObjects = { ...objects, [id]: { ...objects[id], color } }
    if (skipHistory) {
      // Visual preview only — no history entry (used for draft color picker)
      set({ objects: newObjects })
    } else {
      const op: ColorOperation = { type: 'color', ids: [id], color }
      const newOps = [...operations.slice(0, historyIndex), op]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
      cacheSnapshotWithTree(newOps.length, newObjects)
    }
  },

  // ── Visibility ──
  toggleVisible: (id) => {
    const { objects, operations, historyIndex } = get()
    if (!objects[id]) return
    const newVis = !objects[id].visible
    const op: HideShowOperation = { type: 'visibility', ids: [id], visible: newVis }
    const newOps = [...operations.slice(0, historyIndex), op]
    const newObjects = { ...objects, [id]: { ...objects[id], visible: newVis } }
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshotWithTree(newOps.length, newObjects)
  },

  // ── Mirror ──
  mirrorSelected: async (plane) => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    const ids = selectedIds.filter(id => objects[id])
    if (ids.length === 0) return
    set({ busy: true })
    try {
      const t0 = performance.now()
      // Sync worker cache before mirror — fixes stale cache after undo/redo
      // FIX (CRIT-CSG-3): For CSG results and imported meshes, use workerSyncMesh.
      // Keep full transform (including rotation) — mirror will flip geometry relative to origin,
      // then pivot applies the mirrored rotation to the mirrored geometry.
      const syncOps = ids.map(async id => {
        const obj = objects[id]
        if (obj.shapeType === 'cube' && !obj.params.width || obj.shapeType === 'import_mesh') {
          // Sync with full transform — mirror will handle geometry + rotation
          await workerSyncMesh(id, obj.vertices, obj.indices, { x: obj.transform.x, y: obj.transform.y, z: obj.transform.z, rotX: obj.transform.rotX, rotY: obj.transform.rotY, rotZ: obj.transform.rotZ, scaleX: obj.transform.scaleX, scaleY: obj.transform.scaleY, scaleZ: obj.transform.scaleZ }).catch(() => {})
        } else {
          return { objId: id, shapeType: obj.shapeType, params: obj.params, transform: { x: obj.transform.x, y: obj.transform.y, z: obj.transform.z, rotX: obj.transform.rotX, rotY: obj.transform.rotY, rotZ: obj.transform.rotZ, scaleX: obj.transform.scaleX, scaleY: obj.transform.scaleY, scaleZ: obj.transform.scaleZ } as const }
        }
      })
      await Promise.all(syncOps)
      // Sync regular primitives via workerSyncObjects
      const regularEntries = ids.filter(id => objects[id] && objects[id].shapeType !== 'cube' || (objects[id] && objects[id].shapeType === 'cube' && objects[id].params.width))
      if (regularEntries.length > 0) {
        await workerSyncObjects(
          regularEntries.map(id => {
            const obj = objects[id]
            return {
              objId: obj.id,
              shapeType: obj.shapeType,
              params: obj.params,
              transform: { x: obj.transform.x, y: obj.transform.y, z: obj.transform.z, rotX: obj.transform.rotX, rotY: obj.transform.rotY, rotZ: obj.transform.rotZ, scaleX: obj.transform.scaleX, scaleY: obj.transform.scaleY, scaleZ: obj.transform.scaleZ } as const,
            }
          }),
        )
      }
      const newObjects = { ...objects }
      const newIds: string[] = []
      const originalIds: string[] = []
      
      for (const id of ids) {
        originalIds.push(id)
        const obj = objects[id]
        
        // BuildTree: clone subtree + mirror the clone
        // Check if node exists in tree (may not if created before BuildTree or via rebuildFromHistory)
        const treeExists = getNode(id) !== undefined
        let mirroredTransform = { ...obj.transform }
        
        if (treeExists) {
          try {
            const treeId = `mirror_${nextId()}`
            const treeClone = cloneSubtree(id, treeId)
            
            // Mirror the cloned subtree
            mirrorTreeNode(treeId, plane)
            
            // Extract mirrored transform from the tree clone's root primitive/baked node
            const clonedNode = getNode(treeId)
            if (clonedNode) {
              if (clonedNode.type === 'primitive' && clonedNode.localTransform) {
                mirroredTransform = { ...clonedNode.localTransform }
              } else if (clonedNode.type === 'baked' && clonedNode.localTransform) {
                mirroredTransform = { ...clonedNode.localTransform }
              } else if (clonedNode.type === 'boolean' && clonedNode.children) {
                // For boolean nodes, extract from the first child's local transform
                const firstChild = getNode(clonedNode.children[0])
                if (firstChild && firstChild.localTransform) {
                  mirroredTransform = { ...firstChild.localTransform }
                }
              }
            }
          } catch {
            // Tree clone failed — fall through to worker mirror
            mirroredTransform = { ...obj.transform }
          }
        }
        
        // Определяем, является ли объект примитивом
        const isPrimitive = obj.shapeType !== 'cube' || (obj.shapeType === 'cube' && obj.params.width)
        
        // Для примитивов передаем shapeType, params и transform
        const mesh = isPrimitive
          ? await workerMirrorObject(id, plane, obj.shapeType, obj.params as Record<string, number>, obj.transform)
          : await workerMirrorObject(id, plane, undefined, undefined, obj.transform)
        
        // Для примитивов используем applyMirrorToTransform (инвертируем позицию и соответствующие углы)
        if (isPrimitive) {
          // Временная реализация applyMirrorToTransform
          const t = { ...obj.transform }
          if (plane === 'YZ') { t.x = -t.x; t.rotX = -t.rotX }
          if (plane === 'XZ') { t.y = -t.y; t.rotY = -t.rotY }
          if (plane === 'XY') { t.z = -t.z; t.rotZ = -t.rotZ }
          
          // СОЗДАЕМ НОВЫЙ ОБЪЕКТ с уникальным ID
          const newId = nextId()
          const newObj = makeObject({
            ...obj,
            id: newId,
            transform: t,
            vertices: mesh.vertices,
            indices: mesh.indices,
            normals: mesh.normals
          })
          newObjects[newId] = newObj
          newIds.push(newId)
          // ✅ РЕГИСТРИРУЕМ в дереве — чтобы следующее зеркало нашло ноду
          createPrimitiveNode(newId, obj.shapeType!, obj.params!, t)
        }
        // Для CSG / импорта сбрасываем scale и rotation, оставляем только зеркальную позицию
        else {
          const t = { ...obj.transform }
          t.scaleX = t.scaleY = t.scaleZ = 1
          t.rotX = t.rotY = t.rotZ = 0
          if (plane === 'YZ') t.x = -t.x
          if (plane === 'XZ') t.y = -t.y
          if (plane === 'XY') t.z = -t.z
          
          // СОЗДАЕМ НОВЫЙ ОБЪЕКТ с уникальным ID
          const newId = nextId()
          const newObj = makeObject({
            ...obj,
            id: newId,
            transform: t,
            vertices: mesh.vertices,
            indices: mesh.indices,
            normals: mesh.normals
          })
          newObjects[newId] = newObj
          newIds.push(newId)
          // ✅ РЕГИСТРИРУЕМ в дереве — fallback-копия должна быть доступна для следующего зеркала
          createBakedNode(newId, mesh.vertices, mesh.indices, mesh.normals, t)
        }
      }
      
      const op: MirrorOperation = { type: 'mirror', originalIds, ids: newIds, plane }
      const newOps = [...operations.slice(0, historyIndex), op]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshotWithTree(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('mirrorSelected:', e) }
  },

  // ── Align ──
  alignSelected: async (axis, anchor) => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    const ids = selectedIds.filter(id => objects[id])
    if (ids.length < 2) return
    const ax = axis.toLowerCase() as 'x' | 'y' | 'z'
    const bboxes = ids.map(id => ({ id, bbox: objects[id].aabb ?? computeAABB(objects[id].vertices) }))
    let targetValue: number
    switch (anchor) {
      case 'min': targetValue = Math.min(...bboxes.map(b => b.bbox.min[ax])); break
      case 'max': targetValue = Math.max(...bboxes.map(b => b.bbox.max[ax])); break
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
        // FIX (CRIT-CSG-3): For CSG results and imported meshes, sync via workerSyncMesh.
        // workerBuildShape with shapeType='cube', params={} → default cube.
        if (obj.shapeType === 'cube' && !obj.params.width || obj.shapeType === 'import_mesh') {
          await workerSyncMesh(id, obj.vertices, obj.indices, nt).catch(() => {})
          // Update the SceneObject with new transform (mesh geometry unchanged, only position shifted)
          newObjects[id] = { ...obj, transform: nt }
        } else {
          const mesh = await workerBuildShape(id, obj.shapeType, obj.params, nt)
          newObjects[id] = makeObject({ ...obj, transform: nt, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
        }
      }
      const op: AlignOperation & { deltas: Record<string, number> } = { type: 'align', ids, axis, anchor, deltas }
      const newOps = [...operations.slice(0, historyIndex), op]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshotWithTree(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('alignSelected:', e) }
  },

  // ── Undo ──
  undo: async () => {
    if (get().busy) return
    const { historyIndex, operations } = get()
    if (historyIndex === 0) return
    const newIdx = historyIndex - 1
    set({ busy: true })
    try {
      const t0 = performance.now()
      const cached = getCachedSnapshot(newIdx)
      const newObjects = cached ?? await rebuildFromHistory(operations.slice(0, newIdx))
      if (!cached) cacheSnapshotWithTree(newIdx, newObjects)
      // Restore build tree from snapshot
      restoreTreeFromSnapshot(newIdx)
      set({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: performance.now() - t0 })
    } catch (e) { set({ busy: false }); console.error('undo:', e) }
  },

  // ── Redo ──
  redo: async () => {
    if (get().busy) return
    const { historyIndex, operations } = get()
    if (historyIndex >= operations.length) return
    const newIdx = historyIndex + 1
    set({ busy: true })
    try {
      const t0 = performance.now()
      const cached = getCachedSnapshot(newIdx)
      const newObjects = cached ?? await rebuildFromHistory(operations.slice(0, newIdx))
      if (!cached) cacheSnapshotWithTree(newIdx, newObjects)
      // Restore build tree from snapshot
      restoreTreeFromSnapshot(newIdx)
      set({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: performance.now() - t0 })
    } catch (e) { set({ busy: false }); console.error('redo:', e) }
  },

  // ── Jump to history ──
  jumpToHistory: async (index) => {
    if (get().busy) return
    const { historyIndex, operations } = get()
    const newIdx = Math.max(0, Math.min(index, operations.length))
    if (newIdx === historyIndex) return
    set({ busy: true })
    try {
      const t0 = performance.now()
      const cached = getCachedSnapshot(newIdx)
      const newObjects = cached ?? await rebuildFromHistory(operations.slice(0, newIdx))
      if (!cached) cacheSnapshotWithTree(newIdx, newObjects)
      // Restore build tree from snapshot
      restoreTreeFromSnapshot(newIdx)
      set({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: performance.now() - t0 })
    } catch (e) { set({ busy: false }); console.error('jumpToHistory:', e) }
  },

  // ── Clear ──
  clearScene: async () => {
    if (get().busy) return
    await workerClearAll()
    clearSnapshots()
    clearTree()
    set({ operations: [], historyIndex: 0, objects: {}, selectedIds: [], modified: false, fileName: null, lastCsgMs: null })
  },

  // ── Open .doodle ──
  openDoodle: async () => {
    if (get().busy) return
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
      cacheSnapshotWithTree(doc.operations.length, newObjects)
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
    if (get().busy) return
    const { objects, operations, historyIndex } = get()
    const obj = objects[id]
    if (!obj || obj.shapeType === 'import_mesh') return
    // FIX (RESIZE-CSG): For CSG results (shapeType='cube' with no params),
    // use scale transformation instead of rebuilding from shapeType/params.
    // Rebuilding would lose CSG geometry (shapeType='cube', params={} → default cube).
    const isCsgResult = obj.shapeType === 'cube' && !obj.params.width
    if (!isCsgResult) {
      const mergedParams = { ...obj.params, ...params }
      set({ busy: true })
      try {
        const t0 = performance.now()
        const mesh = await workerBuildShape(id, obj.shapeType, mergedParams, obj.transform)
        const ms = performance.now() - t0
        const op: ResizeDimsOperation = { type: 'resize_dims', id, params: mergedParams }
        const newOps = [...operations.slice(0, historyIndex), op]
        const newObjects = { ...objects, [id]: makeObject({ ...obj, params: mergedParams, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals }) }
        set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: ms })
        cacheSnapshotWithTree(newOps.length, newObjects)
      } catch (e) { set({ busy: false }); console.error('resizeObject:', e) }
      return
    }

    // CSG result: set bbox dimensions directly without scale
    // FIX (RESIZE-CSG): Don't compute scale relative to originalBboxSize.
    // Instead, set the bbox dimensions directly in mm, resetting scale to 1.
    // The bbox dimensions shown in properties should be the real size in mm.
    const bbox = obj.aabb ?? computeAABB(obj.vertices)
    const currentSize = {
      x: bbox.max.x - bbox.min.x,
      y: bbox.max.y - bbox.min.y,
      z: bbox.max.z - bbox.min.z,
    }
    const targetWidth = params.width ?? currentSize.x
    const targetHeight = params.height ?? currentSize.y
    const targetDepth = params.depth ?? currentSize.z

    // Reset scale to 1 and set new bbox dimensions
    const newTransform = {
      ...obj.transform,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    }

    const op: ResizeDimsOperation = { type: 'resize_dims', id, params }
    const newOps = [...operations.slice(0, historyIndex), op]
    const newObjects = { ...objects, [id]: { ...obj, transform: newTransform, originalBboxSize: { x: targetWidth, y: targetHeight, z: targetDepth } } }
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshotWithTree(newOps.length, newObjects)

    // Sync worker cache with reset scale
    workerSyncMesh(id, obj.vertices, obj.indices, {
      x: newTransform.x, y: newTransform.y, z: newTransform.z,
      rotX: newTransform.rotX, rotY: newTransform.rotY, rotZ: newTransform.rotZ,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    }).catch(e => console.error('resizeObject syncMesh:', e))
  },

  // ── Extrude ──
  extrudeSelected: async (axis, depth) => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    if (selectedIds.length !== 1) return
    const id = selectedIds[0]
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

    const slabId = nextId('slab')
    const resultId = nextId('ext')
    set({ busy: true })
    try {
      const t0 = performance.now()
      const slabT: TransformNR = { x: slabX, y: slabY, z: slabZ, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
      const slabP: ShapeParams = { width: slabW, height: slabH, depth: slabD }
      await workerBuildShape(slabId, 'cube', slabP, slabT)
      const resultMesh = await workerCsgBoolean(id, slabId, 'union', resultId)
      const ms = performance.now() - t0
      // Single-pass: center geometry at origin + compute AABB (PERF-R6-1)
      const { cx: ex, cy: ey, cz: ez, aabb } = extractAndCenterGetAABB(resultMesh.vertices)
      const newObj: SceneObject = { id: resultId, shapeType: 'cube', params: {}, color: obj.color, transform: { x: ex, y: ey, z: ez, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }, visible: true, locked: false, vertices: resultMesh.vertices, indices: resultMesh.indices, normals: resultMesh.normals, aabb }
      const addOp: AddShapeOperation = { type: 'add_shape', id: slabId, shapeType: 'cube', params: slabP, color: obj.color, transform: slabT }
      const grpOp: GroupOperation = { type: 'group', ids: [id, slabId], isHull: false, isIntersect: false, resultId, resultVertices: resultMesh.vertices, resultIndices: resultMesh.indices, resultNormals: resultMesh.normals ?? undefined, resultCenter: { x: ex, y: ey, z: ez } }
      const newObjects = { ...objects }; delete newObjects[id]; newObjects[resultId] = newObj
      const newOps = [...operations.slice(0, historyIndex), addOp, grpOp]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [resultId], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('extrudeSelected:', e) }
  },

  // ── Rename ──
  renameObject: (id, name) => {
    const { objects } = get()
    if (!objects[id]) return
    if (objects[id].name === name) return // no change — skip history entry
    const op: RenameOperation = { type: 'rename', id, name }
    const { operations, historyIndex } = get()
    const newOps = [...operations.slice(0, historyIndex), op]
    const newObjects = { ...objects, [id]: { ...objects[id], name } }
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshotWithTree(newOps.length, newObjects)
  },

  // ── Autosave ──
  triggerAutosave: async () => {
    if (get().busy) return
    const { operations, historyIndex, fileName } = get()
    await autosaveSession(operations.slice(0, historyIndex), historyIndex, fileName)
  },

  // ── Restore autosave ──
  restoreAutosave: async () => {
    if (get().busy) return false
    const entry = await restoreSession()
    if (!entry || entry.operations.length === 0) return false
    await workerClearAll()
    clearSnapshots()
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(entry.operations)
      set({ operations: entry.operations, historyIndex: entry.historyIndex, objects: newObjects, selectedIds: [], fileName: entry.fileName, modified: false, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshotWithTree(entry.historyIndex, newObjects)
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
    // BUG-R8-2: Сбрасываем modified flag после успешного сохранения
    set({ modified: false })
  },

  loadFromProject: async (id) => {
    if (get().busy) return
    const record = await pmLoad(id)
    if (!record) return
    await workerClearAll()
    clearSnapshots()
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(record.operations)
      set({ operations: record.operations, historyIndex: record.operations.length, objects: newObjects, selectedIds: [], fileName: null, modified: false, busy: false, lastCsgMs: performance.now() - t0, currentProjectId: id })
      cacheSnapshotWithTree(record.operations.length, newObjects)
    } catch (e) { set({ busy: false }); console.error('loadFromProject:', e) }
  },
}))
