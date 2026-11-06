// ============================================================
// .3dtc format types — ZIP + JSON, vertices in origin (COM), transform = pivot
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
  | EditChildParamsOperation
  | EditStepOperation
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

/**
 * @deprecated Скругление куба удалено из приложения (remove-fillet, до инструмента на B-Rep).
 * Тип оставлен только для чтения старых `.3dtc`/`.doodle`: при загрузке такие шаги вырезаются
 * (`io/legacy-fillet.ts::migrateLegacyFillet`), воспроизведение их игнорирует. Не создавать.
 */
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

/** Плоскость зеркала. FIX (8.5.12): выделен в тип — SceneObject.mirrored теперь список. */
export type MirrorPlane = 'XY' | 'XZ' | 'YZ'

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
  /**
   * FIX (CSG-PRESERVE-RS, Stage 8.5.9): Rotation of the CSG result (= rotation
   * of operand A). Vertices are stored WITHOUT RS; the full TRS is restored on
   * rebuild. Absent in legacy documents → identity (baked-RS convention).
   */
  resultRotation?: { x: number; y: number; z: number }
  /** FIX (CSG-PRESERVE-RS): Scale of the CSG result (= scale of operand A). */
  resultScale?: { x: number; y: number; z: number }
  /** Original bbox size of the CSG result — used to compute scale relative to original dimensions */
  originalBboxSize?: { x: number; y: number; z: number }
  /** Shape type of CSG result — 'csg' for boolean operations */
  shapeType?: ShapeType
  /** Color of the CSG result — used when ids is empty (pasted CSG) */
  color?: string
  // ── BuildTree: tree structure for this CSG operation ──
  /** Operation type for tree (union/subtract/intersect) */
  treeOperation?: 'union' | 'subtract' | 'intersect'
  /**
   * Фаза 9.5.4: группа — результат extrude (пара `add_shape` плиты + эта `group`).
   * Пишет `extrudeSelected`; по нему шаг правится как extrude (глубина). `depth` —
   * исходная глубина (сырая операция не меняется; эффективная — через edit_step).
   * Старые extrude без `source` как extrude не редактируются (EXTRUDE-LEGACY).
   */
  source?: ExtrudeSource
  /**
   * CSG-INDEPENDENT-COPY: вставленный CSG (`ids: []`) со СВОИМ деревом — снимок
   * дерева источника на момент копирования. По нему дерево копии строится заново
   * при перемотке/загрузке; дети правятся (9.2/9.3) независимо от оригинала.
   * Без поля (старые вставки) — запечённый меш, как раньше.
   */
  copyTree?: CopiedTree
}

/** CSG-INDEPENDENT-COPY: снимок дерева CSG для вставки (буфер обмена → операция group). */
export interface CopiedTree {
  /** Id корня источника (узлы копии — `${idКопии}:${idУзлаИсточника}`) */
  sourceRootId: string
  /** Узлы поддерева источника (корень первым), без кэшей */
  nodes: TreeNode[]
  /**
   * Система создания дерева (TRS₀ источника): мировые трансформы детей заданы в ней,
   * вершины корня — в её локальной системе. Нужна правке ребёнка (findCreationTransform).
   */
  origin: TransformNR
}

/** Фаза 9.5.4: откуда взялась группа extrude. */
export interface ExtrudeSource {
  kind: 'extrude'
  /** Объект, который выдавили (операнд A группы) */
  baseId: string
  /** Плита-куб (`add_shape` перед группой, операнд B) */
  slabId: string
  axis: 'X' | 'Y' | 'Z'
  /** Глубина со знаком: > 0 — от грани max по оси, < 0 — от грани min */
  depth: number
}

/**
 * Фаза 9.3: правка параметров ребёнка CSG (примитива в Build Tree).
 * Хранит новые params ребёнка И готовый меш результата (как `group`):
 * воспроизведение детерминировано и не требует CSG при загрузке.
 * Вершины — в локальной системе корня (v = S⁻¹Rᵀ·(v_world − posA)), pivot корня
 * не меняется.
 */
export interface EditChildParamsOperation {
  type: 'edit_child_params'
  /** id CSG-объекта сцены (корень дерева) */
  rootId: string
  /** id узла-примитива в Build Tree */
  nodeId: string
  /** Полные новые params ребёнка */
  params: ShapeParams
  resultVertices: Float32Array | number[]
  resultIndices: Uint32Array | number[]
  resultNormals?: Float32Array | number[]
  originalBboxSize?: { x: number; y: number; z: number }
}

/**
 * Фаза 9.5: новые значения прошлого шага N — по типу шага.
 * extrude — только для `group` с `source.kind === 'extrude'` (9.5.4).
 */
export type StepPatch =
  | { kind: 'move'; delta: Vec3; rotDelta?: Vec3; scaleDelta?: Vec3 }
  | { kind: 'mirror'; plane: MirrorPlane }
  | { kind: 'extrude'; depth: number }

/** Тип шага, к которому применим патч данного вида. */
export type StepPatchKind = StepPatch['kind']

