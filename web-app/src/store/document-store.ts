// ============================================================
// Zustand store — TinkerCraftDocument с полным undo/redo
// ============================================================
//
// Utilities (computeAABB, extractAndCenterInPlace, makeObject, nextId, colorForIndex)
// moved to ./helpers.ts
// DocumentStore interface — in ./types.ts
// rebuildFromHistory — in ./rebuild.ts
// Re-export computeAABB and extractAndCenterInPlace — for unit tests.

import { create } from 'zustand/react'
import type {
  TinkerCraftOperation, AddShapeOperation, ImportMeshOperation,
  Text3DOperation,
  FilletOperation, MirrorOperation, AlignOperation, ResizeDimsOperation,
  MoveOperation, ColorOperation, GroupOperation, RenameOperation, HideShowOperation,
  DeleteOperation,
  SceneObject, ShapeParams, ShapeType, TransformNR, Vec3,
  TreeNode,
} from '../csg/types'
import {
  workerBuildShape, workerCsgBoolean, workerCsgBooleanWithSync,
  workerBuildImportedMesh, workerApplyFillet,
  workerMirrorObject, workerRebuildScene,
  workerDeleteObjects, workerClearAll, workerSyncObjects, workerSyncMesh,
} from '../csg/worker-client'
import type { MeshResult } from '../csg/worker-handlers'
import { parseDoodle, serializeDoodle, openDoodleFilePicker, downloadBlob } from '../io/doodle-io'
import { notify } from './notifications'
import { saveProject as pmSave, updateProject as pmUpdate, loadProject as pmLoad, listProjects as pmList } from '../io/project-manager'
import { downloadStl } from '../io/stl-export'
import { openStlFilePicker, parseStlFile } from '../io/stl-import'
import { autosaveSession, restoreSession } from '../io/autosave'
import i18n from '../i18n'
import { useEconomyStore, createExportHash, scanForCashback } from './economy-store'

/** Обновить прогресс квестов V2 по состоянию сцены (после каждой мутации) */
function evaluateQuestsAfterMutation(objects: Record<string, SceneObject>, operations: TinkerCraftOperation[]): void {
  useEconomyStore.getState().evaluateQuests(objects, operations)
}

export { computeAABB, extractAndCenterInPlace, extractAndCenterGetAABB, computeWorldAABB } from './helpers'
import { computeAABB, extractAndCenterInPlace, extractAndCenterGetAABB, computeWorldAABB, makeObject, nextId, colorForIndex } from './helpers'
import type { ClipEntry } from './helpers'
import type { DocumentStore } from './types'
import { rebuildFromHistory, rebuildBuildTree } from './rebuild'
import { cacheSnapshot, getCachedSnapshot, clearSnapshots, cacheTreeSnapshot, getCachedTreeSnapshot } from './snapshots'
import { OBJECT_SPACING, PASTE_OFFSET } from '../constants'
import {
  createPrimitiveNode,
  createBooleanNode,
  createBakedNode,
  syncNodeTransform,
  applyNodeTransform,
  getNode,
  setNode,
  rebuildNode,
  computeNodeBBox,
  bboxCenter,
  deleteNode,
  clearTree,
  resetSubtreeTransform,
} from '../csg/history-tree'
import { getAllNodes } from '../csg/history-tree'
import { previewMirror as mirrorPreviewFn, mirrorSelected as mirrorConfirmFn, invalidateMirrorCache } from './mirror-store'
import { devLog, devWarn } from '../utils/debug'

// ── Shared undo/redo/jumpToHistory helper — FIX (MED-18-1): eliminates ~90 lines of duplication ──

/** Internal helper: rebuilds scene from history up to the given index. */
async function jumpToHistoryInner(newIdx: number, actionName: string): Promise<void> {
  const getState = useDocumentStore.getState
  const setState = useDocumentStore.setState
  setState({ busy: true })
  try {
    const t0 = performance.now()
    const cached = getCachedSnapshot(newIdx)
    const newObjects = cached ?? await rebuildFromHistory(getState().operations.slice(0, newIdx))
    // FIX (CYCLE-CSG-RELOAD): Always rebuild the build tree from operations.
    // The cached tree snapshot may be stale (saved before CYCLE-CSG fix),
    // missing boolean nodes that were skipped due to cycle errors.
    // Rebuild ensures the tree always matches the current operation history.
    rebuildBuildTree(getState().operations.slice(0, newIdx), newObjects)
    if (!cached) {
      cacheSnapshotWithTree(newIdx, newObjects)
    }
    setState({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: performance.now() - t0 })
    invalidateMirrorCache()
    // Y3.14: квесты по состоянию проекта
    evaluateQuestsAfterMutation(newObjects, getState().operations.slice(0, newIdx))
  } catch (e) { setState({ busy: false }); console.error(actionName + ':', e); notify(i18n.t('errors.operationFailed', { name: actionName.toLowerCase() }), 'error') }
}

// ── Type guard ──

function isShapeType(v: string): v is ShapeType {
  return ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'prism', 'pyramid', 'import_mesh', 'text3d'].includes(v)
}

// ── Tree snapshot helpers ──

/** Restore build tree from cached snapshot */
function restoreTreeFromSnapshot(index: number): void {
  const treeSnap = getCachedTreeSnapshot(index)
  if (!treeSnap) return

  clearTree()
  for (const nd of treeSnap.nodes) {
    if (nd.type === 'primitive' && nd.shapeType && nd.params && isShapeType(nd.shapeType)) {
      // FIX (MED-18-3): Use safe access instead of non-null assertions
      const lt = nd.localTransform
      if (lt) createPrimitiveNode(nd.id, nd.shapeType, nd.params, lt)
    } else if (nd.type === 'baked') {
      // FIX (MED-18-9): TypedArrays stored directly — no need for Array.from conversion
      const verts = nd.vertices ? new Float32Array(nd.vertices) : new Float32Array()
      const idxs = nd.indices ? new Uint32Array(nd.indices) : new Uint32Array()
      const nrm = nd.normals ? new Float32Array(nd.normals) : null
      const lt = nd.localTransform
      if (lt) createBakedNode(nd.id, verts, idxs, nrm, lt)
    } else if (nd.type === 'boolean' && nd.operation && nd.children) {
      const lt = nd.localTransform
      if (lt) createBooleanNode(nd.id, nd.operation, nd.children[0], nd.children[1], lt)
    }
  }
}

