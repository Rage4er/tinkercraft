// ============================================================
// CSG VERTEX DISTANCE TEST — воспроизведение бага «сдвиг при Union»
// ============================================================
//
// Сценарий: куб и призма с заданными трансформами, CSG Union.
// Задача: найти две ближайшие вершины (одна от куба, одна от призмы)
// ДО union → вычислить расстояние → выполнить union → найти те же
// вершины в CSG-результате → сравнить расстояние.
//
// Если расстояние изменилось > 1e-6 — БАГ.
//
// Независимая реализация applyTRS (НЕ использует worker-matrix):
// — полная матрица T·R·S с Euler XYZ (степени → радианы)
// — проверяем геометрию без «кода против кода»
//
// Транспорт: worker-bridge (наст. manifold-3d WASM в-process)
// ============================================================

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Мост подменяет только транспорт Worker (в jsdom его нет).
// Вызываются НАСТОЯЩИЕ worker-handlers с НАСТОЯЩИМ manifold-3d WASM.
vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerApplyFillet: bridge.workerApplyFillet,
    workerBuildImportedMesh: bridge.workerBuildImportedMesh,
    workerSyncObjects: bridge.workerSyncObjects,
    workerSyncMesh: bridge.workerSyncMesh,
    workerCsgBoolean: bridge.workerCsgBoolean,
    workerCsgBooleanWithSync: bridge.workerCsgBooleanWithSync,
    workerMirrorObject: bridge.workerMirrorObject,
    workerRebuildScene: bridge.workerRebuildScene,
    workerDeleteObjects: bridge.workerDeleteObjects,
    workerClearAll: bridge.workerClearAll,
    workerRebuildNode: bridge.workerRebuildNode,
    isWorkerReady: bridge.isWorkerReady,
    disposeWorker: bridge.disposeWorker,
  }
})

import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, getNode } from '../csg/history-tree'
import { workerClearAll } from '../csg/worker-client'
import type { SceneObject, TransformNR } from '../csg/types'

// ============================================================
// Независимая реализация applyTRS
// ============================================================

interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * Независимая функция TRS-трансформации вершины.
 * НЕ использует worker-matrix.ts — чистая математика.
 *
 * Порядок: world = T × R × S × (v − origin)
 * Rotation: Euler XYZ intrinsic (R = Rx · Ry · Rz)
 * Scale: diagonal (Sx, Sy, Sz)
 * Translation: (tx, ty, tz)
 *
 * origin — точка, вокруг которой применяется RS (spawn для примитивов,
 * origin 0 для CSG).
 */
function applyTRS(
  v: Vec3,
  t: TransformNR,
  origin: Vec3 = { x: 0, y: 0, z: 0 },
): Vec3 {
  // 1) Переводим в локальную систему (вычитаем origin/spawn)
  let x = v.x - origin.x
  let y = v.y - origin.y
  let z = v.z - origin.z

  // 2) Scale
  x *= t.scaleX
  y *= t.scaleY
  z *= t.scaleZ

  // 3) Rotation — Euler XYZ intrinsic (R = Rx·Ry·Rz, applied to column vectors)
  //    For column vector: Rz applied first, then Ry, then Rx
  const rx = t.rotX * (Math.PI / 180)
  const ry = t.rotY * (Math.PI / 180)
  const rz = t.rotZ * (Math.PI / 180)

  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const cz = Math.cos(rz)
  const sz = Math.sin(rz)

  // Rz first
  const x1 = x * cz - y * sz
  const y1 = x * sz + y * cz
  const z1 = z

  // Ry second
  const x2 = x1 * cy + z1 * sy
  const y2 = y1
  const z2 = -x1 * sy + z1 * cy

  // Rx third
  const x3 = x2
  const y3 = y2 * cx - z2 * sx
  const z3 = y2 * sx + z2 * cx

  // 4) Translation
  return {
    x: x3 + t.x,
    y: y3 + t.y,
    z: z3 + t.z,
  }
}