/**
 * Фаза 9.5: пересчитанный «замороженный» шаг ниже по течению от правки
 * (готовый результат — воспроизведение без CSG при загрузке, решение 1 Фазы 9).
 * Поля, которых нет, остаются как в исходной операции.
 */
export interface StepReplacement {
  /** Индекс заменяемого шага в сырой истории (меньше индекса самой edit_step) */
  stepIndex: number
  /**
   * Ожидаемый тип шага: несовпадение → замена пропускается.
   * `add_shape` — плита extrude, пересчитанная по рамке базы (9.5.4); может стоять
   * ДО правленого шага (плита — часть extrude-пары), остальные — только ниже по течению.
   */
  kind: 'group' | 'edit_child_params' | 'align' | 'add_shape'
  resultVertices?: Float32Array | number[]
  resultIndices?: Uint32Array | number[]
  resultNormals?: Float32Array | number[]
  /** group: pivot результата (= TRS операнда A на момент объединения) */
  resultCenter?: Vec3
  resultRotation?: Vec3
  resultScale?: Vec3
  originalBboxSize?: Vec3
  /** align: пересчитанные смещения (политика re-solve, решение В2) */
  deltas?: Record<string, number>
  /** add_shape (плита extrude, 9.5.4): новые размеры и положение */
  params?: ShapeParams
  transform?: TransformNR
}

/**
 * Фаза 9.5: правка параметров прошлого шага N. Append-only: `operations[N]` не
 * трогается, эффективная история строится чистой функцией `projectHistory`
 * (store/project-history.ts). Undo/redo — по индексу, как у любой операции.
 */
export interface EditStepOperation {
  type: 'edit_step'
  /** Индекс шага N в сырой истории (префикс неизменен — индекс стабилен) */
  stepIndex: number
  /** Отпечаток шага N (тип + id цели): не совпал → правка игнорируется (R7) */
  stepFingerprint: { type: TinkerCraftOperation['type']; targetId: string }
  /** Новые значения шага N */
  patch: StepPatch
  /** Прежние значения — только для подписи в Timeline / диффа (undo их не использует) */
  before?: StepPatch
  /** ОБЯЗАТЕЛЬНО (может быть пустым): пересчитанные замороженные шаги ниже по течению */
  replacements: StepReplacement[]
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
  /**
   * FIX (CSG-MIRROR-PRIMITIVE-PARAMS, Stage 8.5.10 + 8.5.12): плоскости
   * последнего зеркала для ПРИМИТИВОВ. Зеркало примитива запечено в
   * `vertices` (mirrorVerticesInPlace, 8.5.7), но `shapeType`/`params`
   * остаются оригинальными — геометрия больше НЕ равна buildPrimitive(params).
   *
   * FIX (8.5.12): массив упорядоченных плоскостей; соседние одинаковые
   * отменяются (YZ→YZ = identity). Сериализуется в .3dtc; legacy
   * документ с одним зеркалом ('XZ') нормализуется при загрузке.
   */
  mirrored?: MirrorPlane[]
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
  /**
   * NESTED-MOVED-EDIT: только boolean-узлы. TRS₀ — система, в которой лежат листья
   * поддерева (трансформ на момент создания CSG / копирования дерева). Пока узел — корень,
   * `localTransform` следует за объектом (move/rotate/scale), листья не трогаются; когда
   * узел становится вложенным, воркер переносит его результат на
   * Mat(localTransform)·Mat(originTransform)⁻¹ (сдвиг ДО объединения). Нет — старое дерево
   * (поправка не применяется).
   */
  originTransform?: TransformNR

  // ── Baked nodes (imported STL, non-manifold) ──
  /** Vertex data for baked geometry */
  vertices?: Float32Array
  /** Index data for baked geometry */
  indices?: Uint32Array
  /** Normal data for baked geometry (null = no normals) */
  normals?: Float32Array | null

  /**
   * Фаза 9.8: упорядоченный список плоскостей зеркала для ЗЕРКАЛЬНОГО ПРИМИТИВА
   * (`type: 'primitive'`, params — оригинальные). Геометрия = buildPrimitive(params),
   * отражённая по каждой плоскости в origin (до применения TRS) — как
   * `SceneObject.mirrored`. В отличие от baked-узла (вершины с зеркалом), params
   * остаются редактируемыми, а воспроизведение по истории — синхронным.
   */
  mirrored?: MirrorPlane[]

  /**
   * Mirror plane used when baking this node (Variant B fix for MIRROR-CHIRALITY).
   * Set when a primitive is converted to baked during mirror: the node's
   * vertices were reflected across this plane. Kept so that future child-edit
   * flows can rebuild geometry from params and re-apply the same mirror.
   * `undefined` — not a mirrored node (original primitive or non-mirrored baked).
   *
   * Double-mirror (same plane twice) clears this field (geometry returns to original).
   * Different planes: leave unchanged (the edit flow composes them — separate task).
   */
  mirroredPlane?: 'XY' | 'XZ' | 'YZ'

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
