// ============================================================
// csg-result — общее ядро CSG (Фаза 9.5.0)
// ============================================================
//
// Вынесено из document-store.csgBoolean без изменения поведения, чтобы живое
// объединение и каскад правки прошлого шага (9.5.1+) считали результат в ОДНОЙ
// конвенции (docs/PHASE_9_5_DESIGN.md §3.2 п. 4, риск R1):
//   1. sync операндов в кэш воркера (меш для CSG/import/зеркальных, params для примитивов);
//   2. boolean в мировых координатах;
//   3. сдвиг COM → transformA: pivot = позиция операнда A (PIVOT-TRANSFORMA);
//   4. un-bake RS операнда A: v = S⁻¹Rᵀ·(v_world − posA) (CSG-PRESERVE-RS, 8.5.9);
//   5. transform результата = полный TRS операнда A.
// Запасной путь воркера (group без resultVertices) центрирует по COM — его
// каскад НЕ использует.
// ============================================================

import type {
  SceneObject, ShapeParams, ShapeType, TransformNR, Vec3, CsgBooleanOp,
  GroupOperation, StepReplacement,
} from '../csg/types'
import {
  workerCsgBoolean, workerCsgBooleanWithSync, workerSyncObjects, workerSyncMesh,
} from '../csg/worker-client'
import type { MeshResult } from '../csg/worker-handlers'
import { NON_MANIFOLD_ERROR } from '../csg/worker-handlers'
import { computeAABB, centerMassAtOrigin } from './helpers'
import { computeInverseRSMatrix, transposeRSMatrix, computeRSMatrix } from '../csg/worker-matrix'
import { devLogCsg } from '../utils/debug'
import { fmtPoint, fmtTransform } from '../utils/debug-format'

/**
 * Sync objects into worker cache before CSG/mirror operations.
 * Determines per-object whether to use workerSyncMesh (for CSG results and imported meshes)
 * or workerSyncObjects (for regular primitives), then executes both in parallel.
 *
 * @returns Array of object IDs that were synced as regular primitives (for further syncObjects call)
 */
export async function syncObjectsForOperation(
  ids: string[],
  objects: Record<string, SceneObject>,
): Promise<string[]> {
  const meshSyncs: Promise<void>[] = []
  const regularEntries: { objId: string; shapeType: ShapeType; params: ShapeParams; transform: TransformNR }[] = []

  for (const id of ids) {
    const obj = objects[id]
    if (!obj) continue
    const isImport = obj.shapeType === 'import_mesh'
    const isCSG = obj.shapeType === 'csg'
    // FIX (CSG-MIRROR-PRIMITIVE-PARAMS, Stage 8.5.10): зеркальный примитив —
    // зеркало запечено в vertices, params оригинальны → workerSyncMesh.
    const isMirroredPrimitive = !!obj.mirrored
    if (isCSG || isImport || isMirroredPrimitive) {
      // CSG result or imported mesh — sync mesh data with current transform
      meshSyncs.push(
        workerSyncMesh(id, obj.vertices, obj.indices, obj.transform).catch(e => console.warn('[syncObjectsForOperation] sync failed:', e)),
      )
    } else {
      // Regular primitive — collect for workerSyncObjects
      regularEntries.push({
        objId: id,
        shapeType: obj.shapeType as ShapeType,
        params: obj.params,
        transform: { ...obj.transform },
      })
    }
  }

  // Execute mesh syncs in parallel
  await Promise.all(meshSyncs)

  // Sync regular primitives in batch
  if (regularEntries.length > 0) {
    if (import.meta.env?.DEV) console.log(`[DIAG:syncObjectsForOperation] syncing regular primitives: ${regularEntries.map(e => e.objId).join(', ')}`)
    await workerSyncObjects(regularEntries).catch(e => console.warn('[syncObjectsForOperation] sync failed:', e))
  }

  return regularEntries.map(e => e.objId)
}

/**
 * IMPORT-MESH-CSG: CSG отклонена воркером, потому что операнд — незамкнутый
 * (non-manifold) меш (обычно импортированный STL). Маркер — `NON_MANIFOLD_ERROR`.
 */
export function isNonManifoldError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes(NON_MANIFOLD_ERROR)
}

/** Результат CSG в конвенции единого источника (вершины в локальной системе A). */
export interface CsgResult {
  vertices: Float32Array
  indices: Uint32Array
  normals: Float32Array | null
  aabb: { min: Vec3; max: Vec3 }
  originalBboxSize: Vec3
  /** Pivot результата = полный TRS операнда A */
  transform: TransformNR
}

const copyTRS = (t: TransformNR): TransformNR => ({
  x: t.x, y: t.y, z: t.z, rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ, scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ,
})

/**
 * CSG двух объектов сцены: sync в воркер → boolean → pivot = transformA → un-bake RS.
 * Побочный эффект — только кэш воркера (операнды и `resultId`); стор и дерево не трогает.
 */
