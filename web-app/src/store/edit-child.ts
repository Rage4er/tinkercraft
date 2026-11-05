// ============================================================
// edit-child — правка параметров ребёнка CSG (Фаза 9.3)
// ============================================================
//
// Пересчитывает меш CSG-результата после смены params примитива в его
// Build Tree. Результат — вершины в локальной системе корня (та же конвенция,
// что у csgBoolean): v = S⁻¹Rᵀ·(v_world − pos₀), pivot (transform) НЕ меняется.
//
// Почему нужна калибровка. Дети дерева хранят мировые позиции системы СОЗДАНИЯ
// CSG (localTransform), а pivot корня после перемещений уже другой; для
// вложенных CSG, сдвинутых до объединения, дерево может не соответствовать
// мешу вовсе. Перед правкой дерево пересчитывается СО СТАРЫМИ params и
// сравнивается с текущим мешем (bbox + объём). Расхождение → правка отклоняется
// (`tree_mismatch`), а не портит геометрию.
//
// Чистая математика (unbake, объём, сравнение) вынесена отдельно — тестируется
// без WASM.
// ============================================================

import type {
  SceneObject, ShapeParams, TransformNR, TinkerCraftOperation, GroupOperation, Vec3,
} from '../csg/types'
import {
  getNode, setNode, invalidateCache, rebuildBooleanWorld,
} from '../csg/history-tree'
import { computeInverseRSMatrix, transposeRSMatrix } from '../csg/worker-matrix'
import { sanitizeParams } from '../csg/worker-handlers'
import { computeAABB } from './helpers'
import { isChildEditable } from '../csg/tree-view'
import { projectHistory } from './project-history'

export type EditChildFailure =
  | 'not_found'       // корень/узел не найден
  | 'not_editable'    // не примитив / зеркальный / запечённый
  | 'no_origin'       // нет операции group корня (нет системы создания)
  | 'tree_mismatch'   // дерево не воспроизводит текущий меш
  | 'empty'           // правка обнулила результат
  | 'failed'          // ошибка воркера

export interface EditedMesh {
  vertices: Float32Array
  indices: Uint32Array
  normals: Float32Array | null
  aabb: { min: Vec3; max: Vec3 }
  originalBboxSize: Vec3
}

export type EditChildResult =
  | { ok: true; mesh: EditedMesh; params: ShapeParams }
  | { ok: false; reason: EditChildFailure }

/** Допуск сравнения «дерево ↔ меш» (доля габарита / объёма). */
const MATCH_REL_TOL = 1e-3

// ---------------------------------------------------------------------------
// Чистая математика
// ---------------------------------------------------------------------------

/**
 * TRS₀ корня = TRS операнда A на момент создания CSG (из операции group).
 * Фаза 9.5.0: по эффективной истории — правка move операнда до объединения
 * меняет pivot результата (replacements.resultCenter/Rotation/Scale).
 */
export function findCreationTransform(
  rawOps: TinkerCraftOperation[],
  rootId: string,
): TransformNR | null {
  const ops = projectHistory(rawOps)
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]
    if (op.type !== 'group') continue
    const g: GroupOperation = op
    if (g.resultId !== rootId) continue
    // Вставленный CSG (ids: []) и legacy без resultCenter не имеют системы создания
    if (g.ids.length === 0 || !g.resultCenter) return null
    return {
      x: g.resultCenter.x, y: g.resultCenter.y, z: g.resultCenter.z,
      rotX: g.resultRotation?.x ?? 0, rotY: g.resultRotation?.y ?? 0, rotZ: g.resultRotation?.z ?? 0,
      scaleX: g.resultScale?.x ?? 1, scaleY: g.resultScale?.y ?? 1, scaleZ: g.resultScale?.z ?? 1,
    }
  }
  return null
}

/**
 * Мировые вершины/нормали системы создания → локальная система корня:
 *   v = S⁻¹Rᵀ·(v_world − pos₀),  n' = normalize(Rᵀ·S·n)-эквивалент (как csgBoolean).
 * Возвращает НОВЫЕ массивы (вход не мутируется).
 */