/** Расстояние между двумя точками */
function dist(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Найти пару ближайших вершин из двух наборов */
function findClosestPair(
  vertsA: Vec3[],
  vertsB: Vec3[],
): { a: Vec3; b: Vec3; d: number } | null {
  let minD = Infinity
  let bestA: Vec3 | null = null
  let bestB: Vec3 | null = null
  for (const a of vertsA) {
    for (const b of vertsB) {
      const d = dist(a, b)
      if (d < minD) {
        minD = d
        bestA = a
        bestB = b
      }
    }
  }
  if (!bestA || !bestB) return null
  return { a: bestA, b: bestB, d: minD }
}

/** Найти вершину в наборе, ближайшую к заданной точке */
function findNearest(verts: Vec3[], target: Vec3): { vertex: Vec3; d: number } {
  let minD = Infinity
  let best: Vec3 = { x: 0, y: 0, z: 0 }
  for (const v of verts) {
    const d = dist(v, target)
    if (d < minD) {
      minD = d
      best = v
    }
  }
  return { vertex: best, d: minD }
}

/** Конвертировать Float32Array в Vec3[] */
function toVec3Array(verts: Float32Array): Vec3[] {
  const result: Vec3[] = []
  for (let i = 0; i < verts.length; i += 3) {
    result.push({ x: verts[i], y: verts[i + 1], z: verts[i + 2] })
  }
  return result
}

/** BBox набора точек */
function bbox(verts: Vec3[]) {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const v of verts) {
    if (v.x < minX) minX = v.x
    if (v.y < minY) minY = v.y
    if (v.z < minZ) minZ = v.z
    if (v.x > maxX) maxX = v.x
    if (v.y > maxY) maxY = v.y
    if (v.z > maxZ) maxZ = v.z
  }
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } }
}

// ============================================================
// Тест
// ============================================================

