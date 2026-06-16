// ============================================================
// Zustand store — CaDoodleDocument с полным undo/redo
// Canonical state: operations[] + historyIndex
// Scene (objects) — производное от истории операций.
// ============================================================

import { create } from 'zustand/react'
import type {
  CaDoodleOperation, AddShapeOperation,
  SceneObject, ShapeType, ShapeParams, TransformNR, CsgBooleanOp,
} from '../csg/types'
import {
  workerBuildShape, workerCsgBoolean, workerRebuildScene,
  workerClearAll, workerDeleteObjects,
} from '../csg/worker-client'
import { parseDoodle, serializeDoodle, openDoodleFilePicker, downloadBlob } from '../io/doodle-io'

// ---- ID генератор ----
let _idCounter = 0
function nextId(prefix = 'obj'): string { return `${prefix}_${++_idCounter}` }

// ---- Цвета ----
const PALETTE = [
  '#89b4fa','#a6e3a1','#f9e2af','#cba6f7',
  '#f38ba8','#94e2d5','#fab387','#74c7ec',
]
function colorForIndex(n: number): string { return PALETTE[n % PALETTE.length] }

// ---- Типы store ----

export interface DocumentStore {
  // История операций (canonical document)
  operations: CaDoodleOperation[]
  historyIndex: number                 // текущий конец истории (для undo/redo)

  // Производная сцена
  objects: Record<string, SceneObject>

  // UI state
  selectedIds: string[]
  fileName: string | null
  modified: boolean
  busy: boolean                        // CSG в процессе
  lastCsgMs: number | null

  // ---- Actions ----
  addShape:       (shapeType: ShapeType, params?: ShapeParams) => Promise<void>
  deleteSelected: () => Promise<void>
  selectObjects:  (ids: string[], addToSelection: boolean) => void
  clearSelection: () => void
  csgBoolean:     (op: CsgBooleanOp) => Promise<void>
  undo:           () => Promise<void>
  redo:           () => Promise<void>
  clearScene:     () => Promise<void>
  openDoodle:     () => Promise<void>
  saveDoodle:     () => Promise<void>
}

// ---- Вспомогательные функции сборки сцены ----

/**
 * Применить одну операцию к текущей сцене (используется при добавлении).
 * Возвращает обновлённый объект сцены.
 */
async function applyAddOp(
  op: AddShapeOperation,
  currentObjects: Record<string, SceneObject>,
): Promise<Record<string, SceneObject>> {
  const mesh = await workerBuildShape(op.id, op.shapeType, op.params, op.transform)
  const obj: SceneObject = {
    id:         op.id,
    shapeType:  op.shapeType,
    params:     op.params,
    color:      op.color,
    transform:  op.transform,
    visible:    true,
    locked:     false,
    vertices:   mesh.vertices,
    indices:    mesh.indices,
  }
  return { ...currentObjects, [op.id]: obj }
}

/**
 * Пересобрать всю сцену из нуля по срезу истории.
 * Используется для undo/redo и загрузки файла.
 */