export async function computeCsgResult(
  objA: SceneObject,
  objB: SceneObject,
  op: CsgBooleanOp,
  resultId: string,
): Promise<CsgResult> {
  const idA = objA.id, idB = objB.id
  // Sync ALL operands into worker cache before CSG.
  // This ensures the worker has the correct position/rotation/scale
  // for every operand, even after move/align operations.
  await syncObjectsForOperation([idA, idB], { [idA]: objA, [idB]: objB })

  const tA0 = copyTRS(objA.transform)
  const tB0 = copyTRS(objB.transform)

  devLogCsg('operandA', { id: idA, shapeType: objA.shapeType, transform: fmtTransform(objA.transform), bbox: objA.aabb ? { min: objA.aabb.min, max: objA.aabb.max } : null })
  devLogCsg('operandB', { id: idB, shapeType: objB.shapeType, transform: fmtTransform(objB.transform), bbox: objB.aabb ? { min: objB.aabb.min, max: objB.aabb.max } : null })
  devLogCsg('send', { idA, idB, op, resultId, transformA: fmtTransform(tA0), transformB: fmtTransform(tB0) })
  // Only send shapeType/params for regular primitives (not 'csg', not 'import_mesh').
  // CSG results and imports are already synced via syncObjectsForOperation → workerSyncMesh.
  // FIX (CSG-MIRROR-PRIMITIVE-PARAMS, Stage 8.5.10): зеркальный примитив
  // (mirrored) тоже НЕ пересобирается из params — syncObjectsForOperation
  // уже синхронизировал его зеркальные vertices через workerSyncMesh,
  // а handleCsgBooleanSync при shapeA=undefined использует этот кэш.
  // IMPORT-MESH-CSG: импорт — тоже меш из кэша (syncObjectsForOperation → workerSyncMesh),
  // а не примитив: раньше shapeA = { shapeType: 'import_mesh', params: {} } заставлял воркер
  // строить ЗАГЛУШКУ вместо меша STL (пока импорт отсекался по типу, это было не видно).
  const isPrim = (o: SceneObject) => o.shapeType !== 'csg' && o.shapeType !== 'import_mesh' && !o.mirrored
  const isPrimA = isPrim(objA)
  const isPrimB = isPrim(objB)
  let mesh: MeshResult
  // FIX (CSG-BOOLEAN-CSG): When both operands are CSG results, workerCsgBooleanWithSync
  // cannot rebuild them (no shapeType/params). Use workerCsgBoolean instead —
  // syncObjectsForOperation already synced the mesh data via workerSyncMesh.
  if (!isPrimA && !isPrimB) {
    mesh = await workerCsgBoolean(idA, idB, op, resultId, tA0, tB0)
  } else {
    mesh = await workerCsgBooleanWithSync(
      idA, idB, op, resultId, tA0, tB0,
      isPrimA ? { shapeType: objA.shapeType, params: objA.params } : undefined,
      isPrimB ? { shapeType: objB.shapeType, params: objB.params } : undefined,
    )
  }

  // FIX (PIVOT-TRANSFORMA, Bug 3): pivot CSG = transformA (позиция первого
  // операнда) — стандарт CAD. centerMassAtOrigin центрирует вершины по COM:
  // v_COM = v_world − COM. После сдвига на (COM − transformA):
  //   v = v_COM + (COM − transformA) = v_world − transformA
  //   world = pivot + v = transformA + (v_world − transformA) = v_world ✅
  const { cx: comX, cy: comY, cz: comZ } = centerMassAtOrigin(mesh.vertices, mesh.indices)
  const offX = comX - tA0.x, offY = comY - tA0.y, offZ = comZ - tA0.z
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    mesh.vertices[i] += offX
    mesh.vertices[i + 1] += offY
    mesh.vertices[i + 2] += offZ
  }
  // FIX (CSG-PRESERVE-RS, Stage 8.5.9): un-bake RS операнда A из вершин.
  // Worker вычисляет boolean в МИРОВЫХ координатах; вершины приводятся к
  // локальной системе A: v = S⁻¹Rᵀ·(v_world − posA); transform = полный TRS A
  // → render world = posA + R·S·v = v_world ✅ (det(R·S) > 0 — mirror использует
  // mirrorEuler + abs(scale), хиральность уже в геометрии A.)
  // Нормали: v' = M⁻¹v ⇒ n' = normalize(Mᵀn), M = R·S.
  const hasRS = tA0.rotX !== 0 || tA0.rotY !== 0 || tA0.rotZ !== 0 ||
    tA0.scaleX !== 1 || tA0.scaleY !== 1 || tA0.scaleZ !== 1
  if (hasRS) {
    const [u00, u01, u02, u10, u11, u12, u20, u21, u22] = computeInverseRSMatrix(tA0, tA0)
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const x = mesh.vertices[i], y = mesh.vertices[i + 1], z = mesh.vertices[i + 2]
      mesh.vertices[i] = u00 * x + u01 * y + u02 * z
      mesh.vertices[i + 1] = u10 * x + u11 * y + u12 * z
      mesh.vertices[i + 2] = u20 * x + u21 * y + u22 * z
    }
    if (mesh.normals) {
      const [n00, n01, n02, n10, n11, n12, n20, n21, n22] = transposeRSMatrix(tA0, tA0)
      for (let i = 0; i < mesh.normals.length; i += 3) {
        const nx = mesh.normals[i], ny = mesh.normals[i + 1], nz = mesh.normals[i + 2]
        let tx = n00 * nx + n01 * ny + n02 * nz
        let ty = n10 * nx + n11 * ny + n12 * nz
        let tz = n20 * nx + n21 * ny + n22 * nz
        const len = Math.hypot(tx, ty, tz) || 1
        tx /= len; ty /= len; tz /= len
        mesh.normals[i] = tx; mesh.normals[i + 1] = ty; mesh.normals[i + 2] = tz
      }
    }
  }
  const aabb = computeAABB(mesh.vertices)
  const originalBboxSize = { x: aabb.max.x - aabb.min.x, y: aabb.max.y - aabb.min.y, z: aabb.max.z - aabb.min.z }

  devLogCsg('center', {
    assignedLocal: fmtPoint(tA0),
    com: { x: comX, y: comY, z: comZ },
    transformA: fmtTransform(tA0),
    transformB: fmtTransform(tB0),
    centeredAabb: { min: fmtPoint(aabb.min), max: fmtPoint(aabb.max) },
  })

  return {
    vertices: mesh.vertices,
    indices: mesh.indices,
    normals: mesh.normals ?? null,
    aabb,
    originalBboxSize,
    transform: tA0,
  }
}

