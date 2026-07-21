// ============================================================
// .doodle format types — full compatibility with Java TinkerCraftFile
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
  vertices: Float32Array | number[]
  indices: Uint32Array | number[]
}

export interface MoveOperation {
  type: 'move'
  ids: string[]
  delta: Vec3
  rotDelta?: Vec3
  scaleDelta?: Vec3
  /** Hint for history display — which component primarily changed */
  kind?: 'translate' | 'rotate' | 'scale'
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
  /** Vertices of the CSG result — used for rebuild from history (replaces shapeType-based reconstruction) */
  resultVertices?: Float32Array | number[]
  /** Indices of the CSG result — used for rebuild from history */
  resultIndices?: Uint32Array | number[]
  /** Normals of the CSG result */
  resultNormals?: Float32Array | number[]
  /** Center position of the CSG result — used to restore transform on rebuild (FIX CRIT-CSG-2) */
  resultCenter?: { x: number; y: number; z: number }
  /** Original bbox size of the CSG result — used to compute scale relative to original dimensions */
  originalBboxSize?: { x: number; y: number; z: number }
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
  scaleX: number; scaleY: number; scaleZ: number
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
  /** Per-vertex normals from manifold-3d (null for simple primitives without normals) */
  normals?: Float32Array | null
  /** Cached axis-aligned bounding box in local space (computed from vertices) */
  aabb?: { min: Vec3; max: Vec3 }
  /** Original bbox size for CSG results — used to compute scale relative to original dimensions */
  originalBboxSize?: { x: number; y: number; z: number }
}

export type CsgBooleanOp = 'union' | 'subtract' | 'intersect'

export interface PerfMetrics {
  csgTimeMs: number
  triangleCount: number
  objectCount: number
  fps: number
}
