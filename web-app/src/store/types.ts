// ============================================================
// Store types — DocumentStore interface
// ============================================================

import type {
  TinkerCraftOperation, SceneObject, ShapeType, ShapeParams,
  TransformNR, CsgBooleanOp, StepPatch, Vec3,
} from '../csg/types'
import type { ClipEntry } from './helpers'
import type { CsgGroups } from './csg-operands'

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
  /** `at` — мировой трансформ фигуры (режим размещения, PLUG-AND-PLAY); без него — рядом с прошлыми */
  addShape: (shapeType: ShapeType, params?: ShapeParams, at?: TransformNR) => Promise<void>
  /** Меш 3D-текста (`text` — исходная строка, UX-AUDIT-31) */
  addRawMesh: (name: string, vertices: number[], indices: number[], text?: string) => Promise<void>
  importStl: () => Promise<void>
  deleteSelected: () => Promise<void>
  selectObjects: (ids: string[], add: boolean) => void
  clearSelection: () => void
  /**
   * N-ARY-CSG: union — N операндов → один CSG; subtract/intersect — union(A) op union(B).
   * Операнды — `resolveCsgOperands(selectedIds, groups)`: группы A/B (режим A → B → Enter,
   * `csg-group-mode.ts`, CSG-GROUP-FIX) либо «первый выбранный против остальных».
   */
  csgBoolean: (op: CsgBooleanOp, groups?: CsgGroups) => Promise<void>
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
  /**
   * ALIGN-PLANE-RESOLVE: выровнять грань B объекта `targetId` в плоскость A (мировая; `anchorId` —
   * объект грани A, без него — плоскость по оси) — шаг `align` с плоскостью: правка прошлого шага
   * пересчитывает выравнивание. `true` — шаг записан (`false` — уже в плоскости, занято, нет объекта).
   */
  alignToPlane: (args: {
    targetId: string
    plane: { normal: Vec3; point: Vec3 }
    anchorId?: string
    pick: { normal: Vec3; point: Vec3; triangleIndex?: number }
  }) => Promise<boolean>
  copySelected: () => void
  pasteClipboard: () => Promise<void>
  undo: () => Promise<void>
  redo: () => Promise<void>
  jumpToHistory: (index: number) => Promise<void>
  clearScene: () => Promise<void>
  openProject: () => Promise<void>
  saveProject: () => Promise<void>
  exportStl: () => void
  /** FORMATS-OBJ-3MF-GLTF: экспорт сцены в формат (STL — `exportStl`) */
  exportMesh: (format: import('../io/mesh-formats').ExportFormat) => Promise<void>
  triggerAutosave: () => Promise<void>
  restoreAutosave: () => Promise<boolean>
  saveToProject: (name: string) => Promise<void>
  loadFromProject: (id: string) => Promise<void>
  setCurrentProject: (id: string | null, name?: string | null) => void
}