/**
 * Wrapper around cacheSnapshot that also caches the build tree.
 * Replace all cacheSnapshot calls with this.
 */
function cacheSnapshotWithTree(index: number, objects: Record<string, SceneObject>): void {
  cacheSnapshot(index, objects)
  // Cache tree nodes (only the structure, not cached mesh/BBox/hash)
  const nodes = getAllNodes()
  cacheTreeSnapshot(index, nodes)
}

/**
 * Sync objects into worker cache before CSG/mirror operations.
 * Determines per-object whether to use workerSyncMesh (for CSG results and imported meshes)
 * or workerSyncObjects (for regular primitives), then executes both in parallel.
 *
 * @returns Array of object IDs that were synced as regular primitives (for further syncObjects call)
 */
async function syncObjectsForOperation(
  ids: string[],
  objects: Record<string, SceneObject>,
): Promise<string[]> {
  const meshSyncs: Promise<void>[] = []
  const regularEntries: { objId: string; shapeType: ShapeType; params: ShapeParams; transform: TransformNR }[] = []

  for (const id of ids) {
    const obj = objects[id]
    if (!obj) continue
    const isImport = obj.shapeType === 'import_mesh'
    const isCSG = obj.shapeType === 'csg'
    if (import.meta.env?.DEV) console.log(`[DIAG:syncObjectsForOperation] id=${id} shapeType=${obj.shapeType} params=${JSON.stringify(obj.params)} isCSG=${isCSG} isImport=${isImport} route=${isCSG || isImport ? 'workerSyncMesh' : 'workerSyncObjects'}`)
    if (isCSG || isImport) {
      // CSG result or imported mesh — sync mesh data with current transform
      meshSyncs.push(
        workerSyncMesh(id, obj.vertices, obj.indices, obj.transform).catch(e => console.warn('[syncObjectsForOperation] sync failed:', e)),
      )
    } else {
      // Regular primitive — collect for workerSyncObjects
      regularEntries.push({
        objId: id,
        shapeType: obj.shapeType as ShapeType,
        params: obj.params,
        transform: { ...obj.transform },
      })
    }
  }

  // Execute mesh syncs in parallel
  await Promise.all(meshSyncs)

  // Sync regular primitives in batch
  if (regularEntries.length > 0) {
    if (import.meta.env?.DEV) console.log(`[DIAG:syncObjectsForOperation] syncing regular primitives: ${regularEntries.map(e => e.objId).join(', ')}`)
    await workerSyncObjects(regularEntries).catch(e => console.warn('[syncObjectsForOperation] sync failed:', e))
  }

  return regularEntries.map(e => e.objId)
}

