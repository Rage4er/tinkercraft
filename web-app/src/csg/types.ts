// ============================================================
// Типы формата .doodle — полное соответствие Java TinkerCraftFile
// ============================================================

export interface TinkerCraftFile {
  version: string
  operations: TinkerCraftOperation[]
  thumbnail?: string
}

export type TinkerCraftOperation =
  | AddShapeOperation
  | ImportMeshOperation
  | MoveOperation
  | ResizeOperation
  | ResizeDimsOperation
  | FilletOperation
  | MirrorOperation
  | AlignOperation
  | GroupOperation
  | DeleteOperation
  | HideShowOperation
  | ColorOperation
  | RenameOperation

export interface AddShapeOperation {
  type: 'add_shape'
  id: string
  shapeType: ShapeType
  params: ShapeParams
  color: string
  transform: TransformNR
}

/** Импортированный STL/OBJ меш — хранит сырые вершины в истории */
export interface ImportMeshOperation {
  type: 'import_mesh'
  id: string
  name: string
  color: string
  transform: TransformNR
  vertices: number[]
  indices: number[]
}

export interface MoveOperation {
  type: 'move'
  ids: string[]
  delta: Vec3
}

export interface ResizeOperation {
  type: 'resize'
  ids: string[]
  scale: Vec3
  anchor: AnchorPoint
}

export interface FilletOperation {
  type: 'fillet'
  id: string
  radius: number
}

export interface MirrorOperation {
  type: 'mirror'
  ids: string[]
  plane: 'XY' | 'XZ' | 'YZ'
}

export interface AlignOperation {
  type: 'align'
  ids: string[]
  axis: 'X' | 'Y' | 'Z'
  anchor: 'min' | 'center' | 'max'
  deltas?: Record<string, number>
}

export interface GroupOperation {
  type: 'group'
  ids: string[]
  isHull: boolean
  isIntersect: boolean
  subtractOp?: boolean
  resultId?: string
}

export interface ResizeDimsOperation { type: 'resize_dims'; id: string; params: ShapeParams }
export interface RenameOperation     { type: 'rename';      id: string; name: string }
export interface DeleteOperation     { type: 'delete';      ids: string[] }
export interface HideShowOperation   { type: 'visibility';  ids: string[]; visible: boolean }
export interface ColorOperation      { type: 'color';       ids: string[]; color: string }

// ---- Вспомогательные типы ----

export interface Vec3 { x: number; y: number; z: number }

export interface TransformNR {
  x: number; y: number; z: number
  rotX: number; rotY: number; rotZ: number
}

export type AnchorPoint =
  | 'min-x' | 'center-x' | 'max-x'
  | 'min-y' | 'center-y' | 'max-y'
  | 'min-z' | 'center-z' | 'max-z'
  | 'center'

export type ShapeType =
  | 'cube' | 'sphere' | 'cylinder' | 'cone'
  | 'torus' | 'prism' | 'pyramid' | 'import_mesh'

export interface ShapeParams {
  width?:       number
  height?:      number
  depth?:       number
  radius?:      number
  segments?:    number
  filletRadius?: number
  [key: string]: number | undefined
}

export interface SceneObject {
  id: string
  name?: string
  shapeType: ShapeType
  params: ShapeParams
  color: string
  transform: TransformNR
  visible: boolean
  locked: boolean
  vertices: Float32Array
  indices: Uint32Array
}

export type CsgBooleanOp = 'union' | 'subtract' | 'intersect'

export interface PerfMetrics {
  csgTimeMs: number
  triangleCount: number
  objectCount: number
  fps: number
}