describe('CSG VERTEX DISTANCE — bug reproduction (cube + prism union)', () => {
  beforeEach(async () => {
    useDocumentStore.setState({
      objects: {},
      operations: [],
      historyIndex: 0,
      selectedIds: [],
      busy: false,
    })
    clearTree()
    clearSnapshots()
    await workerClearAll()
  }, 30000)

  it('Куб + Призма: расстояние между ближайшими вершинами ДО и ПОСЛЕ union', async () => {
    // ── 1. Параметры из скриншотов ──
    const cubeTransform: TransformNR = {
      x: 20, y: -20, z: 20,
      rotX: 45, rotY: 45, rotZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    }
    const prismTransform: TransformNR = {
      x: 20, y: 20, z: 20,
      rotX: 45, rotY: 0, rotZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    }

    // ── 2. Создать объекты через store ──
    await useDocumentStore.getState().addShape('cube', { width: 20, height: 20, depth: 20 })
    await useDocumentStore.getState().addShape('prism', { radius: 12, height: 20, sides: 3 })

    const objects = useDocumentStore.getState().objects
    const cubeId = Object.keys(objects).find(
      id => objects[id].shapeType === 'cube',
    )!
    const prismId = Object.keys(objects).find(
      id => objects[id].shapeType === 'prism',
    )!

    // ── 3. Переместить в целевые позиции ──
    await useDocumentStore.getState().moveObject(cubeId, cubeTransform)
    await useDocumentStore.getState().moveObject(prismId, prismTransform)

    const cube = objects[cubeId]
    const prism = objects[prismId]

    // ── 4. Считать spawn-позиции (из add_shape операции) ──
    const operations = useDocumentStore.getState().operations
    const cubeOp = operations.find(o => o.type === 'add_shape' && o.id === cubeId) as
      { transform: TransformNR } | undefined
    const prismOp = operations.find(o => o.type === 'add_shape' && o.id === prismId) as
      { transform: TransformNR } | undefined

    const cubeSpawn = cubeOp?.transform ?? { x: 0, y: 0, z: 0 }
    const prismSpawn = prismOp?.transform ?? { x: 0, y: 0, z: 0 }

    // ── 5. Вычислить мировые вершины (независимая applyTRS) ──
    const cubeWorld = toVec3Array(cube.vertices).map(v =>
      applyTRS(v, cubeTransform, cubeSpawn),
    )
    const prismWorld = toVec3Array(prism.vertices).map(v =>
      applyTRS(v, prismTransform, prismSpawn),
    )

    // ── 6. Найти ближайшие вершины ДО union ──
    const closestBefore = findClosestPair(cubeWorld, prismWorld)
    expect(closestBefore).toBeTruthy()

    console.log('\n=== CSG VERTEX DISTANCE TEST ===')
    console.log('1. Контекст')
    console.log('   Cube spawn:', JSON.stringify(cubeSpawn))
    console.log('   Cube transform:', JSON.stringify(cubeTransform))
    console.log('   Prism spawn:', JSON.stringify(prismSpawn))
    console.log('   Prism transform:', JSON.stringify(prismTransform))
    console.log('   Cube vertices:', cube.vertices.length / 3)
    console.log('   Prism vertices:', prism.vertices.length / 3)
    console.log('')
    console.log('2. До union')
    console.log('   Cube closest vertex:', JSON.stringify(closestBefore!.a))
    console.log('   Prism closest vertex:', JSON.stringify(closestBefore!.b))
    console.log('   Distance:', closestBefore!.d.toFixed(6))
    console.log('')

    const distBefore = closestBefore!.d

    // ── 7. Выполнить CSG Union ──
    useDocumentStore.getState().selectObjects([cubeId, prismId], false)
    await useDocumentStore.getState().csgBoolean('union')

    const objectsAfter = useDocumentStore.getState().objects
    const csgId = Object.keys(objectsAfter).find(
      id => objectsAfter[id].shapeType === 'csg',
    )!
    const csg = objectsAfter[csgId]

    // ── 8. Мировые вершины CSG (COM-центрированы, spawn=0) ──
    const csgWorld = toVec3Array(csg.vertices).map(v =>
      applyTRS(v, csg.transform, { x: 0, y: 0, z: 0 }),
    )

    // ── 9. Найти вершины в CSG, ближайшую к каждой из оригинальных ──
    const nearestToCube = findNearest(csgWorld, closestBefore!.a)
    const nearestToPrism = findNearest(csgWorld, closestBefore!.b)

    // ── 10. Расстояние между найденными вершинами в CSG ──
    const distAfter = dist(nearestToCube.vertex, nearestToPrism.vertex)

    console.log('3. CSG результат')
    console.log('   csgId:', csgId)
    console.log('   csg.transform:', JSON.stringify(csg.transform))
    console.log('   CSG vertices:', csg.vertices.length / 3)
    console.log('')
    console.log('4. После union')
    console.log('   CSG nearest to cube vertex:', JSON.stringify(nearestToCube.vertex))
    console.log('   CSG nearest to prism vertex:', JSON.stringify(nearestToPrism.vertex))
    console.log('   Distance after:', distAfter.toFixed(6))
    console.log('')
    console.log('5. Сравнение')
    console.log('   Distance before:', distBefore.toFixed(6))
    console.log('   Distance after:', distAfter.toFixed(6))
    console.log('   Diff:', Math.abs(distAfter - distBefore).toFixed(8))

    const diff = Math.abs(distAfter - distBefore)

    // ── 11. Verdict ──
    console.log('')
    console.log('6. Вердикт')
    if (diff > 1e-6) {
      console.log('   ❌ БАГ: расстояние изменилось на', diff.toFixed(8))
      console.log('')
      console.log('7. РАСШИРЕННАЯ ДИАГНОСТИКА')
      console.log('   nearestToCube.dist:', nearestToCube.d.toFixed(8))
      console.log('   nearestToPrism.dist:', nearestToPrism.d.toFixed(8))
      console.log('   Cube transform position:', JSON.stringify({ x: cubeTransform.x, y: cubeTransform.y, z: cubeTransform.z }))
      console.log('   Prism transform position:', JSON.stringify({ x: prismTransform.x, y: prismTransform.y, z: prismTransform.z }))
      console.log('   CSG transform position:', JSON.stringify({ x: csg.transform.x, y: csg.transform.y, z: csg.transform.z }))
      console.log('')
      console.log('   Cube world BBox:', JSON.stringify(bbox(cubeWorld)))
      console.log('   Prism world BBox:', JSON.stringify(bbox(prismWorld)))
      console.log('   CSG world BBox:', JSON.stringify(bbox(csgWorld)))
      console.log('')
      console.log('   Cube world vertices (first 8):')
      for (let i = 0; i < Math.min(8, cubeWorld.length); i++) {
        console.log(`     [${cubeWorld[i].x.toFixed(4)}, ${cubeWorld[i].y.toFixed(4)}, ${cubeWorld[i].z.toFixed(4)}]`)
      }
      console.log('   Prism world vertices (first 6):')
      for (let i = 0; i < Math.min(6, prismWorld.length); i++) {
        console.log(`     [${prismWorld[i].x.toFixed(4)}, ${prismWorld[i].y.toFixed(4)}, ${prismWorld[i].z.toFixed(4)}]`)
      }
      console.log('   CSG world vertices (all):')
      for (let i = 0; i < csgWorld.length; i++) {
        console.log(`     [${csgWorld[i].x.toFixed(4)}, ${csgWorld[i].y.toFixed(4)}, ${csgWorld[i].z.toFixed(4)}]`)
      }
    } else {
      console.log('   ✅ OK: diff =', diff.toExponential(3), '(< 1e-6)')
    }

    // ── 12. Cross-validation: независимая applyTRS vs worker-matrix ──
    // Проверяем, что наша applyTRS даёт тот же результат, что buildTransformMatrix
    // из worker-matrix.ts (production код). Это не «код против кода» —
    // applyTRS независимая реализация, worker-matrix — эталон из production.
    const { buildTransformMatrix: buildTM, applyMatrix4ToVec3 } = await import('../csg/worker-matrix')
    const testVertex = { x: 5, y: -3, z: 7 }
    const testT: TransformNR = { x: 20, y: -20, z: 20, rotX: 45, rotY: 45, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

    const m = buildTM(
      { x: testT.x, y: testT.y, z: testT.z },
      { rotX: testT.rotX, rotY: testT.rotY, rotZ: testT.rotZ },
      { scaleX: testT.scaleX, scaleY: testT.scaleY, scaleZ: testT.scaleZ },
    )
    const refResult = applyMatrix4ToVec3(m, testVertex)
    const indepResult = applyTRS(testVertex, testT)
    const crossDiff = dist(refResult, indepResult)

    console.log('')
    console.log('7. Кросс-валидация applyTRS (независимая) vs worker-matrix (production)')
    console.log('   Test vertex:', JSON.stringify(testVertex))
    console.log('   worker-matrix:', JSON.stringify(refResult))
    console.log('   applyTRS     :', JSON.stringify(indepResult))
    console.log('   Cross-diff:', crossDiff.toExponential(3))
    expect(crossDiff).toBeLessThan(1e-10)

    // ── 13. Assert ──
    // Вершина должна быть найдена близко (в пределах 0.5)
    expect(nearestToCube.d).toBeLessThan(0.5)
    expect(nearestToPrism.d).toBeLessThan(0.5)

    // Расстояние не должно измениться более чем на 1e-6
    expect(diff).toBeLessThan(1e-6)
  }, 30000)

  // ============================================================
  // Тест 2: Рендер-конвенция (bbox-center) vs CSG-конвенция (spawn/centroid)
  // ============================================================
  //
  // Задача: воспроизвести пользовательский замер «12.67 мм до union»
  // используя ту же конвенцию центрирования, что и Viewport3D.
  //
  // Viewport3D (centerGeometry, viewport-hooks.ts:413):
  //   world = R·S·(v − bboxCenter(v)) + t      (bbox-center для примитивов)
  //
  // Worker CSG (handleCsgBooleanSync, worker-handlers.ts):
  //   world = T·R·S·(v − spawnT)                (spawn/centroid)
  //
  // Для куба: bboxCenter = spawn → совпадает.
  // Для призмы (sides=3, radius=12): bboxCenter ≠ spawn → расхождение.
  // ============================================================

  it('Рендер-конвенция (bbox-center) vs CSG-конвенция (spawn) — воспроизведение 12.67 мм', async () => {
    // ── 1. Параметры из скриншотов ──
    const cubeTransform: TransformNR = {
      x: 20, y: -20, z: 20,
      rotX: 45, rotY: 45, rotZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    }
    const prismTransform: TransformNR = {
      x: 20, y: 20, z: 20,
      rotX: 45, rotY: 0, rotZ: 0,
      scaleX: 1, scaleY: 1, scaleZ: 1,
    }

    // ── 2. Создать объекты через store ──
    await useDocumentStore.getState().addShape('cube', { width: 20, height: 20, depth: 20 })
    await useDocumentStore.getState().addShape('prism', { radius: 12, height: 20, sides: 3 })

    const objects = useDocumentStore.getState().objects
    const cubeId = Object.keys(objects).find(
      id => objects[id].shapeType === 'cube',
    )!
    const prismId = Object.keys(objects).find(
      id => objects[id].shapeType === 'prism',
    )!

    await useDocumentStore.getState().moveObject(cubeId, cubeTransform)
    await useDocumentStore.getState().moveObject(prismId, prismTransform)

    const cube = objects[cubeId]
    const prism = objects[prismId]

    // ── 3. Spawn-позиции (из add_shape операции) ──
    const operations = useDocumentStore.getState().operations
    const cubeOp = operations.find(o => o.type === 'add_shape' && o.id === cubeId) as
      { transform: TransformNR } | undefined
    const prismOp = operations.find(o => o.type === 'add_shape' && o.id === prismId) as
      { transform: TransformNR } | undefined

    const cubeSpawn = cubeOp?.transform ?? { x: 0, y: 0, z: 0 }
    const prismSpawn = prismOp?.transform ?? { x: 0, y: 0, z: 0 }

    // ── 4. Бокс-центр хранимых вершин (стек с bake spawn) ──
    function bboxCenterOf(verts: Float32Array): Vec3 {
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
      for (let i = 0; i < verts.length; i += 3) {
        if (verts[i] < minX) minX = verts[i]
        if (verts[i + 1] < minY) minY = verts[i + 1]
        if (verts[i + 2] < minZ) minZ = verts[i + 2]
        if (verts[i] > maxX) maxX = verts[i]
        if (verts[i + 1] > maxY) maxY = verts[i + 1]
        if (verts[i + 2] > maxZ) maxZ = verts[i + 2]
      }
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }
    }

    const cubeBBoxCenter = bboxCenterOf(cube.vertices)
    const prismBBoxCenter = bboxCenterOf(prism.vertices)

    console.log('\n=== RENDER CONVENTION vs CSG CONVENTION ===')
    console.log('1. Бокс-центры хранимых вершин (spawn baked in)')
    console.log('   Cube bboxCenter:', JSON.stringify(cubeBBoxCenter))
    console.log('   Cube spawn:', JSON.stringify(cubeSpawn))
    console.log('   Prism bboxCenter:', JSON.stringify(prismBBoxCenter))
    console.log('   Prism spawn:', JSON.stringify(prismSpawn))
    console.log('')

    // ── 5. Render-конвенция (как centerGeometry в viewport-hooks.ts:413):
    //     world = R·S·(v − bboxCenter(v)) + t
    // Независимая реализация, НЕ использует worker-matrix.
    function renderWorldVerts(
      verts: Float32Array,
      t: TransformNR,
      bboxC: Vec3,
    ): Vec3[] {
      return toVec3Array(verts).map(v => applyTRS(v, t, bboxC))
    }

    const cubeRenderWorld = renderWorldVerts(cube.vertices, cubeTransform, cubeBBoxCenter)
    const prismRenderWorld = renderWorldVerts(prism.vertices, prismTransform, prismBBoxCenter)

    // ── 6. CSG-конвенция (как worker-handlers handleCsgBooleanSync):
    //     world = R·S·(v − spawnT) + t
    const cubeCSGWorld = toVec3Array(cube.vertices).map(v =>
      applyTRS(v, cubeTransform, cubeSpawn),
    )
    const prismCSGWorld = toVec3Array(prism.vertices).map(v =>
      applyTRS(v, prismTransform, prismSpawn),
    )

    // ── 7. Ближайшие пары ──
    const closestRender = findClosestPair(cubeRenderWorld, prismRenderWorld)
    const closestCSG = findClosestPair(cubeCSGWorld, prismCSGWorld)

    console.log('2. Ближайшая пара: РЕНДЕР-конвенция (bbox-center)')
    console.log('   Cube vertex:', JSON.stringify(closestRender!.a))
    console.log('   Prism vertex:', JSON.stringify(closestRender!.b))
    console.log('   Distance:', closestRender!.d.toFixed(6))

    console.log('')
    console.log('3. Ближайшая пара: CSG-конвенция (spawn/centroid)')
    console.log('   Cube vertex:', JSON.stringify(closestCSG!.a))
    console.log('   Prism vertex:', JSON.stringify(closestCSG!.b))
    console.log('   Distance:', closestCSG!.d.toFixed(6))
    console.log('')

    const renderDist = closestRender!.d
    const csgDist = closestCSG!.d
    const diffRenderCSG = Math.abs(renderDist - csgDist)

    console.log('4. Разница между конвенциями')
    console.log('   Render distance:', renderDist.toFixed(6))
    console.log('   CSG distance:', csgDist.toFixed(6))
    console.log('   Diff:', diffRenderCSG.toFixed(6))
    console.log('')

    // ── 8. Показать смещение бокс-центра относительно спавна ──
    const prismOffset = {
      x: prismBBoxCenter.x - prismSpawn.x,
      y: prismBBoxCenter.y - prismSpawn.y,
      z: prismBBoxCenter.z - prismSpawn.z,
    }
    console.log('5. Смещение bboxCenter относительно spawn')
    console.log('   Prism offset (bboxCenter − spawn):', JSON.stringify(prismOffset))
    console.log('   |offset|:', Math.sqrt(prismOffset.x ** 2 + prismOffset.y ** 2 + prismOffset.z ** 2).toFixed(4))
    console.log('')

    // ── 9. Рендер-смещение: R·offset (world space) ──
    // FIX: z3 was not defined in the original applyRotation — use applyTRS instead
    const rotatedOffset = applyTRS({ x: prismOffset.x, y: prismOffset.y, z: prismOffset.z }, {
      x: 0, y: 0, z: 0,
      rotX: prismTransform.rotX, rotY: prismTransform.rotY, rotZ: prismTransform.rotZ,
      scaleX: prismTransform.scaleX, scaleY: prismTransform.scaleY, scaleZ: prismTransform.scaleZ,
    })
    console.log('6. Рендер-смещение (world space) = R·(bboxCenter − spawn)')
    console.log('   Rotated offset:', JSON.stringify(rotatedOffset))
    console.log('   |rotated offset|:', Math.sqrt(rotatedOffset.x ** 2 + rotatedOffset.y ** 2 + rotatedOffset.z ** 2).toFixed(4))
    console.log('')

    // ── 10. Проверка: рендер-расстояние ≈ 12.67 (пользовательский замер) ──
    // (applyRotation удалён — используем applyTRS вместо него, чтобы не было z3)
    console.log('7. Сравнение с пользовательским замером')
    console.log('   Пользователь "до union": 12.67 мм')
    console.log('   Рендер-расстояние:', renderDist.toFixed(4), 'мм')
    console.log('   Расхождение с замером:', Math.abs(renderDist - 12.67).toFixed(4), 'мм')
    console.log('   Пользователь "после union": 10.74 мм')
    console.log('   CSG-расстояние:', csgDist.toFixed(4), 'мм')
    console.log('   Расхождение с замером:', Math.abs(csgDist - 10.74).toFixed(4), 'мм')
    console.log('')

    // ── 11. Вердикт ──
    console.log('8. ВЕРДИКТ')
    if (Math.abs(renderDist - 12.67) < 0.5) {
      console.log('   ✅ РЕНДЕР-КОНВЕНЦИЯ ВЕРНА: расстояние ≈ 12.67 мм (пользовательский замер)')
    } else {
      console.log('   ⚠️ Рендер-расстояние ≠ 12.67, diff =', Math.abs(renderDist - 12.67).toFixed(4))
    }
    if (Math.abs(csgDist - 10.74) < 0.5) {
      console.log('   ✅ CSG-КОНВЕНЦИЯ ВЕРНА: расстояние ≈ 10.74 мм (пользовательский замер)')
    } else {
      console.log('   ⚠️ CSG-расстояние ≠ 10.74, diff =', Math.abs(csgDist - 10.74).toFixed(4))
    }
    console.log('')
    console.log('   ROOT CAUSE:')
    console.log('   Рендер (centerGeometry, viewport-hooks.ts:413) вычитает bboxCenter')
    console.log('   CSG (worker-handlers, handleCsgBooleanSync) вычитает spawn.')
    console.log('   Для призмы (sides=3, radius=12): bboxCenter ≠ spawn')
    console.log('   Расхождение =', Math.sqrt(prismOffset.x ** 2 + prismOffset.y ** 2 + prismOffset.z ** 2).toFixed(4), 'мм в локальной системе')
    console.log('   После поворота R: |rotatedOffset| =', Math.sqrt(rotatedOffset.x ** 2 + rotatedOffset.y ** 2 + rotatedOffset.z ** 2).toFixed(4), 'мм в мировой')
    console.log('')

    // ── 12. Assert ──
    // Рендер-расстояние должно быть ≈ 12.67 (в пределах 1мм, т.к. пользователь мог
    // измерить с небольшим смещением от snap-вершины)
    expect(renderDist).toBeGreaterThan(12)
    expect(renderDist).toBeLessThan(13.5)

    // CSG-расстояние должно совпадать с первым тестом ≈ 10.74
    expect(csgDist).toBeGreaterThan(10)
    expect(csgDist).toBeLessThan(11.5)

    // Разница между конвенциями должна быть заметной (не floating-point noise)
    expect(diffRenderCSG).toBeGreaterThan(1)
  }, 30000)
})