/** Поля результата для операции `group` (pivot, меш, габарит). */
function resultFields(r: CsgResult) {
  const t = r.transform
  return {
    resultVertices: r.vertices,
    resultIndices: r.indices,
    resultNormals: r.normals ?? undefined,
    resultCenter: { x: t.x, y: t.y, z: t.z },
    resultRotation: { x: t.rotX, y: t.rotY, z: t.rotZ },
    resultScale: { x: t.scaleX, y: t.scaleY, z: t.scaleZ },
    originalBboxSize: { ...r.originalBboxSize },
  }
}

/** Операция истории для живого объединения (то, что пишет csgBoolean). */
export function groupOperationFromResult(
  r: CsgResult, idA: string, idB: string, resultId: string, op: CsgBooleanOp, color: string,
): GroupOperation {
  return {
    type: 'group', ids: [idA, idB], resultId,
    ...resultFields(r),
    treeOperation: op, shapeType: 'csg', color,
  }
}

/** Замена замороженного шага `group` для каскада 9.5 — те же поля, что пишет csgBoolean. */
export function groupReplacementFromResult(stepIndex: number, r: CsgResult): StepReplacement {
  return { stepIndex, kind: 'group', ...resultFields(r) }
}

/**
 * Legacy-конвенция `group` без resultRotation/resultScale (extrude, документы до 8.5.9):
 * RS операнда A ЗАПЕЧЁН в вершины, pivot — только позиция A. Каскад 9.5 пересчитывает
 * такие шаги в ИХ конвенции: иначе последующие move с rotDelta (дельты эйлеровых углов
 * относительно identity) дали бы другую ориентацию.
 * world = posA + R·S·v_local = posA + v_baked ⇒ v_baked = R·S·v_local.
 */
export function bakeResultRS(r: CsgResult): CsgResult {
  const t = r.transform
  const hasRS = t.rotX !== 0 || t.rotY !== 0 || t.rotZ !== 0 || t.scaleX !== 1 || t.scaleY !== 1 || t.scaleZ !== 1
  const transform: TransformNR = { x: t.x, y: t.y, z: t.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
  if (!hasRS) return { ...r, transform }
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const vertices = new Float32Array(r.vertices.length)
  for (let i = 0; i < vertices.length; i += 3) {
    const x = r.vertices[i], y = r.vertices[i + 1], z = r.vertices[i + 2]
    vertices[i] = m00 * x + m01 * y + m02 * z
    vertices[i + 1] = m10 * x + m11 * y + m12 * z
    vertices[i + 2] = m20 * x + m21 * y + m22 * z
  }
  // Нормали: n' = normalize((R·S)⁻ᵀ·n) = normalize(R·S⁻¹·n)
  let normals: Float32Array | null = null
  if (r.normals) {
    const [i00, i01, i02, i10, i11, i12, i20, i21, i22] = computeInverseRSMatrix(t, t)  // S⁻¹Rᵀ → транспонируем
    normals = new Float32Array(r.normals.length)
    for (let i = 0; i < normals.length; i += 3) {
      const nx = r.normals[i], ny = r.normals[i + 1], nz = r.normals[i + 2]
      let tx = i00 * nx + i10 * ny + i20 * nz
      let ty = i01 * nx + i11 * ny + i21 * nz
      let tz = i02 * nx + i12 * ny + i22 * nz
      const len = Math.hypot(tx, ty, tz) || 1
      tx /= len; ty /= len; tz /= len
      normals[i] = tx; normals[i + 1] = ty; normals[i + 2] = tz
    }
  }
  const aabb = computeAABB(vertices)
  return {
    vertices, indices: r.indices, normals, aabb, transform,
    originalBboxSize: { x: aabb.max.x - aabb.min.x, y: aabb.max.y - aabb.min.y, z: aabb.max.z - aabb.min.z },
  }
}