async function rebuildFromHistory(
  ops: CaDoodleOperation[],
  currentMeta: Record<string, Pick<SceneObject, 'color' | 'shapeType' | 'params' | 'transform'>>,
): Promise<Record<string, SceneObject>> {
  const result = await workerRebuildScene(ops)

  // Восстанавливаем метаданные (цвет и т.д.) из истории операций
  const meta: Record<string, Pick<SceneObject, 'color' | 'shapeType' | 'params' | 'transform'>> = {}
  for (const op of ops) {
    if (op.type === 'add_shape') {
      meta[op.id] = { color: op.color, shapeType: op.shapeType, params: op.params, transform: op.transform }
    }
  }
  const usedMeta = Object.keys(meta).length > 0 ? meta : currentMeta

  const objects: Record<string, SceneObject> = {}
  for (const m of result.results) {
    const info = usedMeta[m.objId]
    objects[m.objId] = {
      id:        m.objId,
      shapeType: info?.shapeType ?? 'cube',
      params:    info?.params    ?? {},
      color:     info?.color     ?? '#89b4fa',
      transform: info?.transform ?? { x:0,y:0,z:0,rotX:0,rotY:0,rotZ:0 },
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
  operations:   [],
  historyIndex: 0,
  objects:      {},
  selectedIds:  [],
  fileName:     null,
  modified:     false,
  busy:         false,
  lastCsgMs:    null,

  // ── Добавить фигуру ──
  addShape: async (shapeType, params) => {
    const state = get()
    const idx   = Object.keys(state.objects).length
    const id    = nextId('obj')
    const offset = idx * 5

    const defaultParams: ShapeParams =
      shapeType === 'sphere' || shapeType === 'cone'
        ? { radius: 12, height: 24 }
        : { width: 20, height: 20, depth: 20 }

    const transform: TransformNR = { x: offset, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 }
    const color = colorForIndex(idx)

    const op: AddShapeOperation = {
      type: 'add_shape',
      id,
      shapeType,
      params: params ?? defaultParams,
      color,
      transform,
    }

    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = await applyAddOp(op, state.objects)
      const ms = performance.now() - t0

      // Записываем в историю, обрезая redo-будущее
      const newOps = [...state.operations.slice(0, state.historyIndex), op]
      set({
        operations:   newOps,
        historyIndex: newOps.length,
        objects:      newObjects,
        modified:     true,
        busy:         false,
        lastCsgMs:    ms,
      })
    } catch (e) {
      set({ busy: false })
      console.error('addShape error:', e)
    }
  },

  // ── Удалить выбранные ──
  deleteSelected: async () => {
    const { selectedIds, objects, operations, historyIndex } = get()
    if (selectedIds.length === 0) return

    const stillPresent = selectedIds.filter(id => objects[id])
    if (stillPresent.length === 0) return

    const op: CaDoodleOperation = { type: 'delete', ids: stillPresent }
    const newObjects = { ...objects }
    for (const id of stillPresent) delete newObjects[id]

    await workerDeleteObjects(stillPresent)

    const newOps = [...operations.slice(0, historyIndex), op]
    set({
      operations:   newOps,
      historyIndex: newOps.length,
      objects:      newObjects,
      selectedIds:  [],
      modified:     true,
    })
  },

  // ── Выбор ──
  selectObjects: (ids, addToSelection) => {
    const { selectedIds } = get()
    if (addToSelection) {
      const next = new Set(selectedIds)
      for (const id of ids) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      set({ selectedIds: [...next] })
    } else {
      set({ selectedIds: ids })
    }
  },

  clearSelection: () => set({ selectedIds: [] }),

  // ── CSG булева операция ──
  csgBoolean: async (op: CsgBooleanOp) => {
    const { selectedIds, objects, operations, historyIndex } = get()
    if (selectedIds.length !== 2) return

    const [idA, idB] = selectedIds
    if (!objects[idA] || !objects[idB]) return

    const resultId = nextId('csg')
    set({ busy: true })
    try {
      const t0 = performance.now()
      const mesh = await workerCsgBoolean(idA, idB, op, resultId)
      const ms = performance.now() - t0

      const newObj: SceneObject = {
        id:        resultId,
        shapeType: 'cube',
        params:    {},
        color:     objects[idA].color,
        transform: { x:0,y:0,z:0,rotX:0,rotY:0,rotZ:0 },
        visible:   true,
        locked:    false,
        vertices:  mesh.vertices,
        indices:   mesh.indices,
      }

      const newObjects = { ...objects }
      delete newObjects[idA]
      delete newObjects[idB]
      newObjects[resultId] = newObj

      const histOp: CaDoodleOperation = {
        type: 'group',
        ids: [idA, idB],
        isHull: false,
        isIntersect: op === 'intersect',
        // Store extra info for rebuild
        ...({ subtractOp: op === 'subtract', resultId } as object),
      } as CaDoodleOperation

      const newOps = [...operations.slice(0, historyIndex), histOp]
      set({
        operations:   newOps,
        historyIndex: newOps.length,
        objects:      newObjects,
        selectedIds:  [resultId],
        modified:     true,
        busy:         false,
        lastCsgMs:    ms,
      })
    } catch (e) {
      set({ busy: false })
      console.error('csgBoolean error:', e)
    }
  },

  // ── Undo ──
  undo: async () => {
    const { historyIndex, operations, objects } = get()
    if (historyIndex === 0) return

    const newIdx  = historyIndex - 1
    const slicedOps = operations.slice(0, newIdx)
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(slicedOps, objects)
      const ms = performance.now() - t0
      set({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: ms })
    } catch (e) {
      set({ busy: false })
      console.error('undo error:', e)
    }
  },

  // ── Redo ──
  redo: async () => {
    const { historyIndex, operations, objects } = get()
    if (historyIndex >= operations.length) return

    const newIdx = historyIndex + 1
    const slicedOps = operations.slice(0, newIdx)
    set({ busy: true })
    try {
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(slicedOps, objects)
      const ms = performance.now() - t0
      set({ historyIndex: newIdx, objects: newObjects, selectedIds: [], busy: false, lastCsgMs: ms })
    } catch (e) {
      set({ busy: false })
      console.error('redo error:', e)
    }
  },

  // ── Очистить сцену ──
  clearScene: async () => {
    await workerClearAll()
    set({
      operations:   [],
      historyIndex: 0,
      objects:      {},
      selectedIds:  [],
      modified:     false,
      fileName:     null,
      lastCsgMs:    null,
    })
  },

  // ── Открыть .doodle ──
  openDoodle: async () => {
    const picked = await openDoodleFilePicker()
    if (!picked) return

    set({ busy: true })
    try {
      const doc = await parseDoodle(picked.buffer)
      await workerClearAll()
      const t0 = performance.now()
      const newObjects = await rebuildFromHistory(doc.operations, {})
      const ms = performance.now() - t0
      set({
        operations:   doc.operations,
        historyIndex: doc.operations.length,
        objects:      newObjects,
        selectedIds:  [],
        fileName:     picked.file.name,
        modified:     false,
        busy:         false,
        lastCsgMs:    ms,
      })
    } catch (e) {
      set({ busy: false })
      alert(`Ошибка открытия файла:\n${e}`)
    }
  },

  // ── Сохранить .doodle ──
  saveDoodle: async () => {
    const { operations, historyIndex, fileName } = get()
    const opsToSave = operations.slice(0, historyIndex)
    const blob = await serializeDoodle(opsToSave)
    const name = fileName ?? 'untitled.doodle'
    downloadBlob(blob, name.endsWith('.doodle') ? name : name + '.doodle')
    set({ modified: false })
  },
}))
