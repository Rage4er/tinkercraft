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
  MirrorOperation, AlignOperation, AlignPlane, ResizeDimsOperation,
  MoveOperation, ColorOperation, GroupOperation, RenameOperation, HideShowOperation,
  DeleteOperation, EditChildParamsOperation,
  SceneObject, ShapeParams, TransformNR, Vec3,
  TreeNode,
} from '../csg/types'
import {
  workerBuildShape, workerCsgBooleanWithSync,
  workerBuildImportedMesh,
  workerMirrorObject, workerRebuildScene,
  workerDeleteObjects, workerClearAll, workerSyncObjects, workerSyncMesh,
} from '../csg/worker-client'
import { parse3dtc, serialize3dtc, open3dtcFilePicker, downloadBlob } from '../io/3dtc-io'
import { notify } from './notifications'
import { saveProject as pmSave, updateProject as pmUpdate, loadProject as pmLoad, listProjects as pmList } from '../io/project-manager'
import { exportToStl, downloadStlBlob, StlTooLargeError } from '../io/stl-export'
import { openStlFilePicker, parseStlFile } from '../io/stl-import'
import { autosaveSession, restoreSession, clearAutosave } from '../io/autosave'
import { useDimensionsStore } from './dimensions-store'
import { sanitizeDimensions, type Dimension } from './dimensions'
import { migrateLegacyFillet, type LegacyFilletMigration } from '../io/legacy-fillet'
import i18n from '../i18n'

export { computeAABB, extractAndCenterInPlace, extractAndCenterGetAABB, computeWorldAABB, extractCenteredAt } from './helpers'
import { computeAABB, extractAndCenterInPlace, extractAndCenterGetAABB, centerMassAtOrigin, solveAlignDeltas, extrudeSlab, worldVerticesAABB, makeObject, nextId, colorForIndex, faceToLocal, solvePlaneAlignMove, dominantAxis, defaultShapeParams } from './helpers'
import type { ClipEntry } from './helpers'
import type { DocumentStore } from './types'
import { rebuildFromHistory, rebuildBuildTree } from './rebuild'
import { isTextObject, textFromName } from './text-object'
import { computeCsgResultN, groupOperationFromResult, isNonManifoldError } from './csg-result'
import { resolveCsgOperands } from './csg-operands'
import { computeEditedChild, editFailureKey, findCreationTransform } from './edit-child'
import { computeStepEdit, editStepFailureKey } from './edit-step'
import { cacheSnapshot, getCachedSnapshot, clearSnapshots, cacheTreeSnapshot } from './snapshots'
import { OBJECT_SPACING, PASTE_OFFSET, CSG_SOFT_LIMIT } from '../constants'
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
  registerObjectInTree,
  snapshotSubtree,
  instantiateSubtree,
} from '../csg/history-tree'
import { getAllNodes } from '../csg/history-tree'
import { previewMirror as mirrorPreviewFn, mirrorSelected as mirrorConfirmFn, invalidateMirrorCache } from './mirror-store'
import { devLog, devWarn, devLogCsg, devLogStore } from '../utils/debug'

// ── Shared undo/redo/jumpToHistory helper — FIX (MED-18-1): eliminates ~90 lines of duplication ──

/** Internal helper: rebuilds scene from history up to the given index. */
async function jumpToHistoryInner(newIdx: number, action: 'undo' | 'redo' | 'jump'): Promise<void> {
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
  } catch (e) { setState({ busy: false }); console.error(`jumpToHistory (${action}):`, e); notify(i18n.t('errors.operationFailed', { name: i18n.t(`errors.historyAction.${action}`) }), 'error') }
}

// ── UX-AUDIT-2: отмена «Очистить сцену» ──

/**
 * Можно ли отменить очистку сцены: снимок есть и после очистки ничего не сделано
 * (история пуста). «Отменить» в UI активна при `historyIndex > 0 || canUndoClear(s)`.
 */
export function canUndoClear(s: Pick<DocumentStore, 'clearedDocument' | 'operations' | 'historyIndex'>): boolean {
  return s.clearedDocument !== null && s.operations.length === 0 && s.historyIndex === 0
}

/** Вернуть документ до очистки: история (с redo), объекты, дерево, файл/проект, «не сохранено». */
async function restoreClearedDocument(): Promise<void> {
  const getState = useDocumentStore.getState
  const setState = useDocumentStore.setState
  const doc = getState().clearedDocument
  if (!doc) return
  setState({ busy: true })
  try {
    const t0 = performance.now()
    await workerClearAll()
    clearSnapshots()
    const newObjects = await rebuildFromHistory(doc.operations.slice(0, doc.historyIndex))
    rebuildBuildTree(doc.operations.slice(0, doc.historyIndex), newObjects)
    setState({
      operations: doc.operations, historyIndex: doc.historyIndex, objects: newObjects, selectedIds: [],
      fileName: doc.fileName, modified: doc.modified, currentProjectId: doc.currentProjectId, currentProjectName: doc.currentProjectName,
      clearedDocument: null, busy: false, lastCsgMs: performance.now() - t0,
    })
    cacheSnapshotWithTree(doc.historyIndex, newObjects)
    invalidateMirrorCache()
  } catch (e) { setState({ busy: false }); console.error('undo clearScene:', e); notify(i18n.t('errors.operationFailed', { name: i18n.t('errors.historyAction.undo') }), 'error') }
}

// ── Загрузка старых проектов: скругление удалено (remove-fillet) ──

/**
 * Миграция истории/объектов перед загрузкой: шаги fillet вырезаются, filletRadius снимается.
 * Уведомление — один раз на проект (а не на каждый шаг).
 */
function migrateLoaded(ops: TinkerCraftOperation[], objects?: Record<string, SceneObject>): LegacyFilletMigration {
  const m = migrateLegacyFillet(ops, objects)
  if (m.changed) notify(i18n.t('errors.legacyFilletRemoved'), 'info')
  return m
}

