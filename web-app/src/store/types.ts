// ============================================================
// Store types — DocumentStore interface
// ============================================================

import type {
  TinkerCraftOperation, SceneObject, ShapeType, ShapeParams,
  TransformNR, CsgBooleanOp,
} from '../csg/types'
import type { ClipEntry } from './helpers'

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

  // Actions
  addShape: (shapeType: ShapeType, params?: ShapeParams) => Promise<void>
  addRawMesh: (name: string, vertices: number[], indices: number[]) => Promise<void>
  importStl: () => Promise<void>
  deleteSelected: () => Promise<void>
  selectObjects: (ids: string[], add: boolean) => void
  clearSelection: () => void
  csgBoolean: (op: CsgBooleanOp) => Promise<void>
  moveObject: (id: string, transform: TransformNR) => Promise<void>
  resizeObject: (id: string, params: ShapeParams) => Promise<void>
  extrudeSelected: (axis: 'X' | 'Y' | 'Z', depth: number) => Promise<void>
  renameObject: (id: string, name: string) => void
  setColor: (id: string, color: string, skipHistory?: boolean) => void
  toggleVisible: (id: string) => void
  mirrorSelected: (plane: 'XY' | 'XZ' | 'YZ') => Promise<void>
  previewMirror: (plane: 'XY' | 'XZ' | 'YZ') => Promise<void>
  alignSelected: (axis: 'X' | 'Y' | 'Z', anchor: 'min' | 'center' | 'max') => Promise<void>
  applyFillet: (id: string, radius: number) => Promise<void>
  copySelected: () => void
  pasteClipboard: () => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  jumpToHistory: (index: number) => Promise<void>
  clearScene: () => Promise<void>
  openDoodle: () => Promise<void>
  saveDoodle: () => Promise<void>
  exportStl: () => void
  triggerAutosave: () => Promise<void>
  restoreAutosave: () => Promise<boolean>
  saveToProject: (name: string) => Promise<void>
  loadFromProject: (id: string) => Promise<void>
  setCurrentProject: (id: string | null, name?: string | null) => void
}