// ---- Store ----

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  operations: [],
  historyIndex: 0,
  objects: {},
  selectedIds: [],
  // FIX (LOW-18-3): Store full SceneObject in clipboard for consistency.
  // Vertices/indices are already shared references (no deep copy needed —
  // clipboard objects are separate from scene objects).
  clipboard: [] as ClipEntry[],
  fileName: null,
  modified: false,
  busy: false,
  lastCsgMs: null,
  currentProjectId: null,
  currentProjectName: null,

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
      // Register in build tree BEFORE caching snapshot
      createPrimitiveNode(id, shapeType, finalParams, transform)
      devLog('addShape', { id, shapeType, params: finalParams, transform })
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
      // Y3.1: начисление токена за действие (лимит 30/день, кулдаун 5с, серверное время)
      void useEconomyStore.getState().earnActionToken()
    } catch (e) { set({ busy: false }); console.error('addShape:', e); notify(i18n.t('errors.createShapeFailed'), 'error') }
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
      // Register baked node in build tree BEFORE caching snapshot
      createBakedNode(id, result.vertices, result.indices, result.normals, transform)
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
      // Y3.1: начисление токена за действие (серверное время)
      void useEconomyStore.getState().earnActionToken()
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation(newObjects, newOps)
    } catch (e) { set({ busy: false }); console.error('addRawMesh:', e); notify(i18n.t('errors.importMeshFailed'), 'error') }
  },

  // ── Добавить 3D текст ──
  addTextMesh: async (name: string, vertices: number[], indices: number[]) => {
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
      const obj: SceneObject = makeObject({ id, shapeType: 'text3d', params: {}, color, transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices, normals: result.normals })
      const op: Text3DOperation = { type: 'text3d', id, name, color, transform, vertices, indices }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      // Register baked node in build tree BEFORE caching snapshot
      createBakedNode(id, result.vertices, result.indices, result.normals, transform)
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
      // Y3.1: начисление токена за действие (серверное время)
      void useEconomyStore.getState().earnActionToken()
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation(newObjects, newOps)
    } catch (e) { set({ busy: false }); console.error('addTextMesh:', e); notify(i18n.t('errors.createShapeFailed'), 'error') }
  },

  // ── Импорт STL ──
  importStl: async () => {
    if (get().busy) return
    const file = await openStlFilePicker()
    if (!file) return
    const result = await parseStlFile(file)
    if (!result.success) { notify(result.error, 'error'); return }

    const { objects, operations, historyIndex } = get()
    const id = nextId('stl')
    const color = colorForIndex(Object.keys(objects).length)
    set({ busy: true })
    try {
      const t0 = performance.now()
      const workerResult = await workerBuildImportedMesh(id, result.vertices, result.indices)
      const ms = performance.now() - t0

      // BUG-R8-1: Передаём normals в makeObject для корректного рендеринга
      const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color, transform: result.transform, visible: true, locked: false, vertices: workerResult.vertices, indices: workerResult.indices, normals: workerResult.normals })
      const op: ImportMeshOperation = { type: 'import_mesh', id, name: result.name, color, transform: result.transform, vertices: result.vertices, indices: result.indices }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      // Register baked node in build tree BEFORE caching snapshot
      createBakedNode(id, workerResult.vertices, workerResult.indices, workerResult.normals, result.transform)
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
      // Y3.1: начисление токена за действие (серверное время)
      void useEconomyStore.getState().earnActionToken()
      // Y3.4: событийный квест — импорт STL
      useEconomyStore.getState().completeEventQuest('import_stl')
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation(newObjects, newOps)
    } catch (e) { set({ busy: false }); notify(i18n.t('errors.stlImportFailed') + ': ' + e, 'error') }
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
      invalidateMirrorCache()
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation(newObjects, newOps)
    } catch (e) { set({ busy: false }); console.error('applyFillet:', e); notify(i18n.t('errors.filletFailed'), 'error') }
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
      } else if (obj.shapeType === 'csg') {
        // FIX (PASTE-CSG): Store CSG mesh data for paste
        entry.csgVertices = new Float32Array(obj.vertices)
        entry.csgIndices = new Uint32Array(obj.indices)
        entry.csgNormals = obj.normals ? new Float32Array(obj.normals) : undefined
        entry.csgAABB = obj.aabb ? { min: { ...obj.aabb.min }, max: { ...obj.aabb.max } } : undefined
        entry.csgOriginalBboxSize = obj.originalBboxSize ? { ...obj.originalBboxSize } : undefined
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
          // Register baked node in build tree for CSG/mirror/align support
          createBakedNode(id, result.vertices, result.indices, result.normals ?? null, transform)
        } else if (clip.shapeType === 'csg' && clip.csgVertices && clip.csgIndices) {
          // FIX (PASTE-CSG): Paste CSG results with their mesh data instead of recreating as primitives
          const obj: SceneObject = makeObject({
            id, shapeType: 'csg', params: {}, color: clip.color,
            transform, visible: true, locked: false,
            vertices: clip.csgVertices, indices: clip.csgIndices,
            normals: clip.csgNormals, aabb: clip.csgAABB,
            originalBboxSize: clip.csgOriginalBboxSize,
          })
          const histOp: GroupOperation = {
            type: 'group', ids: [], resultId: id,
            resultVertices: clip.csgVertices, resultIndices: clip.csgIndices,
            resultNormals: clip.csgNormals, resultCenter: { x: transform.x, y: transform.y, z: transform.z },
            originalBboxSize: clip.csgOriginalBboxSize,
            treeOperation: 'union', shapeType: 'csg', color: clip.color,
          }
          newObjects = { ...newObjects, [id]: obj }
          newOps.push(histOp)
          // Register baked node for CSG paste
          createBakedNode(id, clip.csgVertices, clip.csgIndices, clip.csgNormals ?? null, transform)
        } else {
          const mesh = await workerBuildShape(id, clip.shapeType, clip.params, transform)
          const obj: SceneObject = makeObject({ id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
          const op: AddShapeOperation = { type: 'add_shape', id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform }
          newObjects = { ...newObjects, [id]: obj }
          newOps.push(op)
          // Register primitive node in build tree for CSG/mirror/align support
          createPrimitiveNode(id, clip.shapeType, clip.params, transform)
        }
        pastedIds.push(id)
      }

      const ms = performance.now() - t0
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: pastedIds, modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation(newObjects, newOps)
    } catch (e) {
      set({ busy: false })
      // Clean up partially created objects from worker cache
      if (pastedIds.length > 0) {
        workerDeleteObjects(pastedIds).catch(() => { })
      }
      console.error('paste:', e)
      notify(i18n.t('errors.pasteFailed'), 'error')
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
      // Remove from build tree — recursively delete children (e.g. boolean node subtree)
      deleteNode(id, true)
    }
    try {
      await workerDeleteObjects(ids)
    } catch (e) {
      console.error('deleteSelected:', e)
      notify(i18n.t('errors.deleteFailed'), 'error')
      return // do not update store if worker is out of sync
    }
    const newOps = [...operations.slice(0, historyIndex), op]
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [], modified: true })
    cacheSnapshotWithTree(newOps.length, newObjects)
    invalidateMirrorCache()
    // Y3.14: квесты по состоянию проекта
    evaluateQuestsAfterMutation(newObjects, newOps)
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

    // Non-manifold geometry (imported STL, 3D text) cannot be used in CSG operations
    if (objects[idA].shapeType === 'import_mesh' || objects[idB].shapeType === 'import_mesh') {
      notify(i18n.t('csg.nonManifold'), 'warning')
      return
    }

    const resultId = nextId('csg')
    set({ busy: true })
    try {
      const t0 = performance.now()
      // Sync ALL operands into worker cache before CSG.
      // This ensures the worker has the correct position/rotation/scale
      // for every operand, even after move/align operations.
      await syncObjectsForOperation([idA, idB], objects)
      syncNodeTransform(idA, objects[idA].transform)
      syncNodeTransform(idB, objects[idB].transform)

      const srOf = (id: string) => {
        const t = objects[id].transform
        return { x: t.x, y: t.y, z: t.z, rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ, scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ }
      }
      // Only send shapeType/params for regular primitives (not 'csg', not 'import_mesh').
      // CSG results and imports are already synced via syncObjectsForOperation → workerSyncMesh.
      // import_mesh already excluded by early return above.
      const isOperandA_Primitive = objects[idA].shapeType !== 'csg'
      const isOperandB_Primitive = objects[idB].shapeType !== 'csg'
      let mesh: MeshResult

      // FIX (CSG-BOOLEAN-CSG): When both operands are CSG results, workerCsgBooleanWithSync
      // cannot rebuild them (no shapeType/params). Use workerCsgBoolean instead —
      // syncObjectsForOperation already synced the mesh data via workerSyncMesh.
      if (!isOperandA_Primitive && !isOperandB_Primitive) {
        // Both operands are CSG — use csgBoolean (no shapeType/params needed)
        mesh = await workerCsgBoolean(idA, idB, op, resultId, srOf(idA), srOf(idB))
      } else {
        // At least one operand is a primitive — use csgBooleanWithSync
        mesh = await workerCsgBooleanWithSync(
          idA, idB, op, resultId, srOf(idA), srOf(idB),
          isOperandA_Primitive ? { shapeType: objects[idA].shapeType, params: objects[idA].params } : undefined,
          isOperandB_Primitive ? { shapeType: objects[idB].shapeType, params: objects[idB].params } : undefined,
        )
      }
      const ms = performance.now() - t0
      // Single-pass: center geometry at origin + compute AABB (PERF-R6-1)
      const { cx, cy, cz, aabb } = extractAndCenterGetAABB(mesh.vertices)
      // Store original bbox size for CSG results — used to compute scale relative to original dimensions
      const originalBboxSize = { x: aabb.max.x - aabb.min.x, y: aabb.max.y - aabb.min.y, z: aabb.max.z - aabb.min.z }

      // Use the CSG result centroid (cx, cy, cz) as the position.
      // Rotation and scale are 0/1 because the worker already applied
      // the full TRS of both operands to the geometry — the boolean result mesh
      // is in world coordinates with all transforms baked in. After centering,
      // only translation is needed to place it back at the correct position.
      const resultTransform: TransformNR = {
        x: cx, y: cy, z: cz,
        rotX: 0, rotY: 0, rotZ: 0,
        scaleX: 1, scaleY: 1, scaleZ: 1,
      }

      const newObj: SceneObject = { id: resultId, shapeType: 'csg', params: {}, operation: op, children: [idA, idB], color: objects[idA].color, transform: resultTransform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals, aabb, originalBboxSize }
      const newObjects = { ...objects }; delete newObjects[idA]; delete newObjects[idB]; newObjects[resultId] = newObj
      // Store result vertices/indices AND center position in GroupOperation
      // so rebuildFromHistory can reconstruct the CSG result geometry at the correct position.
      const histOp: GroupOperation = { type: 'group', ids: [idA, idB], resultId, resultVertices: mesh.vertices, resultIndices: mesh.indices, resultNormals: mesh.normals ?? undefined, resultCenter: { x: cx, y: cy, z: cz }, originalBboxSize: originalBboxSize, treeOperation: op as 'union' | 'subtract' | 'intersect', shapeType: 'csg', color: objects[idA].color }
      const newOps = [...operations.slice(0, historyIndex), histOp]
      // Ensure children are registered in build tree.
      // FIX (MIRROR-CSG-KEEPTYPE): CSG results (shapeType='csg') and import_mesh/text3d
      // have baked geometry. Don't rebuild them from shapeType/params.
      const ensureInTree = (id: string) => {
        if (!getNode(id)) {
          const obj = objects[id]
          if (obj) {
            const isPrimitive = obj.shapeType !== 'csg' && obj.shapeType !== 'import_mesh' && obj.shapeType !== 'text3d'
            if (isPrimitive && obj.shapeType && obj.params) {
              createPrimitiveNode(id, obj.shapeType, obj.params, obj.transform)
            } else {
              createBakedNode(id, obj.vertices || new Float32Array(), obj.indices || new Uint32Array(), obj.normals || null, obj.transform)
            }
          }
        }
      }
      ensureInTree(idA)
      ensureInTree(idB)
      // Register CSG result as a boolean node (parametric CSG) - allows future parametric editing
      // 1. rebuildNode returns the pre-computed mesh directly (no re-extraction)
      // 2. syncObjectsForOperation routes to workerSyncMesh (correct for CSG results)
      // 3. mirror/align operations work correctly with the geometry
      // 4. Enables parametric editing in future (edit operands, operation type)
      createBooleanNode(resultId, op as 'union' | 'subtract' | 'intersect', idA, idB, resultTransform)
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [resultId], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
      // Rebuild tree node to cache the mesh in history-tree
      rebuildNode(resultId).catch(e => console.error('[csgBoolean] rebuildNode failed:', e))
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation(newObjects, newOps)
    } catch (e) { set({ busy: false }); console.error('csgBoolean:', e); notify(i18n.t('errors.csgFailed'), 'error') }
  },

  // ── Move ──
  moveObject: async (id, newTransform) => {
    if (get().busy) return
    const { objects, operations, historyIndex } = get()
    const obj = objects[id]
    if (!obj) return

    // FIX (MIRROR-DELTA-EP): Skip near-identical transforms — prevent duplicate
    // history entries and cache invalidation when moveObject is called twice
    // with the same values (e.g. React Strict Mode double-mount, simultaneous
    // 3D viewport drag + property panel sync).
    const t = obj.transform
    const dx = newTransform.x - t.x
    const dy = newTransform.y - t.y
    const dz = newTransform.z - t.z
    const drx = newTransform.rotX - t.rotX
    const dry = newTransform.rotY - t.rotY
    const drz = newTransform.rotZ - t.rotZ
    const dsx = newTransform.scaleX - t.scaleX
    const dsy = newTransform.scaleY - t.scaleY
    const dsz = newTransform.scaleZ - t.scaleZ
    const epsilon = 1e-6
    if (
      Math.abs(dx) < epsilon && Math.abs(dy) < epsilon && Math.abs(dz) < epsilon &&
      Math.abs(drx) < epsilon && Math.abs(dry) < epsilon && Math.abs(drz) < epsilon &&
      Math.abs(dsx) < epsilon && Math.abs(dsy) < epsilon && Math.abs(dsz) < epsilon
    ) {
      // Near-identical transform — skip silently
      return
    }

    // FIX (BUG-CSG-POS-5/6): Do NOT rebuild the mesh on transform changes.
    //
    // The rendering model is:
    // - obj.vertices = geometry centered at origin (from initial creation)
    // - obj.transform = full TRS (position + rotation + scale)
    // - Viewport3D centers vertices (no-op if already centered) and applies
    //   transform via pivot (position + rotation + scale)
    //
    // handleBuildShape (worker) only applies TRANSLATION to the mesh, NOT
    // rotation/scale — those are handled by Viewport3D's pivot. Rebuilding via
    // rebuildNode/rebuildPrimitive would bake FULL TRS into vertices (via
    // buildTransformMatrix), causing double-application when Viewport3D also
    // applies the transform via pivot.
    //
    // For CSG results, moveTreeNode (old approach) recursed into children and
    // only applied translation delta, leaving the boolean node's localTransform
    // stale. This caused wrong positions when the result was used in subsequent
    // CSG operations (workerSyncMesh received vertices at old centroid + new
    // transform → double offset).
    //
    // Solution: just update obj.transform and sync the tree's localTransform.
    // No mesh rebuild needed — vertices stay centered at origin.

    // Ensure node exists in tree (may be missing after undo/redo tree restore)
    const treeExists = getNode(id) !== undefined
    if (!treeExists) {
      // FIX (MIRROR-CSG-KEEPTYPE): CSG results (shapeType='csg') and import_mesh/text3d
      // have baked geometry. Don't rebuild them from shapeType/params.
      const isPrimitive = obj.shapeType !== 'csg' && obj.shapeType !== 'import_mesh' && obj.shapeType !== 'text3d'
      if (isPrimitive && obj.shapeType && obj.params) {
        createPrimitiveNode(id, obj.shapeType, obj.params, obj.transform)
      } else {
        createBakedNode(id, obj.vertices || new Float32Array(), obj.indices || new Uint32Array(), obj.normals || null, obj.transform)
      }
    }

    // FIX (MIRROR-DOUBLE-TRANSLATE): Do NOT call moveTreeNode here.
    //
    // The previous code called moveTreeNode(id, delta) to shift child primitives
    // in the tree by the translation delta. However, syncNodeTransform below
    // ALSO sets the boolean root's localTransform to the full new TRS (including
    // translation). This creates DOUBLE TRANSLATION when applyCSGMeshes rebuilds:
    //   1. Children are shifted by accumulated delta (via moveTreeNode)
    //   2. Root localTransform translation is applied again (via applyCSGMeshes)
    //
    // During normal rendering this is masked (Viewport3D uses cached centered
    // vertices + pivot TRS, not tree rebuild). But during mirror, the clone's
    // root is reset to identity — only the shifted children remain, producing
    // broken, non-deterministic mirror results.
    //
    // Correct model: children keep their ORIGINAL world positions (from CSG
    // creation). The boolean root's localTransform carries the full TRS.
    // applyCSGMeshes centers the child geometry and applies root TRS → correct
    // world position. Mirror clones the tree, mirrors children + root TRS,
    // resets root to identity, rebuilds → centered mirrored geometry. The
    // mirrored SceneObject.transform = mirror(original TRS). Viewport3D applies
    // it via pivot. This is correct and deterministic.

    // Sync the new transform to the tree node (for future CSG/mirror/align ops)
    syncNodeTransform(id, newTransform)
    devLog('moveObject', { id, newTransform })

    // Update SceneObject — vertices unchanged, only transform changes
    // IMPORTANT: Also update cached AABB — it was computed from vertices (world-space)
    // at object creation time, but after move the bbox needs to shift by the same delta.
    const oldWorldAabb = obj.aabb ?? computeAABB(obj.vertices)
    const newWorldAabb = {
      min: {
        x: oldWorldAabb.min.x + dx,
        y: oldWorldAabb.min.y + dy,
        z: oldWorldAabb.min.z + dz,
      },
      max: {
        x: oldWorldAabb.max.x + dx,
        y: oldWorldAabb.max.y + dy,
        z: oldWorldAabb.max.z + dz,
      },
    }
    const newObj: SceneObject = { ...obj, transform: newTransform, aabb: newWorldAabb }
    const newObjects = { ...objects, [id]: newObj }
    const delta: Vec3 = {
      x: newTransform.x - obj.transform.x,
      y: newTransform.y - obj.transform.y,
      z: newTransform.z - obj.transform.z,
    }
    const rotDelta = {
      x: newTransform.rotX - obj.transform.rotX,
      y: newTransform.rotY - obj.transform.rotY,
      z: newTransform.rotZ - obj.transform.rotZ,
    }
    const scaleDelta = {
      x: newTransform.scaleX - obj.transform.scaleX,
      y: newTransform.scaleY - obj.transform.scaleY,
      z: newTransform.scaleZ - obj.transform.scaleZ,
    }
    const kind: 'translate' | 'rotate' | 'scale' =
      Math.abs(scaleDelta.x) > 1e-6 || Math.abs(scaleDelta.y) > 1e-6 || Math.abs(scaleDelta.z) > 1e-6
        ? 'scale'
        : Math.abs(rotDelta.x) > 1e-6 || Math.abs(rotDelta.y) > 1e-6 || Math.abs(rotDelta.z) > 1e-6
          ? 'rotate'
          : 'translate'
    const op: MoveOperation = {
      type: 'move',
      ids: [id],
      delta,
      rotDelta,
      scaleDelta,
      kind,
    }
    const newOps = [...operations.slice(0, historyIndex), op]

    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshotWithTree(newOps.length, newObjects)
    invalidateMirrorCache()
  },

  // ── Color ──
  setColor: (id, color, skipHistory = false) => {
    const { objects, operations, historyIndex } = get()
    if (!objects[id]) return
    devLog('setColor', { id, color, skipHistory, from: objects[id].color })
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

  /**
    * Preview mirror result without saving to history (MIRROR-2).
    * Computes the mirrored mesh and stores it in ui-store for semi-transparent preview.
    *
    * FIX (CRIT-MIRROR-1): Do NOT set busy=true. This is a non-destructive preview
    * operation that should NOT block mirrorSelected or other user actions.
    * Setting busy=true caused previewMirror to block mirrorSelected when the
    * user clicked the mirror button while preview was still computing.
    */
  previewMirror: async (plane: 'XY' | 'XZ' | 'YZ') => {
    const { selectedIds, objects } = get()
    const ids = selectedIds.filter(id => objects[id])
    if (ids.length === 0) return
    const { useUiStore } = await import('./ui-store')
    const setPreviewObject = useUiStore.getState().setPreviewObject
    setPreviewObject(null)
    try {
      const result = await mirrorPreviewFn(plane, ids, objects)
      if (result) {
        setPreviewObject({
          ...result,
          isMirrorPreview: true,
        })
      }
    } catch (e) {
      console.error('previewMirror:', e)
      try {
        const { useUiStore } = await import('./ui-store')
        useUiStore.getState().setPreviewObject(null)
      } catch { /* ignore */ }
    }
  },

  mirrorSelected: async (plane: 'XY' | 'XZ' | 'YZ') => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    const ids = selectedIds.filter(id => objects[id])
    if (ids.length === 0) return
    set({ busy: true })
    try {
      const t0 = performance.now()
      const result = await mirrorConfirmFn(plane, ids, objects)
      if (!result) { set({ busy: false }); return }
      const { newObjects, newIds, operation } = result
      const newOps = [...operations.slice(0, historyIndex), operation]
      set({
        operations: newOps,
        historyIndex: newOps.length,
        objects: { ...objects, ...newObjects },
        selectedIds: ids,
        modified: true,
        busy: false,
        lastCsgMs: performance.now() - t0,
      })
      cacheSnapshotWithTree(newOps.length, { ...objects, ...newObjects })
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation({ ...objects, ...newObjects }, newOps)
    } catch (e) { set({ busy: false }); console.error('mirrorSelected:', e); notify(i18n.t('errors.mirrorFailed'), 'error') }
  },
  alignSelected: async (axis, anchor) => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    devLog('ALIGN:begin', { axis, anchor, selectedIds })
    if (selectedIds.length === 0) { notify(i18n.t('errors.noObjectsSelected'), 'warning'); return }
    const ids = selectedIds.filter(id => objects[id])
    devLog('ALIGN:filtered', { ids, totalSelected: selectedIds.length })
    if (ids.length < 2) { devLog('ALIGN:skip', 'less than 2 objects'); return }

    // FIX (ALIGN-3): Anchor = last selected object (most recent click), not first.
    // Matches Blender/Tinkercad UX: the last clicked object is the "active" anchor.
    const anchorId = ids[ids.length - 1]
    const targetIds = ids.filter(id => id !== anchorId)
    devLog('ALIGN:anchor', { anchorId, targetIds })

    const ax = axis.toLowerCase() as 'x' | 'y' | 'z'
    const anchorObj = objects[anchorId]
    const anchorWorldAabb = computeWorldAABB(anchorObj)

    // Target value from anchor object only (world space)
    let targetValue: number
    switch (anchor) {
      case 'min': targetValue = anchorWorldAabb.min[ax]; break
      case 'max': targetValue = anchorWorldAabb.max[ax]; break
      default: targetValue = (anchorWorldAabb.min[ax] + anchorWorldAabb.max[ax]) / 2; break
    }
    devLog('ALIGN:bboxes', {
      ax,
      targetValue,
      anchorId,
      anchorWorldAabb,
    })

    // Compute deltas for all OTHER objects (move them toward the anchor)
    const deltas: Record<string, number> = {}
    for (const id of targetIds) {
      const obj = objects[id]
      const worldAabb = computeWorldAABB(obj)

      // World-space current coordinate
      const curMin = worldAabb.min[ax]
      const curMax = worldAabb.max[ax]
      const cur = anchor === 'min' ? curMin : anchor === 'max' ? curMax : (curMin + curMax) / 2

      const delta = targetValue - cur
      deltas[id] = delta

      devLog('ALIGN:bboxes', {
        ax,
        targetValue,
        anchorId,
        anchorWorldAabb,
        targetAabb: worldAabb,
        cur,
        delta,
      })
    }
    devLog('ALIGN:deltas', { deltas })
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = { ...objects }
      for (const id of targetIds) {
        const delta = deltas[id]
        if (Math.abs(delta) < 0.001) { devLog('ALIGN:skip-zero', { id, delta }); continue }
        const obj = newObjects[id]
        const dx = axis === 'X' ? delta : 0, dy = axis === 'Y' ? delta : 0, dz = axis === 'Z' ? delta : 0
        const nt: TransformNR = { ...obj.transform, x: obj.transform.x + dx, y: obj.transform.y + dy, z: obj.transform.z + dz }
        devLog('ALIGN:apply', { id, axis, delta, oldPos: obj.transform, newPos: nt })
        // FIX (CRIT-CSG-3): For CSG results and imported meshes, sync via workerSyncMesh.
        // For regular primitives, use workerSyncObjects (updates only transform in cache,
        // avoids full geometry rebuild via workerBuildShape).
        const isImport = obj.shapeType === 'import_mesh'
        const isCSG = obj.shapeType === 'csg'
        if (isCSG || isImport) {
          devLog('ALIGN:workerSyncMesh', { id })
          await workerSyncMesh(id, obj.vertices, obj.indices, nt).catch(() => { })
          newObjects[id] = { ...obj, transform: nt }
        } else {
          devLog('ALIGN:workerSyncObjects', { id })
          await workerSyncObjects([{
            objId: id,
            shapeType: obj.shapeType,
            params: obj.params,
            transform: nt,
          }]).catch(() => { })
          newObjects[id] = { ...obj, transform: nt }
        }
      }
      const op: AlignOperation = { type: 'align', ids: targetIds, axis, anchor, deltas, anchorId }
      devLog('ALIGN:op', { op })
      const newOps = [...operations.slice(0, historyIndex), op]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshotWithTree(newOps.length, newObjects)
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation(newObjects, newOps)
      invalidateMirrorCache()
      devLog('ALIGN:done', { durationMs: performance.now() - t0, anchorId, targetIds })
    } catch (e) { set({ busy: false }); console.error('alignSelected:', e); notify(i18n.t('errors.alignFailed'), 'error') }
  },

  // ── Undo ──
  undo: async () => {
    if (get().busy) return
    const { historyIndex } = get()
    if (historyIndex === 0) return
    await jumpToHistoryInner(historyIndex - 1, 'Отмена')
  },

  // ── Redo ──
  redo: async () => {
    if (get().busy) return
    const { historyIndex, operations } = get()
    if (historyIndex >= operations.length) return
    await jumpToHistoryInner(historyIndex + 1, 'Повтор')
  },

  // ── Jump to history ──
  jumpToHistory: async (index) => {
    if (get().busy) return
    const { historyIndex, operations } = get()
    const newIdx = Math.max(0, Math.min(index, operations.length))
    if (newIdx === historyIndex) return
    await jumpToHistoryInner(newIdx, 'Переход в истории')
  },

  // ── Clear ──
  clearScene: async () => {
    if (get().busy) return
    await workerClearAll()
    clearSnapshots()
    clearTree()
    set({ operations: [], historyIndex: 0, objects: {}, selectedIds: [], modified: false, fileName: null, lastCsgMs: null, currentProjectId: null, currentProjectName: null })
    invalidateMirrorCache()
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
      // DEBUG: verify CSG objects have mesh data and check children
      if (import.meta.env.DEV) {
        const csgObjs = Object.values(newObjects).filter(o => o.shapeType === 'csg')
        console.log('[loadDoodle] CSG objects count:', csgObjs.length)
        for (const c of csgObjs) {
          console.log(`[loadDoodle]  ${c.id}: tris=${c.indices.length / 3} verts=${c.vertices.length / 3} rot=${c.transform.rotX}/${c.transform.rotY}/${c.transform.rotZ} scl=${c.transform.scaleX}/${c.transform.scaleY}/${c.transform.scaleZ}`)
          // Log CSG children from operations
          const childrenOps = doc.operations.filter(op => op.type === 'group' && (op as import('../csg/types').GroupOperation).resultId === c.id)
          for (const childOp of childrenOps) {
            const g = childOp as import('../csg/types').GroupOperation
            console.log(`[loadDoodle]   children of ${c.id}: ids=[${g.ids.join(', ')}] hasMesh=${!!g.resultVertices?.length}`)
            // Log children details from operations array
            for (const childId of g.ids) {
              const childObj = newObjects[childId]
              console.log(`[loadDoodle]   child ${childId}: shapeType=${childObj?.shapeType} tris=${childObj?.indices.length / 3} verts=${childObj?.vertices.length / 3}`)
            }
          }
        }
      }
      // FIX (R17-7): Rebuild build tree after loading from file to ensure
      // CSG/mirror/align operations have the correct tree structure.
      rebuildBuildTree(doc.operations, newObjects)
      set({ operations: doc.operations, historyIndex: doc.operations.length, objects: newObjects, selectedIds: [], fileName: picked.file.name, modified: false, busy: false, lastCsgMs: performance.now() - t0, currentProjectId: null, currentProjectName: null })
      cacheSnapshotWithTree(doc.operations.length, newObjects)
      invalidateMirrorCache()
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation(newObjects, doc.operations)
    } catch (e) { set({ busy: false }); notify(i18n.t('errors.openFailed', { error: e }), 'error') }
  },

  // ── Save .doodle ──
  saveDoodle: async () => {
    const { operations, historyIndex, fileName, objects } = get()
    const opsToSave = operations.slice(0, historyIndex)
    const blob = await serializeDoodle(opsToSave)
    downloadBlob(blob, (fileName ?? 'untitled') + (fileName?.endsWith('.doodle') ? '' : '.doodle'))
    set({ modified: false })
    // Квесты V2: коммит токенов при сохранении
    await useEconomyStore.getState().commitQuests()
  },

  // ── Export STL ──
  exportStl: () => {
    const { objects, fileName, operations } = get()
    const objectList = Object.values(objects)
    const objectCount = objectList.filter(o => o.shapeType !== 'import_mesh' && o.shapeType !== 'text3d').length
    const csgOps = operations.filter(op => op.type === 'group').length

    // Y3.3: проверка хэша модели для кэшбэка
    const hash = createExportHash({ objects: objectList.map(o => ({ shapeType: o.shapeType, params: o.params, transform: o.transform })) })
    const lastHash = useEconomyStore.getState().lastExportHash
    const hashChanged = lastHash === null || lastHash !== hash

    // Y3.2/Y2.0: кэшбэк V2 за экспорт (только если модель изменилась)
    if (hashChanged) {
      const scan = scanForCashback(objects, operations)
      const cashback = useEconomyStore.getState().calculateAndClaimCashback(scan)
      if (cashback > 0) {
        useEconomyStore.getState().lastExportHash = hash
      }
    }

    downloadStl(objectList, (fileName?.replace(/\.doodle$/, '') ?? i18n.t('app.name')) + '.stl')
    // Квесты V2: коммит токенов при экспорте
    void useEconomyStore.getState().commitQuests()
    // Y3.4: событийный квест — экспорт STL
    useEconomyStore.getState().completeEventQuest('export_stl')
    // Y3.5: событийный квест — экспорт ≥10 объектов (§4 квесты)
    if (objectCount >= 10) {
      useEconomyStore.getState().completeEventQuest('export_stl_large')
    }
  },

  // ── Resize dims ──
  resizeObject: async (id, params) => {
    if (get().busy) return
    const { objects, operations, historyIndex } = get()
    const obj = objects[id]
    if (!obj || obj.shapeType === 'import_mesh') return

    // ВСЕ объекты должны быть зарегистрированы в дереве
    const treeExists = getNode(id) !== undefined

    // СИНХРОНИЗИРУЕМ ТРАНСФОРМАЦИЮ ИЗ STORE ПЕРЕД ОПЕРАЦИЕЙ
    syncNodeTransform(id, obj.transform)

    if (!treeExists) {
      // FIX (MIRROR-CSG-KEEPTYPE): CSG-результаты (shapeType='csg') → baked нода.
      // import_mesh уже отфильтрован ранним return выше.
      const isPrimitive = obj.shapeType !== 'csg'
      if (isPrimitive && obj.shapeType && obj.params) {
        createPrimitiveNode(id, obj.shapeType, obj.params, obj.transform)
      } else {
        // Для CSG/baked/import создаём baked ноду (готовый меш)
        createBakedNode(id, obj.vertices || new Float32Array(), obj.indices || new Uint32Array(), obj.normals || null, obj.transform)
      }
    }

    // Для примитивов: обновляем params в дереве и пересобираем
    if (obj.shapeType && obj.params) {
      const mergedParams = { ...obj.params, ...params }

      // Обновляем params в ноде дерева (иммутабельно через setNode)
      const node = getNode(id)
      if (node && node.type === 'primitive') {
        setNode(id, { ...node, params: { ...mergedParams } })
      }

      set({ busy: true })
      try {
        const t0 = performance.now()
        // Пересобираем меш с новыми параметрами
        const mesh = await rebuildNode(id)
        const ms = performance.now() - t0

        const newObj = makeObject({
          ...obj,
          params: mergedParams,
          vertices: mesh.vertices,
          indices: mesh.indices,
          normals: mesh.normals
        })

        const op: ResizeDimsOperation = { type: 'resize_dims', id, params: mergedParams }
        const newOps = [...operations.slice(0, historyIndex), op]
        const newObjects = { ...objects, [id]: newObj }

        set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: ms })
        devLog('resizeObject', { id, newParams: mergedParams })
        cacheSnapshotWithTree(newOps.length, newObjects)
        invalidateMirrorCache()
        // Y3.14: квесты по состоянию проекта
        evaluateQuestsAfterMutation(newObjects, newOps)
      } catch (e) { set({ busy: false }); console.error('resizeObject:', e); notify(i18n.t('errors.resizeFailed'), 'error') }
    }
    // Для CSG результатов: используем scale трансформацию
    else {
      set({ busy: true })
      try {
        const bbox = obj.aabb ?? computeAABB(obj.vertices)
        const currentSize = {
          x: bbox.max.x - bbox.min.x,
          y: bbox.max.y - bbox.min.y,
          z: bbox.max.z - bbox.min.z,
        }

        const targetWidth = params.width ?? currentSize.x
        const targetHeight = params.height ?? currentSize.y
        const targetDepth = params.depth ?? currentSize.z

        // Вычисляем новый scale
        const newTransform = {
          ...obj.transform,
          scaleX: targetWidth / currentSize.x,
          scaleY: targetHeight / currentSize.y,
          scaleZ: targetDepth / currentSize.z,
        }

        // FIX (CSG-RESIZE-NO-BAKE): НЕ вызываем rebuildNode для CSG-результатов.
        //
        // Прежний код вызывал rebuildNode(id), который через applyCSGMeshes
        // применяет root localTransform (включая scale) к центрированной
        // геометрии детей — vertices получали scale, ЗАПЕЧЁННЫЙ в координаты.
        // Затем эти vertices сохранялись в SceneObject, а transform тоже содержал
        // scale → двойное применение scale (и в Viewport3D через pivot, и в
        // handleSyncMesh при булевых операциях — результат смещался).
        //
        // Правильная модель: vertices остаются центрированными (без scale),
        // scale живёт в transform и применяется Viewport3D через pivot.
        // localTransform в дереве обновляется через applyNodeTransform
        // (инвалидирует кэш rebuildNode для корректного последующего mirror).
        applyNodeTransform(id, newTransform)

        const newObj = makeObject({
          ...obj,
          transform: newTransform,
        })

        const op: ResizeDimsOperation = { type: 'resize_dims', id, params }
        const newOps = [...operations.slice(0, historyIndex), op]
        const newObjects = { ...objects, [id]: newObj }

        set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: 0 })
        devLog('resizeObject', { id, newTransform })
        cacheSnapshotWithTree(newOps.length, newObjects)
        invalidateMirrorCache()
        // Y3.14: квесты по состоянию проекта
        evaluateQuestsAfterMutation(newObjects, newOps)
      } catch (e) { set({ busy: false }); console.error('resizeObject (CSG):', e); notify(i18n.t('errors.resizeCsgFailed'), 'error') }
    }
  },

  // ── Extrude ──
  extrudeSelected: async (axis, depth) => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    if (selectedIds.length === 0) { notify(i18n.t('errors.noObjectsSelected'), 'warning'); return }
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
      // FIX (R17-11): Clean up temporary slab from worker cache to prevent memory leak
      workerDeleteObjects([slabId]).catch(() => { })
      const ms = performance.now() - t0
      // Single-pass: center geometry at origin + compute AABB (PERF-R6-1)
      const { cx: ex, cy: ey, cz: ez, aabb } = extractAndCenterGetAABB(resultMesh.vertices)
      const newObj: SceneObject = { id: resultId, shapeType: 'csg', params: {}, color: obj.color, transform: { x: ex, y: ey, z: ez, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }, visible: true, locked: false, vertices: resultMesh.vertices, indices: resultMesh.indices, normals: resultMesh.normals, aabb }
      const addOp: AddShapeOperation = { type: 'add_shape', id: slabId, shapeType: 'cube', params: slabP, color: obj.color, transform: slabT }
      const grpOp: GroupOperation = { type: 'group', ids: [id, slabId], resultId, resultVertices: resultMesh.vertices, resultIndices: resultMesh.indices, resultNormals: resultMesh.normals ?? undefined, resultCenter: { x: ex, y: ey, z: ez } }
      const newObjects = { ...objects }; delete newObjects[id]; newObjects[resultId] = newObj
      const newOps = [...operations.slice(0, historyIndex), addOp, grpOp]
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [resultId], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
    } catch (e) { set({ busy: false }); console.error('extrudeSelected:', e); notify(i18n.t('errors.extrudeFailed'), 'error') }
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
      rebuildBuildTree(entry.operations, newObjects)
      set({ operations: entry.operations, historyIndex: entry.historyIndex, objects: newObjects, selectedIds: [], fileName: entry.fileName, modified: false, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshotWithTree(entry.historyIndex, newObjects)
      return true
    } catch (e) { set({ busy: false }); return false }
  },

  // ── Project Manager ──
  saveToProject: async (name) => {
    const { operations, historyIndex, objects, currentProjectId, currentProjectName } = get()
    const ops = operations.slice(0, historyIndex)
    const count = Object.keys(objects).length
    // If project already has an ID, update it. Use existing name if name is empty.
    const effectiveName = name || currentProjectName || 'Без названия'
    try {
      // Check for name conflicts with other projects
      const all = await pmList()
      const conflict = all.find(p => p.name === effectiveName && p.id !== currentProjectId)
      if (conflict) {
        notify(i18n.t('errors.projectNameExists', { name: effectiveName }), 'error')
        return
      }
      if (currentProjectId) {
        await pmUpdate(currentProjectId, effectiveName, ops, count)
      } else {
        const meta = await pmSave(effectiveName, ops, count)
        set({ currentProjectId: meta.id })
      }
      set({ modified: false, currentProjectName: effectiveName })
    } catch (e) {
      console.error('saveToProject:', e)
      notify(e instanceof Error ? e.message : i18n.t('errors.saveFailed'), 'error')
    }
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
      rebuildBuildTree(record.operations, newObjects)
      set({ operations: record.operations, historyIndex: record.operations.length, objects: newObjects, selectedIds: [], fileName: null, modified: false, busy: false, lastCsgMs: performance.now() - t0, currentProjectId: id, currentProjectName: record.name })
      cacheSnapshotWithTree(record.operations.length, newObjects)
      // Y3.14: квесты по состоянию проекта
      evaluateQuestsAfterMutation(newObjects, record.operations)
    } catch (e) { set({ busy: false }); console.error('loadFromProject:', e); notify(i18n.t('errors.loadProjectFailed'), 'error') }
  },

  // ── Set current project (for ProjectManagerModal) ──
  setCurrentProject: (id, name) => {
    if (id) {
      set({ currentProjectId: id, currentProjectName: name ?? null })
    } else {
      set({ currentProjectId: null, currentProjectName: null })
    }
  },
}))
