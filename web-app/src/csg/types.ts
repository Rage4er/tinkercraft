// ============================================================
// Типы формата .doodle — полное соответствие Java TinkerCraftFile
// ============================================================

export interface TinkerCraftFile {
  version: string
  operations: TinkerCraftOperation[]
  thumbnail?: string // base64 PNG
}

export type TinkerCraftOperation =
  | AddShapeOperation
  | MoveOperation
  | ResizeOperation
  | FilletOperation
  | MirrorOperation
  | AlignOperation
  | GroupOperation
  | DeleteOperation
  | HideShowOperation
  | ColorOperation

export type OperationType =
  | 'add_shape' | 'move' | 'resize' | 'fillet'
  | 'mirror'   | 'align' | 'group' | 'delete'
  | 'visibility' | 'color'

export interface AddShapeOperation {
  type: 'add_shape'
  id: string
  shapeType: ShapeType
  params: ShapeParams
  color: string        // hex #rrggbb
  transform: TransformNR
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
}

export interface GroupOperation {
  type: 'group'
  ids: string[]
  isHull: boolean
  isIntersect: boolean
  subtractOp?: boolean   // true если это subtract (A − B)
  resultId?: string      // id результирующего объекта (для rebuild)
}

export interface DeleteOperation   { type: 'delete';     ids: string[] }
export interface HideShowOperation { type: 'visibility'; ids: string[]; visible: boolean }
export interface ColorOperation    { type: 'color';      ids: string[]; color: string }

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
  | 'torus' | 'prism' | 'pyramid'

export interface ShapeParams {
  width?:  number   // мм
  height?: number
  depth?:  number
  radius?: number
  segments?: number
  [key: string]: number | undefined
}

// ---- Внутреннее состояние сцены (runtime, не сохраняется) ----

export interface SceneObject {
  id: string
  shapeType: ShapeType
  params: ShapeParams
  color: string
  transform: TransformNR
  visible: boolean
  locked: boolean
  // Serialized manifold mesh для рендера
  vertices: Float32Array
  indices: Uint32Array
}

export type CsgBooleanOp = 'union' | 'subtract' | 'intersect'

// ---- Результаты замеров производительности (Фаза 0) ----
export interface PerfMetrics {
  csgTimeMs: number
  triangleCount: number
  objectCount: number
  fps: number
}