/**
 * Живое применение нового трансформа объекта (без шага истории): узел дерева и кэш AABB.
 * Общая часть `moveObject` и `alignToPlane` (ALIGN-PLANE-RESOLVE).
 */
function liveTransformed(obj: SceneObject, newTransform: TransformNR): SceneObject {
  const id = obj.id
  const dx = newTransform.x - obj.transform.x
  const dy = newTransform.y - obj.transform.y
  const dz = newTransform.z - obj.transform.z
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
    // FIX (MIRROR-CSG-KEEPTYPE): CSG-результаты (shapeType='csg') и import_mesh
    // регистрируются как baked-ноды (готовый меш), а не как primitive.
    // FIX (8.5.12): зеркальный примитив (mirrored) тоже baked — vertices с зеркалом.
    registerObjectInTree(id, obj)
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
  return { ...obj, transform: newTransform, aabb: newWorldAabb }
}

// ── Tree snapshot helpers ──

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

// ---- Store ----

/**
 * DIMENSIONS: размеры для записи (файл, проект, автосохранение) — те, чьи объекты есть в документе.
 * Слой размеров — отдельно от истории: не шаги, undo его не трогает.
 */
function dimensionsToSave(objects: Record<string, SceneObject>): Dimension[] {
  return useDimensionsStore.getState().dimensions.filter((d) => objects[d.objectIdA] && objects[d.objectIdB])
}
/** DIMENSIONS: слой из загруженного документа — только размеры, чьи объекты есть (иначе — пусто). */
function loadDimensions(raw: unknown, objects: Record<string, SceneObject>): void {
  useDimensionsStore.getState().setDimensions(sanitizeDimensions(raw).filter((d) => objects[d.objectIdA] && objects[d.objectIdB]))
}

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
  clearedDocument: null,

  // ── Добавить фигуру ──
  addShape: async (shapeType, params, at) => {
    if (get().busy) return
    const { objects, operations, historyIndex } = get()
    const idx = Object.keys(objects).length
    const id = nextId('obj')
    // PLUG-AND-PLAY: `at` — место из режима размещения (на плоскости); без него — рядом с прошлыми
    const transform: TransformNR = at ? { ...at } : { x: idx * OBJECT_SPACING, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const color = colorForIndex(idx)
    const finalParams = params ?? defaultShapeParams(shapeType)
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
    } catch (e) { set({ busy: false }); console.error('addShape:', e); notify(i18n.t('errors.createShapeFailed'), 'error') }
  },

  // ── Добавить произвольный меш (текст, и т.д.) ──
  addRawMesh: async (name, vertices, indices, text) => {
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
      // FIX (8.5.3): конвенция единого источника — вершины ВСЕГДА в origin (COM).
      // centerMassAtOrigin мутирует result.vertices in-place и возвращает COM,
      // который прибавляется к pivot: world = pivot + v не меняется.
      // Операция хранит «рецепт» (сырые вершины + spawn) — rebuild (8.5.2.5)
      // делает то же центрирование, поэтому live == rebuild.
      const com = centerMassAtOrigin(result.vertices, result.indices)
      const pivot: TransformNR = { ...transform, x: transform.x + com.cx, y: transform.y + com.cy, z: transform.z + com.cz }
      // UX-AUDIT-6: имя («Текст: Hi») — и у объекта, а не только в операции (дерево показывало
      // «Импорт N»; после перемотки/загрузки rebuild брал имя из операции — живое ≠ rebuild)
      // UX-AUDIT-31: исходная строка текста — у объекта и шага («Добавить текст: …», «Тип: Текст»)
      const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color, transform: pivot, visible: true, locked: false, vertices: result.vertices, indices: result.indices, normals: result.normals, name, ...(text !== undefined ? { text } : {}) })
      const op: ImportMeshOperation = { type: 'import_mesh', id, name, color, transform, vertices, indices, ...(text !== undefined ? { text } : {}) }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      // Register baked node in build tree BEFORE caching snapshot
      createBakedNode(id, result.vertices, result.indices, result.normals, pivot)
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
    } catch (e) { set({ busy: false }); console.error('addRawMesh:', e); notify(i18n.t('errors.importMeshFailed'), 'error') }
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

      // FIX (8.5.3): SceneObject.vertices — ВСЕГДА в origin (COM). Раньше
      // импорт хранил сырые координаты STL, а вьюпорт (centerGeometry) вычитал
      // bbox-центр — позиция зависела от рендера, а не от данных, и расходилась
      // с CSG/rebuild. Теперь COM центрируется здесь, pivot = transform импорта
      // + COM → world = pivot + v = исходные координаты STL (render = data).
      const com = centerMassAtOrigin(workerResult.vertices, workerResult.indices)
      const baseT = result.transform
      const pivot: TransformNR = { ...baseT, x: baseT.x + com.cx, y: baseT.y + com.cy, z: baseT.z + com.cz }

      // BUG-R8-1: Передаём normals в makeObject для корректного рендеринга
      // UX-AUDIT-6: имя файла — у объекта, как после перемотки/загрузки (rebuild: name операции)
      const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color, transform: pivot, visible: true, locked: false, vertices: workerResult.vertices, indices: workerResult.indices, normals: workerResult.normals, name: result.name })
      const op: ImportMeshOperation = { type: 'import_mesh', id, name: result.name, color, transform: baseT, vertices: result.vertices, indices: result.indices }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [id]: obj }
      // Register baked node in build tree BEFORE caching snapshot
      createBakedNode(id, workerResult.vertices, workerResult.indices, workerResult.normals, pivot)
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [id], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
    } catch (e) { set({ busy: false }); notify(i18n.t('errors.stlImportFailed') + ': ' + e, 'error') }
  },

  // ── Copy ──
  copySelected: () => {
    const { selectedIds, objects, operations, historyIndex } = get()
    const clips: ClipEntry[] = selectedIds.flatMap(id => {
      const obj = objects[id]
      if (!obj) return []
      const entry: ClipEntry = { shapeType: obj.shapeType, params: obj.params, color: obj.color, transform: obj.transform, mirrored: obj.mirrored }
      if (obj.shapeType === 'import_mesh') {
        // PERF-R8-1: Храним TypedArray вместо number[] для экономии памяти (8×)
        entry.importVertices = new Float32Array(obj.vertices)
        entry.importIndices = new Uint32Array(obj.indices)
        // UX-AUDIT-31: копия текста — тоже текст («Вставить текст», имя и строка — с собой)
        if (isTextObject(obj)) { entry.text = obj.text ?? textFromName(obj.name); entry.name = obj.name }
      } else if (obj.shapeType === 'csg') {
        // FIX (PASTE-CSG): Store CSG mesh data for paste
        entry.csgVertices = new Float32Array(obj.vertices)
        entry.csgIndices = new Uint32Array(obj.indices)
        entry.csgNormals = obj.normals ? new Float32Array(obj.normals) : undefined
        entry.csgAABB = obj.aabb ? { min: { ...obj.aabb.min }, max: { ...obj.aabb.max } } : undefined
        entry.csgOriginalBboxSize = obj.originalBboxSize ? { ...obj.originalBboxSize } : undefined
        // CSG-INDEPENDENT-COPY: снимок дерева + система создания — вставка станет
        // независимой параметрической копией. Нет дерева/системы — вставка мешем (как раньше).
        const origin = getNode(id)?.type === 'boolean'
          ? findCreationTransform(operations.slice(0, historyIndex), id)
          : null
        if (origin) entry.csgTree = { sourceRootId: id, nodes: snapshotSubtree(id), origin }
      } else if (obj.mirrored) {
        // FIX (8.5.12): mirror primitive — copy vertices (mirror baked) + mirrored flag.
        // Paste will register as baked node with vertices from clip.
        entry.mirrorVertices = new Float32Array(obj.vertices)
        entry.mirrorIndices = new Uint32Array(obj.indices)
        entry.mirrorNormals = obj.normals ? new Float32Array(obj.normals) : undefined
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
          // UX-AUDIT-31: копия текста — текст (строка и имя у объекта и шага)
          const textName = clip.name ?? 'pasted'
          const obj: SceneObject = makeObject({ id, shapeType: 'import_mesh', params: {}, color: clip.color, transform, visible: true, locked: false, vertices: result.vertices, indices: result.indices, ...(clip.text !== undefined ? { text: clip.text, name: textName } : {}) })
          const op: ImportMeshOperation = { type: 'import_mesh', id, name: clip.text !== undefined ? textName : 'pasted', color: clip.color, transform, vertices: clip.importVertices, indices: clip.importIndices, pasted: true, ...(clip.text !== undefined ? { text: clip.text } : {}) }
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
            // PASTE-CSG-RS: вершины CSG — без RS (8.5.9), полный TRS вставки — в истории
            // (иначе после перемотки/загрузки вставленный повёрнутый CSG терял поворот/масштаб)
            resultRotation: { x: transform.rotX, y: transform.rotY, z: transform.rotZ },
            resultScale: { x: transform.scaleX, y: transform.scaleY, z: transform.scaleZ },
            originalBboxSize: clip.csgOriginalBboxSize,
            treeOperation: 'union', shapeType: 'csg', color: clip.color,
            pasted: true,   // UX-AUDIT-13: в истории «Вставить CSG»
          }
          if (clip.csgTree) histOp.copyTree = clip.csgTree
          newObjects = { ...newObjects, [id]: obj }
          newOps.push(histOp)
          if (clip.csgTree) {
            // CSG-INDEPENDENT-COPY: своё дерево копии (узлы `${id}:${idИсточника}`)
            instantiateSubtree(clip.csgTree.nodes, clip.csgTree.sourceRootId, id, transform, clip.csgTree.origin)
          } else {
            // Старый буфер без дерева — запечённый меш
            createBakedNode(id, clip.csgVertices, clip.csgIndices, clip.csgNormals ?? null, transform)
          }
        } else if (clip.mirrored && clip.mirrorVertices && clip.mirrorIndices) {
          // FIX (8.5.12): Paste mirror primitive — use baked vertices (mirror baked),
          // preserve mirrored flag (multi-level mirror composition).
          const obj: SceneObject = makeObject({
            id, shapeType: clip.shapeType, params: clip.params, color: clip.color,
            transform, visible: true, locked: false,
            vertices: clip.mirrorVertices, indices: clip.mirrorIndices,
            normals: clip.mirrorNormals, mirrored: clip.mirrored,
          })
          const op: AddShapeOperation = { type: 'add_shape', id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform, pasted: true }
          newObjects = { ...newObjects, [id]: obj }
          newOps.push(op)
          // Фаза 9.8: зеркальный примитив — primitive + mirrored (params редактируемы)
          registerObjectInTree(id, obj)
        } else {
          const mesh = await workerBuildShape(id, clip.shapeType, clip.params, transform)
          const obj: SceneObject = makeObject({ id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform, visible: true, locked: false, vertices: mesh.vertices, indices: mesh.indices, normals: mesh.normals })
          const op: AddShapeOperation = { type: 'add_shape', id, shapeType: clip.shapeType, params: clip.params, color: clip.color, transform, pasted: true }
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
  csgBoolean: async (op, groups) => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    // N-ARY-CSG: union — N выбранных → ОДИН CSG с N детьми (плоско, без вложенности);
    // subtract/intersect — union(A) op union(B), группы — из режима A → B → Enter (CSG-GROUP-FIX)
    // (иначе A — первый выбранный, B — остальные; ровно 2 — прежний бинарный a op b).
    const operands = resolveCsgOperands(selectedIds, groups, objects)
    if (!operands) return
    const { ids, groupA } = operands
    const idA = ids[0]
    // Мягкий лимит: много операндов — предупреждение, операция выполняется (не блокирует)
    if (ids.length > CSG_SOFT_LIMIT) {
      notify(i18n.t('errors.csgTooMany', { count: ids.length, limit: CSG_SOFT_LIMIT }), 'warning')
    }

    // IMPORT-MESH-CSG: импортированный меш (STL, 3D-текст) допускается к CSG, если он
    // замкнут — это решает воркер (manifold построился). Незамкнутый → ошибка с маркером
    // NON_MANIFOLD → уведомление errors.csgNonManifold, объекты и история не меняются.

    const resultId = nextId('csg')
    set({ busy: true })
    try {
      const t0 = performance.now()
      // Фаза 9.5.0: общее ядро CSG (sync → boolean → pivot = transformA → un-bake RS)
      // вынесено в computeCsgResult — тем же кодом считает каскад правки прошлого шага.
      // N-ARY-CSG: computeCsgResultN — 2 операнда идут прежним бинарным путём.
      for (const id of ids) syncNodeTransform(id, objects[id].transform)
      const res = await computeCsgResultN(ids.map((id) => objects[id]), op, resultId, groupA)
      const ms = performance.now() - t0
      // UX-AUDIT-4: пустой результат (пересечение непересекающихся, вычитание «всего») —
      // невидимый объект и шаг истории не создаём: объекты не трогаем, сообщаем.
      if (res.indices.length === 0) {
        set({ busy: false, lastCsgMs: ms })
        workerDeleteObjects([resultId]).catch(() => { /* кэш воркера — best effort */ })
        notify(i18n.t('errors.csgEmpty'), 'warning')
        return
      }
      const resultTransform = res.transform

      // DIAG: CSG children — relative positions within the boolean result
      devLogCsg('children', {
        id: resultId,
        op,
        groupA,
        csgTransform: resultTransform,
        children: ids.map((id) => ({ id, abs: objects[id].transform })),
      })

      const newObj: SceneObject = { id: resultId, shapeType: 'csg', params: {}, operation: op, children: [...ids], color: objects[idA].color, transform: resultTransform, visible: true, locked: false, vertices: res.vertices, indices: res.indices, normals: res.normals, aabb: res.aabb, originalBboxSize: res.originalBboxSize }
      const newObjects = { ...objects }
      for (const id of ids) delete newObjects[id]
      newObjects[resultId] = newObj
      // Store result vertices/indices AND pivot (resultCenter/Rotation/Scale = TRS
      // операнда A, PIVOT-TRANSFORMA + CSG-PRESERVE-RS) in GroupOperation so
      // rebuildFromHistory can reconstruct the CSG result geometry at the correct position.
      const histOp: GroupOperation = groupOperationFromResult(res, ids, resultId, op, objects[idA].color, groupA)
      const newOps = [...operations.slice(0, historyIndex), histOp]
      // Ensure children are registered in build tree.
      // CSG results (shapeType='csg') and import_mesh are registered as BAKED nodes
      // (carrying their actual mesh + transform). Primitives are registered with
      // their shapeType + params for parametric rebuild.
      // Фаза 9.8: зеркальный примитив — primitive + mirrored (params редактируемы); CSG/import → baked.
      for (const id of ids) {
        if (!getNode(id) && objects[id]) registerObjectInTree(id, objects[id])
      }
      // Register CSG result as a boolean node (parametric CSG) - allows future parametric editing
      // 1. rebuildNode returns the pre-computed mesh directly (no re-extraction)
      // 2. syncObjectsForOperation routes to workerSyncMesh (correct for CSG results)
      // 3. mirror/align operations work correctly with the geometry
      // 4. Enables parametric editing in future (edit operands, operation type)
      // N-ARY-CSG: один узел, N детей (плоский список), группа A — для subtract/intersect
      createBooleanNode(resultId, op, ids, resultTransform, op === 'union' ? undefined : groupA)
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, selectedIds: [resultId], modified: true, busy: false, lastCsgMs: ms })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
      // Rebuild tree node to cache the mesh in history-tree
      rebuildNode(resultId).catch(e => console.error('[csgBoolean] rebuildNode failed:', e))
    } catch (e) {
      set({ busy: false })
      if (isNonManifoldError(e)) { notify(i18n.t('errors.csgNonManifold'), 'warning'); return }
      console.error('csgBoolean:', e); notify(i18n.t('errors.csgFailed'), 'error')
    }
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

    const newObj = liveTransformed(obj, newTransform)
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
    } catch (e) { set({ busy: false }); console.error('mirrorSelected:', e); notify(i18n.t('errors.mirrorFailed'), 'error') }
  },
  alignSelected: async (axis, anchor) => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    devLog('ALIGN:begin', { axis, anchor, selectedIds })
    if (selectedIds.length === 0) { notify('No objects selected', 'warning'); return }
    const ids = selectedIds.filter(id => objects[id])
    devLog('ALIGN:filtered', { ids, totalSelected: selectedIds.length })
    if (ids.length < 2) { devLog('ALIGN:skip', 'less than 2 objects'); return }

    // FIX (ALIGN-3): Anchor = last selected object (most recent click), not first.
    // Matches Blender/Tinkercad UX: the last clicked object is the "active" anchor.
    const anchorId = ids[ids.length - 1]
    const targetIds = ids.filter(id => id !== anchorId)
    devLog('ALIGN:anchor', { anchorId, targetIds })

    // Deltas for all OTHER objects (move them toward the anchor), world space.
    // Общий решатель с re-solve каскада правки шага (9.5.2, В2) — одна семантика.
    const deltas = solveAlignDeltas(objects, targetIds, axis, anchor, anchorId)
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
        // FIX (CSG-MIRROR-PRIMITIVE-PARAMS, Stage 8.5.10): зеркальный примитив —
        // зеркало запечено в vertices, params оригинальны → workerSyncObjects
        // (buildPrimitive из params) терял зеркало. Маршрут — workerSyncMesh.
        const isMirroredPrimitive = !!obj.mirrored
        if (isCSG || isImport || isMirroredPrimitive) {
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
      invalidateMirrorCache()
      devLog('ALIGN:done', { durationMs: performance.now() - t0, anchorId, targetIds })
    } catch (e) { set({ busy: false }); console.error('alignSelected:', e); notify(i18n.t('errors.alignFailed'), 'error') }
  },

  // ── ALIGN-PLANE-RESOLVE: выравнивание режимом «Выровнять» → шаг align с плоскостью ──
  alignToPlane: async ({ targetId, plane, anchorId, pick }) => {
    if (get().busy) return false
    const { objects, operations, historyIndex } = get()
    const obj = objects[targetId]
    if (!obj) return false
    const anchor = anchorId ? objects[anchorId] : undefined
    if (anchorId && !anchor) return false
    // плоскость A — в системе объекта A (следует за ним при правке прошлых шагов), без A — мировая;
    // грань B — в системе цели. Решение — то же, что у каскада (`solvePlaneAlignMove`).
    const a = anchor ? faceToLocal(anchor.transform, plane.normal, plane.point) : { normal: { ...plane.normal }, point: { ...plane.point } }
    const f = faceToLocal(obj.transform, pick.normal, pick.point)
    const spec: AlignPlane = {
      normal: a.normal, point: a.point,
      faces: { [targetId]: { ...f, ...(pick.triangleIndex !== undefined ? { triangleIndex: pick.triangleIndex } : {}) } },
      moves: {},
    }
    const m = solvePlaneAlignMove(objects, spec, anchorId ?? '', targetId)
    if (!m) return false
    const eps = 1e-6
    if ([m.delta.x, m.delta.y, m.delta.z, m.rotDelta.x, m.rotDelta.y, m.rotDelta.z].every((v) => Math.abs(v) < eps)) return false   // уже в плоскости
    spec.moves[targetId] = m
    const t = obj.transform
    const nt: TransformNR = {
      ...t,
      x: t.x + m.delta.x, y: t.y + m.delta.y, z: t.z + m.delta.z,
      rotX: t.rotX + m.rotDelta.x, rotY: t.rotY + m.rotDelta.y, rotZ: t.rotZ + m.rotDelta.z,
    }
    const newObjects = { ...objects, [targetId]: liveTransformed(obj, nt) }
    const op: AlignOperation = {
      type: 'align', ids: [targetId], axis: dominantAxis(plane.normal), anchor: 'min', anchorId: anchorId ?? '', deltas: {}, plane: spec,
    }
    devLog('ALIGN:plane', { op })
    const newOps = [...operations.slice(0, historyIndex), op]
    set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true })
    cacheSnapshotWithTree(newOps.length, newObjects)
    invalidateMirrorCache()
    return true
  },

  // ── Undo ──
  undo: async () => {
    if (get().busy) return
    const { historyIndex } = get()
    if (historyIndex === 0) {
      // UX-AUDIT-2: отмена «Очистить сцену» — вернуть документ целиком (история, redo, файл)
      if (canUndoClear(get())) await restoreClearedDocument()
      return
    }
    await jumpToHistoryInner(historyIndex - 1, 'undo')
  },

  // ── Redo ──
  redo: async () => {
    if (get().busy) return
    const { historyIndex, operations } = get()
    if (historyIndex >= operations.length) return
    await jumpToHistoryInner(historyIndex + 1, 'redo')
  },

  // ── Jump to history ──
  jumpToHistory: async (index) => {
    if (get().busy) return
    const { historyIndex, operations } = get()
    const newIdx = Math.max(0, Math.min(index, operations.length))
    if (newIdx === historyIndex) return
    await jumpToHistoryInner(newIdx, 'jump')
  },

  // ── Clear ──
  // UX-AUDIT-2: UI спрашивает подтверждение (ConfirmModal); документ до очистки запоминается —
  // Ctrl+Z / «Отменить» сразу после очистки возвращает его (restoreClearedDocument).
  clearScene: async () => {
    if (get().busy) return
    const { operations, historyIndex, objects, fileName, modified, currentProjectId, currentProjectName } = get()
    // пустой документ: очищать нечего — прежний снимок очистки (если есть) сохраняется
    if (operations.length === 0 && Object.keys(objects).length === 0) return
    const clearedDocument = { operations, historyIndex, fileName, modified, currentProjectId, currentProjectName }
    await workerClearAll()
    clearSnapshots()
    clearTree()
    set({ operations: [], historyIndex: 0, objects: {}, selectedIds: [], modified: false, fileName: null, lastCsgMs: null, currentProjectId: null, currentProjectName: null, clearedDocument })
    invalidateMirrorCache()
    // UX-AUDIT-1: иначе при следующем старте восстановилась бы очищенная сессия
    // (эффект автосохранения пустую историю не пишет)
    await clearAutosave()
  },

  // ── Open .3dtc ──
  openProject: async () => {
    if (get().busy) return
    const picked = await open3dtcFilePicker()
    if (!picked) return
    set({ busy: true })
    try {
      const doc = await parse3dtc(picked.buffer)
      await workerClearAll()
      clearSnapshots()
      const t0 = performance.now()
      const newObjects = doc.objects
      // DEBUG: verify CSG objects have mesh data and check children
      if (import.meta.env.DEV) {
        const csgObjs = Object.values(newObjects).filter(o => o.shapeType === 'csg')
        console.log('[loadProject] CSG objects count:', csgObjs.length)
        for (const c of csgObjs) {
          console.log(`[loadProject]  ${c.id}: tris=${c.indices.length / 3} verts=${c.vertices.length / 3} rot=${c.transform.rotX}/${c.transform.rotY}/${c.transform.rotZ} scl=${c.transform.scaleX}/${c.transform.scaleY}/${c.transform.scaleZ}`)
          const childrenOps = doc.operations.filter(op => op.type === 'group' && (op as import('../csg/types').GroupOperation).resultId === c.id)
          for (const childOp of childrenOps) {
            const g = childOp as import('../csg/types').GroupOperation
            console.log(`[loadProject]   children of ${c.id}: ids=[${g.ids.join(', ')}] hasMesh=${!!g.resultVertices?.length}`)
            for (const childId of g.ids) {
              const childObj = newObjects[childId]
              console.log(`[loadProject]   child ${childId}: shapeType=${childObj?.shapeType} tris=${childObj?.indices.length / 3} verts=${childObj?.vertices.length / 3}`)
            }
          }
        }
      }
      // remove-fillet: в старом файле объекты хранят скруглённые вершины — пересобираем из истории
      const mig = migrateLoaded(doc.operations, doc.objects)
      const ops = mig.operations
      const loadedObjects = mig.changed ? await rebuildFromHistory(ops) : newObjects
      rebuildBuildTree(ops, loadedObjects)
      loadDimensions(doc.dimensions, loadedObjects)
      set({ operations: ops, historyIndex: ops.length, objects: loadedObjects, selectedIds: [], fileName: picked.file.name, modified: false, busy: false, lastCsgMs: performance.now() - t0, currentProjectId: null, currentProjectName: null, clearedDocument: null })
      cacheSnapshotWithTree(ops.length, loadedObjects)
      invalidateMirrorCache()
    } catch (e) { set({ busy: false }); notify(i18n.t('errors.openFailed', { error: e }), 'error') }
  },

  // ── Save .3dtc ──
  saveProject: async () => {
    const { operations, historyIndex, fileName, objects } = get()
    const opsToSave = operations.slice(0, historyIndex)
    const blob = await serialize3dtc({
      objects,
      operations: opsToSave,
      operationsTrimmed: historyIndex < operations.length,
      fileName: fileName ?? undefined,
      dimensions: dimensionsToSave(objects),
    })
    downloadBlob(blob, (fileName ?? 'untitled') + (fileName?.endsWith('.3dtc') ? '' : '.3dtc'))
    set({ modified: false })
  },

  // ── Export STL ──
  exportStl: () => {
    const { objects, fileName } = get()
    // FIX (E1b): раньше downloadStl() вызывался без try/catch прямо из
    // обработчика клика — любое исключение сериализации (невалидная геометрия,
    // сцена сверх лимита треугольников) уходило наружу: файл не создан,
    // пользователю тишина. Сериализацию отделяем от скачивания и показываем
    // причину через notify (сообщение StlTooLargeError уже локализовано).
    let blob: Blob
    try {
      blob = exportToStl(Object.values(objects))
    } catch (e) {
      console.error('[Document] STL export failed:', e)
      notify(e instanceof StlTooLargeError ? e.message : i18n.t('errors.stlExportFailed'), 'error')
      return
    }
    downloadStlBlob(blob, (fileName?.replace(/\.3dtc$/, '') ?? i18n.t('app.name')) + '.stl')
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
      // FIX (CSG-MIRROR-PRIMITIVE-PARAMS, Stage 8.5.10): зеркальный примитив →
      // baked (vertices с зеркалом; params без зеркала).
      registerObjectInTree(id, obj)
    }

    // Для примитивов: обновляем params в дереве и пересобираем меш В ORIGIN.
    // Stage 7 (RESIZE-TRS-DOUBLE): раньше сюда попадали и CSG-результаты
    // (shapeType='csg', params={} — truthy!), а rebuildNode(id) возвращает меш
    // С worldTransform (для корневой ноды === localTransform), записанным в
    // vertices, при transform остался → Viewport3D применяет TRS повторно (pivot).
    // FIX (CSG-MIRROR-PRIMITIVE-PARAMS, Stage 8.5.10): зеркальный примитив
    // (mirrored) идёт в scale-ветку (как CSG): пересборка из params сбросила
    // бы зеркало — вместо этого resize только через transform.scale.
    if (obj.shapeType && obj.shapeType !== 'csg' && obj.params && !obj.mirrored) {
      const mergedParams = { ...obj.params, ...params }

      // Обновляем params в ноде дерева (иммутабельно через setNode).
      // relativeToParent и localTransform НЕ трогаем — resize меняет только params.
      const node = getNode(id)
      if (node && node.type === 'primitive') {
        setNode(id, { ...node, params: { ...mergedParams } })
      }

      set({ busy: true })
      try {
        const t0 = performance.now()
        // Stage 7: пересобираем меш В ORIGIN, а НЕ через rebuildNode(id).
        // rebuildNode возвращает mesh с запечённым worldTransform (= localTransform
        // для корневого примитива) — запись его в vertices при неизменном transform
        // даёт двойное применение TRS (RESIZE-TRS-DOUBLE). workerBuildShape с
        // нулевым transform возвращает origin-центрированный меш (примитивы
        // центрированы в origin через manifold API, §5.1) и кэширует origin-манifold
        // в worker (§6.1).
        const ZERO_TRANSFORM: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
        const mesh = await workerBuildShape(id, obj.shapeType, mergedParams, ZERO_TRANSFORM)
        const ms = performance.now() - t0

        // Anchor: resizeObject не имеет параметра anchor/anchorDelta (grep anchor →
        // только alignSelected). Текущая семантика = центральный anchor:
        // transform (включая position) НЕ меняется.
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

        // Stage 7: ветка теперь реально достижима для CSG (условие первой ветки
        // исключает shapeType='csg'; раньше CSG попадали в примитивную ветку,
        // т.к. params={} truthy). Для осей без переданного param scale сохраняем
        // текущий (иначе target=currentSize сбрасывал scale до 1).
        const targetWidth = params.width ?? currentSize.x * obj.transform.scaleX
        const targetHeight = params.height ?? currentSize.y * obj.transform.scaleY
        const targetDepth = params.depth ?? currentSize.z * obj.transform.scaleZ

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
      } catch (e) { set({ busy: false }); console.error('resizeObject (CSG):', e); notify(i18n.t('errors.resizeCsgFailed'), 'error') }
    }
  },

  // ── Правка параметров ребёнка CSG (Фаза 9.3) ──
  editChildParams: async (rootId, nodeId, patch) => {
    if (get().busy) return
    const { objects, operations, historyIndex } = get()
    const root = objects[rootId]
    if (!root) return
    // Значения не изменились — не пишем пустую правку в историю
    const curParams = getNode(nodeId)?.params as Record<string, number | undefined> | undefined
    if (curParams && Object.entries(patch).every(([k, v]) => curParams[k] === v)) return
    set({ busy: true })
    try {
      const t0 = performance.now()
      const res = await computeEditedChild({ rootId, nodeId, patch, objects, operations, historyIndex })
      if (!res.ok) {
        set({ busy: false })
        notify(i18n.t(`errors.editChild.${editFailureKey(res.reason)}`), res.reason === 'failed' ? 'error' : 'warning')
        return
      }
      const { mesh, params } = res
      // pivot (transform) корня НЕ меняется — меняются только вершины (локальная система корня)
      const newObj = makeObject({
        ...root,
        vertices: mesh.vertices,
        indices: mesh.indices,
        normals: mesh.normals,
        aabb: mesh.aabb,
        originalBboxSize: mesh.originalBboxSize,
      })
      const op: EditChildParamsOperation = {
        type: 'edit_child_params', rootId, nodeId, params,
        resultVertices: mesh.vertices, resultIndices: mesh.indices,
        resultNormals: mesh.normals ?? undefined,
        originalBboxSize: mesh.originalBboxSize,
      }
      const newOps = [...operations.slice(0, historyIndex), op]
      const newObjects = { ...objects, [rootId]: newObj }
      // Кэш воркера хранит старый меш корня — иначе следующий CSG возьмёт устаревшую геометрию
      await workerSyncMesh(rootId, newObj.vertices, newObj.indices, newObj.transform)
        .catch(e => console.warn('[editChildParams] workerSyncMesh failed:', e))
      set({ operations: newOps, historyIndex: newOps.length, objects: newObjects, modified: true, busy: false, lastCsgMs: performance.now() - t0 })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
      devLog('editChildParams', { rootId, nodeId, params })
    } catch (e) { set({ busy: false }); console.error('editChildParams:', e); notify(i18n.t('errors.editChild.failed'), 'error') }
  },

  // ── Правка прошлого шага с каскадом (Фаза 9.5.2: move, 9.5.3: mirror) ──
  editStepParams: async (stepIndex, patch) => {
    if (get().busy) return false
    const { objects, operations, historyIndex, selectedIds } = get()
    set({ busy: true })
    const t0 = performance.now()
    const prefix = operations.slice(0, historyIndex)
    try {
      const res = await computeStepEdit({ operations, historyIndex, stepIndex, patch })
      if (!res.ok) {
        // Каскад переиграл историю в воркере и дереве — вернуть текущее состояние
        if (res.reason !== 'unchanged') {
          await rebuildFromHistory(prefix).catch(e => console.warn('[editStepParams] restore failed:', e))
          rebuildBuildTree(prefix, objects)
          notify(i18n.t(`errors.editStep.${editStepFailureKey(res.reason)}`, { step: (res.failedStep ?? stepIndex) + 1 }),
            res.reason === 'failed' ? 'error' : 'warning')
        }
        set({ busy: false })
        return false
      }
      const newOps = [...prefix, res.op]
      const newObjects = await rebuildFromHistory(newOps)
      rebuildBuildTree(newOps, newObjects)
      // Выделение сохраняем (id шагов не меняются) — тот же массив, если все живы
      const alive = selectedIds.filter((id) => newObjects[id])
      set({
        operations: newOps, historyIndex: newOps.length, objects: newObjects,
        selectedIds: alive.length === selectedIds.length ? selectedIds : alive,
        modified: true, busy: false, lastCsgMs: performance.now() - t0,
      })
      cacheSnapshotWithTree(newOps.length, newObjects)
      invalidateMirrorCache()
      devLog('editStepParams', { stepIndex, patch, recomputed: res.recomputed })
      return true
    } catch (e) {
      await rebuildFromHistory(prefix).catch(() => { /* восстановление — best effort */ })
      rebuildBuildTree(prefix, objects)
      set({ busy: false })
      console.error('editStepParams:', e)
      notify(i18n.t('errors.editStep.failed', { step: stepIndex + 1 }), 'error')
      return false
    }
  },

  // ── Extrude ──
  extrudeSelected: async (axis, depth) => {
    if (get().busy) return
    const { selectedIds, objects, operations, historyIndex } = get()
    if (selectedIds.length === 0) { notify('No objects selected', 'warning'); return }
    if (selectedIds.length !== 1) return
    const id = selectedIds[0]
    const obj = objects[id]
    if (!obj) return

    // FIX (EXTRUDE-AABB, 9.5.4): рамка базы — мировая, по вершинам с полным TRS.
    // Кэш obj.aabb у примитивов локальный (сдвигается только moveObject) — объект,
    // появившийся не в начале координат (spawn x = 25, …), получал плиту у начала.
    // Плита — общая функция с пересчётом при правке шага extrude (extrudeSlab).
    const slab = extrudeSlab(worldVerticesAABB(obj.vertices, obj.transform), axis, depth)

    const slabId = nextId('slab')
    const resultId = nextId('ext')
    set({ busy: true })
    try {
      const t0 = performance.now()
      const slabT: TransformNR = slab.transform
      const slabP: ShapeParams = slab.params
      // Stage 6.5 (origin-cache convention): csgBooleanWithSync rebuilds the slab
      // from shapeB at origin and applies slabT ONE TIME. For the main object:
      // primitives are rebuilt from shapeA; CSG/import meshes are synced as-is
      // (their vertices are origin-centered; obj.transform positions them).
      const isPrim = obj.shapeType !== 'csg' && obj.shapeType !== 'import_mesh'
      if (!isPrim) {
        await workerSyncMesh(id, obj.vertices, obj.indices, obj.transform)
      }
      const resultMesh = await workerCsgBooleanWithSync(
        id, slabId, 'union', resultId, obj.transform, slabT,
        isPrim ? { shapeType: obj.shapeType, params: obj.params } : undefined,
        { shapeType: 'cube', params: slabP },
      )
      // FIX (R17-11): Clean up temporary slab from worker cache to prevent memory leak
      workerDeleteObjects([slabId]).catch(() => { })
      const ms = performance.now() - t0
      // FIX (PIVOT-TRANSFORMA, Bug 3): pivot = transformA (позиция исходного
      // объекта) — как в csgBoolean. v = v_COM + (COM − transformA) = v_world − transformA,
      // инвариант world = pivot + vertex сохраняется.
      const { cx: comX, cy: comY, cz: comZ } = centerMassAtOrigin(resultMesh.vertices, resultMesh.indices)
      const offX = comX - obj.transform.x, offY = comY - obj.transform.y, offZ = comZ - obj.transform.z
      for (let i = 0; i < resultMesh.vertices.length; i += 3) {
        resultMesh.vertices[i] += offX
        resultMesh.vertices[i + 1] += offY
        resultMesh.vertices[i + 2] += offZ
      }
      const aabb = computeAABB(resultMesh.vertices)
      const newObj: SceneObject = { id: resultId, shapeType: 'csg', params: {}, color: obj.color, transform: { x: obj.transform.x, y: obj.transform.y, z: obj.transform.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }, visible: true, locked: false, vertices: resultMesh.vertices, indices: resultMesh.indices, normals: resultMesh.normals, aabb }
      const addOp: AddShapeOperation = { type: 'add_shape', id: slabId, shapeType: 'cube', params: slabP, color: obj.color, transform: slabT }
      // Фаза 9.5.4: source — шаг правится как extrude (глубина) с каскадом
      const grpOp: GroupOperation = { type: 'group', ids: [id, slabId], resultId, resultVertices: resultMesh.vertices, resultIndices: resultMesh.indices, resultNormals: resultMesh.normals ?? undefined, resultCenter: { x: obj.transform.x, y: obj.transform.y, z: obj.transform.z }, source: { kind: 'extrude', baseId: id, slabId, axis, depth } }
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
    const { operations, historyIndex, fileName, modified, objects } = get()
    await autosaveSession(operations.slice(0, historyIndex), historyIndex, fileName, modified, dimensionsToSave(objects))
  },

  // ── Restore autosave ──
  // UX-AUDIT-1: вызывается при старте (hooks/useAutosave.ts). Текущую работу не затирает:
  // восстанавливает, только пока сцена и история пусты.
  restoreAutosave: async () => {
    if (get().busy) return false
    const entry = await restoreSession()
    if (!entry || entry.operations.length === 0) return false
    if (get().busy || get().operations.length > 0 || Object.keys(get().objects).length > 0) return false
    await workerClearAll()
    clearSnapshots()
    set({ busy: true })
    try {
      const t0 = performance.now()
      const mig = migrateLoaded(entry.operations)
      const ops = mig.operations
      const idx = mig.remapIndex(entry.historyIndex)
      const newObjects = await rebuildFromHistory(ops)
      rebuildBuildTree(ops, newObjects)
      // несохранённость — из записи (старые записи без поля: работа не в файле → «не сохранено»)
      loadDimensions(entry.dimensions, newObjects)
      set({ operations: ops, historyIndex: idx, objects: newObjects, selectedIds: [], fileName: entry.fileName, modified: entry.modified ?? true, busy: false, lastCsgMs: performance.now() - t0, clearedDocument: null })
      cacheSnapshotWithTree(idx, newObjects)
      return true
    } catch (e) { set({ busy: false }); return false }
  },

  // ── Project Manager ──
  saveToProject: async (name) => {
    const { operations, historyIndex, objects, currentProjectId, currentProjectName } = get()
    const ops = operations.slice(0, historyIndex)
    const count = Object.keys(objects).length
    // If project already has an ID, update it. Use existing name if name is empty.
    const effectiveName = name || currentProjectName || i18n.t('projectManager.untitled')
    try {
      // Check for name conflicts with other projects
      const all = await pmList()
      const conflict = all.find(p => p.name === effectiveName && p.id !== currentProjectId)
      if (conflict) {
        notify(i18n.t('errors.projectNameExists', { name: effectiveName }), 'error')
        return
      }
      if (currentProjectId) {
        await pmUpdate(currentProjectId, effectiveName, ops, count, undefined, dimensionsToSave(get().objects))
      } else {
        const meta = await pmSave(effectiveName, ops, count, undefined, dimensionsToSave(get().objects))
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
      const ops = migrateLoaded(record.operations).operations
      const newObjects = await rebuildFromHistory(ops)
      rebuildBuildTree(ops, newObjects)
      loadDimensions(record.dimensions, newObjects)
      set({ operations: ops, historyIndex: ops.length, objects: newObjects, selectedIds: [], fileName: null, modified: false, busy: false, lastCsgMs: performance.now() - t0, currentProjectId: id, currentProjectName: record.name, clearedDocument: null })
      cacheSnapshotWithTree(ops.length, newObjects)
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
