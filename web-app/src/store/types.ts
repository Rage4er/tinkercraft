// ============================================================
// Store types — DocumentStore interface
// ============================================================

import type {
  TinkerCraftOperation, SceneObject, ShapeType, ShapeParams,
  TransformNR, CsgBooleanOp, StepPatch,
} from '../csg/types'
import type { ClipEntry } from './helpers'

/**
 * UX-AUDIT-2: документ до «Очистить сцену» — первая отмена после очистки возвращает его.
 * Действует, пока после очистки ничего не сделано (история пуста).
 */
export interface ClearedDocument {
  operations: TinkerCraftOperation[]
  historyIndex: number
  fileName: string | null
  modified: boolean
  currentProjectId: string | null
  currentProjectName: string | null
}

export interface DocumentStore {
  operations: TinkerCraftOperation[]
  historyIndex: number
  objects: Record<string, SceneObject>
  selectedIds: string[]
  clipboard: ClipEntry[]
  fileName: null | string
  modified: boolean
  busy: boolean
  lastCsgMs: null | number

  currentProjectId: string | null
  currentProjectName: string | null
  /** UX-AUDIT-2: что вернёт отмена очистки сцены (null — очистки не было / уже неактуально) */
  clearedDocument: ClearedDocument | null

  // Actions
  addShape: (shapeType: ShapeType, params?: ShapeParams) => Promise<void>
  /** Меш 3D-текста (`text` — исходная строка, UX-AUDIT-31) */
  addRawMesh: (name: string, vertices: number[], indices: number[], text?: string) => Promise<void>
  importStl: () => Promise<void>
  deleteSelected: () => Promise<void>
  selectObjects: (ids: string[], add: boolean) => void
  clearSelection: () => void
  csgBoolean: (op: CsgBooleanOp) => Promise<void>
  moveObject: (id: string, transform: TransformNR) => Promise<void>
  resizeObject: (id: string, params: ShapeParams) => Promise<void>
  /** Фаза 9.3: правка params ребёнка CSG (примитива в Build Tree) → пересчёт меша корня. */
  editChildParams: (rootId: string, nodeId: string, params: ShapeParams) => Promise<void>
  /** Фаза 9.5.2: правка прошлого шага (сырой индекс) с каскадом CSG/align; true — правка записана */
  editStepParams: (stepIndex: number, patch: StepPatch) => Promise<boolean>
  extrudeSelected: (axis: 'X' | 'Y' | 'Z', depth: number) => Promise<void>
  renameObject: (id: string, name: string) => void
  setColor: (id: string, color: string, skipHistory?: boolean) => void
  toggleVisible: (id: string) => void
  mirrorSelected: (plane: 'XY' | 'XZ' | 'YZ') => Promise<void>
  previewMirror: (plane: 'XY' | 'XZ' | 'YZ') => Promise<void>
  alignSelected: (axis: 'X' | 'Y' | 'Z', anchor: 'min' | 'center' | 'max') => Promise<void>
  copySelected: () => void
  pasteClipboard: () => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  jumpToHistory: (index: number) => Promise<void>
  clearScene: () => Promise<void>
  openProject: () => Promise<void>
  saveProject: () => Promise<void>
  exportStl: () => void
  triggerAutosave: () => Promise<void>
  restoreAutosave: () => Promise<boolean>
  saveToProject: (name: string) => Promise<void>
  loadFromProject: (id: string) => Promise<void>
  setCurrentProject: (id: string | null, name?: string | null) => void
}