export function unbakeToLocal(
  worldVertices: Float32Array,
  worldNormals: Float32Array | null,
  tr0: TransformNR,
): { vertices: Float32Array; normals: Float32Array | null } {
  const vertices = new Float32Array(worldVertices.length)
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] = worldVertices[i] - tr0.x
    vertices[i + 1] = worldVertices[i + 1] - tr0.y
    vertices[i + 2] = worldVertices[i + 2] - tr0.z
  }
  let normals = worldNormals ? new Float32Array(worldNormals) : null

  const hasRS = tr0.rotX !== 0 || tr0.rotY !== 0 || tr0.rotZ !== 0 ||
    tr0.scaleX !== 1 || tr0.scaleY !== 1 || tr0.scaleZ !== 1
  if (hasRS) {
    const [u00, u01, u02, u10, u11, u12, u20, u21, u22] = computeInverseRSMatrix(tr0, tr0)
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]
      vertices[i] = u00 * x + u01 * y + u02 * z
      vertices[i + 1] = u10 * x + u11 * y + u12 * z
      vertices[i + 2] = u20 * x + u21 * y + u22 * z
    }
    if (normals) {
      const [n00, n01, n02, n10, n11, n12, n20, n21, n22] = transposeRSMatrix(tr0, tr0)
      for (let i = 0; i < normals.length; i += 3) {
        const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2]
        let tx = n00 * nx + n01 * ny + n02 * nz
        let ty = n10 * nx + n11 * ny + n12 * nz
        let tz = n20 * nx + n21 * ny + n22 * nz
        const len = Math.hypot(tx, ty, tz) || 1
        tx /= len; ty /= len; tz /= len
        normals[i] = tx; normals[i + 1] = ty; normals[i + 2] = tz
      }
    }
  }
  if (normals && normals.length !== vertices.length) normals = null
  return { vertices, normals }
}

/** Объём замкнутого меша (знаковый → abs). */
export function meshVolume(vertices: ArrayLike<number>, indices: ArrayLike<number>): number {
  let vol = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3
    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2]
    const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2]
    const cx = vertices[c], cy = vertices[c + 1], cz = vertices[c + 2]
    vol += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return Math.abs(vol / 6)
}

/** Совпадают ли два меша по габариту (bbox) и объёму в пределах допуска. */
export function meshesMatch(
  a: { vertices: Float32Array; indices: Uint32Array },
  b: { vertices: Float32Array; indices: Uint32Array },
): boolean {
  if (a.vertices.length === 0 || b.vertices.length === 0) return false
  const A = computeAABB(a.vertices)
  const B = computeAABB(b.vertices)
  const extent = Math.max(
    A.max.x - A.min.x, A.max.y - A.min.y, A.max.z - A.min.z,
    B.max.x - B.min.x, B.max.y - B.min.y, B.max.z - B.min.z,
  )
  const tol = extent * MATCH_REL_TOL + 1e-4
  const close = (p: number, q: number) => Math.abs(p - q) <= tol
  if (!(close(A.min.x, B.min.x) && close(A.min.y, B.min.y) && close(A.min.z, B.min.z) &&
    close(A.max.x, B.max.x) && close(A.max.y, B.max.y) && close(A.max.z, B.max.z))) return false
  const va = meshVolume(a.vertices, a.indices)
  const vb = meshVolume(b.vertices, b.indices)
  return Math.abs(va - vb) <= Math.max(va, vb) * MATCH_REL_TOL * 5 + 1e-6
}

// ---------------------------------------------------------------------------
// Пересчёт
// ---------------------------------------------------------------------------

/** Ключ i18n `errors.editChild.*` для причины отказа. */
export function editFailureKey(reason: EditChildFailure): string {
  switch (reason) {
    case 'not_found': return 'notFound'
    case 'not_editable': return 'notEditable'
    case 'no_origin': return 'noOrigin'
    case 'tree_mismatch': return 'treeMismatch'
    case 'empty': return 'empty'
    default: return 'failed'
  }
}

/**
 * Дерево со СТАРЫМИ params воспроизводит текущий меш корня? (без мутаций)
 * Бросает исключение при ошибке воркера — вызывающий решает, как его трактовать.
 */
async function treeMatchesMesh(rootId: string, root: SceneObject, tr0: TransformNR): Promise<boolean> {
  const world = await rebuildBooleanWorld(rootId)
  const local = unbakeToLocal(world.vertices, null, tr0)
  return meshesMatch(
    { vertices: local.vertices, indices: world.indices },
    { vertices: root.vertices, indices: root.indices },
  )
}

/**
 * Согласованность КОРНЯ: воспроизводит ли дерево со старыми params текущий меш (Фаза 9.9).
 * Свойство корня, а не узла — один вызов воркера на корень; результат делится между детьми.
 * null — согласован; иначе 'not_found' | 'no_origin' | 'tree_mismatch' | 'failed'.
 */
