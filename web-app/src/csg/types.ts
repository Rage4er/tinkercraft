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
  originalIds: string[]   // ID объектов ДО зеркалирования
  ids: string[]           // ID нового объекта(ов) после зеркалирования
  plane: 'XY' | 'XZ' | 'YZ'
}

export interface AlignOperation {
  type: 'align'
  ids: string[]
  axis: 'X' | 'Y' | 'Z'
  anchor: 'min' | 'center' | 'max'
  anchorId: string  // ID of the anchor object (last selected, the one others align to)
  deltas: Record<string, number>  // { targetId: delta } — movement for each non-anchor object
}

export interface GroupOperation {
  type: 'group'
  ids: string[]
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
  /** Shape type of CSG result — 'csg' for boolean operations */
  shapeType?: ShapeType
  /** Color of the CSG result — used when ids is empty (pasted CSG) */
  color?: string
  // ── BuildTree: tree structure for this CSG operation ──
  /** Operation type for tree (union/subtract/intersect) */
  treeOperation?: 'union' | 'subtract' | 'intersect'
}

export interface ResizeDimsOperation { type: 'resize_dims'; id: string; params: ShapeParams }
export interface RenameOperation { type: 'rename'; id: string; name: string }
export interface DeleteOperation { type: 'delete'; ids: string[] }
export interface HideShowOperation { type: 'visibility'; ids: string[]; visible: boolean }
export interface ColorOperation { type: 'color'; ids: string[]; color: string }

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
  | 'torus' | 'prism' | 'pyramid' | 'import_mesh' | 'csg'

export interface ShapeParams {
  width?: number
  height?: number
  depth?: number
  radius?: number
  segments?: number
  filletRadius?: number
  // FIX (MED-18-18): Removed index signature `[key: string]: number | undefined` —
  // ShapeParams should only accept known shape parameters for type safety.
  // Additional params (torusRadius, tubeRadius, tubeSegments, sides) are explicit.
  torusRadius?: number
  tubeRadius?: number
  tubeSegments?: number
  sides?: number
}

export interface SceneObject {
  id: string
  name?: string
  shapeType: ShapeType
  params: ShapeParams
  color: string
  /** Мировой pivot — применяется один раз при рендере/экспорте (Фаза 8) */
  transform: TransformNR
  visible: boolean
  locked: boolean
  /** Вершины ВСЕГДА в origin (центрированы по центру масс) — transform в них не запечён (Фаза 8) */
  vertices: Float32Array
  indices: Uint32Array
  normals?: Float32Array | null
  aabb?: { min: Vec3; max: Vec3 }
  originalBboxSize?: { x: number; y: number; z: number }
  /** CSG operation type — only for shapeType='csg' */
  operation?: CsgBooleanOp
  /** IDs of source objects — only for shapeType='csg' */
  children?: string[]
}

export type CsgBooleanOp = 'union' | 'subtract' | 'intersect'

// ---- BuildTree types (parameterized build tree) ----

/** Type of a build tree node */
export type TreeNodeType = 'primitive' | 'boolean' | 'baked'

/**
 * Относительный transform узла относительно родителя (Фаза 8).
 * Единственный источник истины для трансформов в Build Tree.
 * `null` — для корневых нод (TransformNR хранится как мировой pivot).
 *
 * Семантика компонентов:
 * - positionDelta — смещение позиции относительно позиции родителя
 * - rotationDelta — дельта углов (deg) относительно ротации родителя
 * - scaleRatio    — множитель масштаба относительно масштаба родителя
 *
 * Мировой transform: world = composeTransforms(parentWorld, relativeToParent)
 * Обратная операция:  relativeToParent = subtractTransform(world, parentWorld)
 * См. csg/worker-matrix.ts, web-app/ARCHITECTURE_TRANSFORMS.md §2.1
 */
export interface RelativeTransform {
  positionDelta: Vec3
  rotationDelta: Vec3
  scaleRatio: Vec3
}

/** 3D point */
export interface Point3D {
  x: number
  y: number
  z: number
}

/** Axis-aligned bounding box */
export interface BoundingBox {
  min: Point3D
  max: Point3D
}

/** Extracted mesh data from manifold */
export interface ExtractedMesh {
  vertices: Float32Array
  indices: Uint32Array
  normals?: Float32Array | null
  tris?: number
  ms?: number
}

/**
 * Node in the parameterized build tree.
 * - `primitive` (leaves): cube, sphere, cylinder, etc. with params + localTransform
 * - `boolean` (internal): union, subtract, intersect with children (exactly 2)
 * - `baked` (leaves): imported STL / non-manifold with raw vertices/indices
 */
export interface TreeNode {
  /** Unique node ID */
  id: string
  /** Node type */
  type: TreeNodeType

  // ── Primitives (tree leaves) ──
  /** Primitive shape type (cube, sphere, cylinder, ...) */
  shapeType?: ShapeType
  /** Primitive parameters (width, height, depth, radius, ...) */
  params?: ShapeParams

  // ── Transform model (Фаза 8) ──
  /**
   * ✅ ИСТОЧНИК ИСТИНЫ: transform узла относительно родителя.
   * `null` — для корневых нод. Любое изменение трансформа = изменение этого поля.
   * На Этапе 1 поле только добавлено — логика rebuild/mirror ещё читает localTransform.
   */
  relativeToParent: RelativeTransform | null
  /**
   * ⚠️ ВЫЧИСЛЯЕМЫЙ (для UI / Properties Panel / контракт с worker).
   * Не использовать как источник истины в rebuildNode (см. ARCHITECTURE_TRANSFORMS.md §1).
   * Используется primitive- и baked-нодами.
   */
  localTransform?: TransformNR

  // ── Baked nodes (imported STL, non-manifold) ──
  /** Vertex data for baked geometry */
  vertices?: Float32Array
  /** Index data for baked geometry */
  indices?: Uint32Array
  /** Normal data for baked geometry (null = no normals) */
  normals?: Float32Array | null

  // ── Boolean operations (internal nodes) ──
  /** Boolean operation type */
  operation?: 'union' | 'subtract' | 'intersect'
  /** IDs of child nodes (exactly 2 for boolean) */
  children?: string[]
  /** Parent node ID — used for O(depth) cascade cache invalidation */
  parentId?: string

  // ── Cache ──
  /** Cached rebuild result */
  cachedMesh?: ExtractedMesh
  /** Cached bounding box (invalidated together with cachedMesh) */
  cachedBBox?: BoundingBox
  /** Hash to verify cache validity */
  cacheHash?: string
}

export interface PerfMetrics {
  csgTimeMs: number
  triangleCount: number
  objectCount: number
  fps: number
}