export async function checkRootConsistency(args: {
  rootId: string
  objects: Record<string, SceneObject>
  operations: TinkerCraftOperation[]
  historyIndex: number
}): Promise<EditChildFailure | null> {
  const { rootId, objects, operations, historyIndex } = args
  const root = objects[rootId]
  const rootNode = getNode(rootId)
  if (!root || root.shapeType !== 'csg' || !rootNode || rootNode.type !== 'boolean') return 'not_found'
  const tr0 = findCreationTransform(operations.slice(0, historyIndex), rootId)
  if (!tr0) return 'no_origin'
  try {
    return (await treeMatchesMesh(rootId, root, tr0)) ? null : 'tree_mismatch'
  } catch {
    return 'failed'
  }
}

/**
 * Можно ли править узел сейчас (Фаза 9.9): null — можно, иначе причина.
 * Те же проверки, что в computeEditedChild, но без правки (только калибровка).
 */
export async function checkChildEditable(args: {
  rootId: string
  nodeId: string
  objects: Record<string, SceneObject>
  operations: TinkerCraftOperation[]
  historyIndex: number
}): Promise<EditChildFailure | null> {
  const { rootId, nodeId, objects } = args
  const root = objects[rootId]
  if (!root || root.shapeType !== 'csg' || getNode(rootId)?.type !== 'boolean' || !getNode(nodeId)) return 'not_found'
  if (!isChildEditable(nodeId).editable) return 'not_editable'
  return checkRootConsistency(args)
}

/** Допустимые к правке params примитива (только известные числовые поля). */
function mergeParams(base: ShapeParams, patch: ShapeParams): ShapeParams {
  const merged: ShapeParams = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      ;(merged as Record<string, number>)[k] = v
    }
  }
  return merged
}

/**
 * Пересчитать меш CSG-корня после смены params ребёнка.
 * Побочный эффект: при успехе узел дерева ЗАМЕНЁН (setNode, новая копия params)
 * и кэши инвалидированы; при любой неудаче дерево возвращается как было.
 * Вызывающий коммитит результат в историю.
 */
export async function computeEditedChild(args: {
  rootId: string
  nodeId: string
  patch: ShapeParams
  objects: Record<string, SceneObject>
  operations: TinkerCraftOperation[]
  historyIndex: number
}): Promise<EditChildResult> {
  const { rootId, nodeId, patch, objects, operations, historyIndex } = args

  const root = objects[rootId]
  const rootNode = getNode(rootId)
  const node = getNode(nodeId)
  if (!root || root.shapeType !== 'csg' || !rootNode || rootNode.type !== 'boolean' || !node) {
    return { ok: false, reason: 'not_found' }
  }
  if (!isChildEditable(nodeId).editable || !node.params) {
    return { ok: false, reason: 'not_editable' }
  }

  const tr0 = findCreationTransform(operations.slice(0, historyIndex), rootId)
  if (!tr0) return { ok: false, reason: 'no_origin' }

  const oldNode = node
  const newParams = mergeParams(node.params, sanitizeParams(patch as Record<string, unknown>))

  try {
    // 1. Калибровка: дерево со СТАРЫМИ params обязано воспроизвести текущий меш.
    if (!(await treeMatchesMesh(rootId, root, tr0))) {
      return { ok: false, reason: 'tree_mismatch' }
    }

    // 2. Новая копия узла (снимки дерева хранят ссылки — params неизменяемы).
    setNode(nodeId, { ...node, params: newParams, cachedMesh: undefined, cacheHash: undefined, cachedBBox: undefined })
    invalidateCache(nodeId)
    const newWorld = await rebuildBooleanWorld(rootId)
    if (newWorld.vertices.length < 9 || newWorld.indices.length < 3) {
      setNode(nodeId, oldNode)
      invalidateCache(nodeId)
      return { ok: false, reason: 'empty' }
    }

    // 3. В локальную систему корня.
    const { vertices, normals } = unbakeToLocal(newWorld.vertices, newWorld.normals ?? null, tr0)
    const aabb = computeAABB(vertices)
    const originalBboxSize: Vec3 = {
      x: aabb.max.x - aabb.min.x,
      y: aabb.max.y - aabb.min.y,
      z: aabb.max.z - aabb.min.z,
    }
    return {
      ok: true,
      params: newParams,
      mesh: { vertices, indices: new Uint32Array(newWorld.indices), normals, aabb, originalBboxSize },
    }
  } catch (e) {
    console.error('[edit-child] recompute failed:', e)
    setNode(nodeId, oldNode)
    invalidateCache(nodeId)
    return { ok: false, reason: 'failed' }
  }
}
