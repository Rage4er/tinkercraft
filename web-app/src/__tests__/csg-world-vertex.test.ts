// ============================================================
// csg-world-vertex.test.ts — Явная проверка world-вершин
// ============================================================
//
// Ключевой вопрос: world = pivot + vertex (после union) соответствует
// world = applyTRS(transform, raw_vertices - spawn) (до union)?
//
// Тест явно вычисляет world для каждого объекта, логирует первые вершины
// и сравнивает.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import * as bridge from './worker-bridge'
import type { TransformNR, SceneObject, GroupOperation, AddShapeOperation } from '../csg/types'

vi.mock('../csg/worker-client', async () => {
  const b = await import('./worker-bridge')
  return {
    workerBuildShape: b.workerBuildShape,
    workerApplyFillet: b.workerApplyFillet,
    workerBuildImportedMesh: b.workerBuildImportedMesh,
    workerSyncObjects: b.workerSyncObjects,
    workerSyncMesh: b.workerSyncMesh,
    workerCsgBoolean: b.workerCsgBoolean,
    workerCsgBooleanWithSync: b.workerCsgBooleanWithSync,
    workerMirrorObject: b.workerMirrorObject,
    workerRebuildScene: b.workerRebuildScene,
    workerDeleteObjects: b.workerDeleteObjects,
    workerClearAll: b.workerClearAll,
    workerRebuildNode: b.workerRebuildNode,
    isWorkerReady: b.isWorkerReady,
    disposeWorker: b.disposeWorker,
  }
})

const st = () => useDocumentStore.getState()
const IDENTITY: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

// ============================================================
// Независимая TRS (точная копия worker-matrix.ts)
// ============================================================

/**
 * Apply full TRS to a vertex: v' = R·(S·v) + T.
 * R = Rx · Ry · Rz (Euler XYZ, same as Three.js).
 * Scale applied per-component before rotation.
 * Translation applied after.
 */
function applyTRS(v: [number, number, number], t: TransformNR): [number, number, number] {
  let [x, y, z] = v

  // 1. Scale
  x *= t.scaleX
  y *= t.scaleY
  z *= t.scaleZ

  // 2. Rotation: Euler XYZ (R = Rx · Ry · Rz)
  const rx = t.rotX * Math.PI / 180
  const ry = t.rotY * Math.PI / 180
  const rz = t.rotZ * Math.PI / 180
  const cx = Math.cos(rx), sx = Math.sin(rx)
  const cy = Math.cos(ry), sy = Math.sin(ry)
  const cz = Math.cos(rz), sz = Math.sin(rz)

  // R = Rx · Ry · Rz, row-major multiply: v' = R · v
  const x2 = (cy * cz) * x + (-cy * sz) * y + (sy) * z
  const y2 = (cx * sz + sx * sy * cz) * x + (cx * cz - sx * sy * sz) * y + (-sx * cy) * z
  const z2 = (-cx * sy * cz + sx * sz) * x + (cx * sy * sz + sx * cz) * y + (cx * cy) * z

  // 3. Translation
  return [x2 + t.x, y2 + t.y, z2 + t.z]
}

// ============================================================
// Утилиты
// ============================================================

/** Получить spawn-трансформ из add_shape операции. */
function getSpawnTransform(id: string): TransformNR {
  const ops = st().operations
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i] as AddShapeOperation
    if (op.type === 'add_shape' && op.id === id) return { ...op.transform }
  }
  return IDENTITY
}

/**
 * Вычислить world-вершины примитива:
 * world = applyTRS(transform, raw_vertices − spawn_translation)
 *
 * Примитивы хранят spawn-запечённые вершины (handleBuildShape применяет
 * spawn-трансляцию к mesh). Перед применением TRS нужно вычесть spawn.
 */
function computeWorldVerts(obj: SceneObject): Float32Array {
  const sp = getSpawnTransform(obj.id)
  const out = new Float32Array(obj.vertices.length)
  const t = obj.transform
  for (let i = 0; i < obj.vertices.length; i += 3) {
    const raw: [number, number, number] = [obj.vertices[i] - sp.x, obj.vertices[i + 1] - sp.y, obj.vertices[i + 2] - sp.z]
    const w = applyTRS(raw, t)
    out[i] = w[0]; out[i + 1] = w[1]; out[i + 2] = w[2]
  }
  return out
}

/** Вычислить AABB. */
function computeBBox(verts: Float32Array) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < verts.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      if (verts[i + a] < min[a]) min[a] = verts[i + a]
      if (verts[i + a] > max[a]) max[a] = verts[i + a]
    }
  }
  return { min, max }
}

/** Расстояние между двумя точками. */
function dist3(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/** Ближайшая вершина в Float32Array. */
function nearestDist(pt: [number, number, number], verts: Float32Array): number {
  let d = Infinity
  for (let i = 0; i < verts.length; i += 3) {
    const dx = pt[0] - verts[i], dy = pt[1] - verts[i + 1], dz = pt[2] - verts[i + 2]
    const dd = dx * dx + dy * dy + dz * dz
    if (dd < d) d = dd
  }
  return Math.sqrt(d)
}

/** Точка внутри AABB (для куба bbox == объём). */
function isPointInsideBox(pt: [number, number, number], box: { min: number[]; max: number[] }): boolean {
  return pt[0] >= box.min[0] - 1e-9 && pt[0] <= box.max[0] + 1e-9 &&
    pt[1] >= box.min[1] - 1e-9 && pt[1] <= box.max[1] + 1e-9 &&
    pt[2] >= box.min[2] - 1e-9 && pt[2] <= box.max[2] + 1e-9
}

// ============================================================
// Тесты
// ============================================================

describe('CSG world vertex — явное вычисление', () => {
  beforeEach(async () => {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearSnapshots()
    clearTree()
    await bridge.workerClearAll()
  }, 30000)

  it('Явный world: cube + prism → union, world операндов содержится в world CSG', async () => {
    // ──────────────────────────────────────────────────────────
    // 1. Создать куб и призму
    // ──────────────────────────────────────────────────────────
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 })

    // ──────────────────────────────────────────────────────────
    // 2. ЯВНО вычислить WORLD операндов
    // ──────────────────────────────────────────────────────────
    const cubeWorld = computeWorldVerts(st().objects[cubeId])
    const prismWorld = computeWorldVerts(st().objects[prismId])

    const cubeSpawn = getSpawnTransform(cubeId)
    const prismSpawn = getSpawnTransform(prismId)
    const cubeT = st().objects[cubeId].transform
    const prismT = st().objects[prismId].transform

    console.log('═══════════════════════════════════════════')
    console.log('  CSG WORLD VERTEX — ЯВНЫЙ ТЕСТ')
    console.log('═══════════════════════════════════════════')
    console.log()
    console.log('── CUBE ──')
    console.log(`  id:        ${cubeId}`)
    console.log(`  shapeType: ${st().objects[cubeId].shapeType}`)
    console.log(`  spawn:     [${cubeSpawn.x}, ${cubeSpawn.y}, ${cubeSpawn.z}]`)
    console.log(`  transform: [${cubeT.x}, ${cubeT.y}, ${cubeT.z}] rot(${cubeT.rotX},${cubeT.rotY},${cubeT.rotZ}) scale(${cubeT.scaleX},${cubeT.scaleY},${cubeT.scaleZ})`)
    console.log(`  raw[0]:    [${st().objects[cubeId].vertices[0]}, ${st().objects[cubeId].vertices[1]}, ${st().objects[cubeId].vertices[2]}]`)
    console.log(`  raw[0]-spawn: [${st().objects[cubeId].vertices[0] - cubeSpawn.x}, ${st().objects[cubeId].vertices[1] - cubeSpawn.y}, ${st().objects[cubeId].vertices[2] - cubeSpawn.z}]`)
    console.log(`  WORLD[0]:  [${cubeWorld[0].toFixed(6)}, ${cubeWorld[1].toFixed(6)}, ${cubeWorld[2].toFixed(6)}]`)
    console.log(`  WORLD[1]:  [${cubeWorld[3].toFixed(6)}, ${cubeWorld[4].toFixed(6)}, ${cubeWorld[5].toFixed(6)}]`)
    console.log(`  vertex count: ${cubeWorld.length / 3}`)
    const cubeBBox = computeBBox(cubeWorld)
    console.log(`  bbox:      [${cubeBBox.min.map(n => n.toFixed(4)).join(',')}] → [${cubeBBox.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log()
    console.log('── PRISM ──')
    console.log(`  id:        ${prismId}`)
    console.log(`  shapeType: ${st().objects[prismId].shapeType}`)
    console.log(`  spawn:     [${prismSpawn.x}, ${prismSpawn.y}, ${prismSpawn.z}]`)
    console.log(`  transform: [${prismT.x}, ${prismT.y}, ${prismT.z}] rot(${prismT.rotX},${prismT.rotY},${prismT.rotZ}) scale(${prismT.scaleX},${prismT.scaleY},${prismT.scaleZ})`)
    console.log(`  raw[0]:    [${st().objects[prismId].vertices[0].toFixed(2)}, ${st().objects[prismId].vertices[1].toFixed(2)}, ${st().objects[prismId].vertices[2].toFixed(2)}]`)
    console.log(`  raw[0]-spawn: [${(st().objects[prismId].vertices[0] - prismSpawn.x).toFixed(2)}, ${(st().objects[prismId].vertices[1] - prismSpawn.y).toFixed(2)}, ${(st().objects[prismId].vertices[2] - prismSpawn.z).toFixed(2)}]`)
    console.log(`  WORLD[0]:  [${prismWorld[0].toFixed(6)}, ${prismWorld[1].toFixed(6)}, ${prismWorld[2].toFixed(6)}]`)
    console.log(`  WORLD[1]:  [${prismWorld[3].toFixed(6)}, ${prismWorld[4].toFixed(6)}, ${prismWorld[5].toFixed(6)}]`)
    console.log(`  vertex count: ${prismWorld.length / 3}`)
    const prismBBox = computeBBox(prismWorld)
    console.log(`  bbox:      [${prismBBox.min.map(n => n.toFixed(4)).join(',')}] → [${prismBBox.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log()

    // Ожидания:
    // Куб на (20,20,20) без rot/scale: bbox = [10,10,10] → [30,30,30]
    expect(cubeBBox.min[0]).toBeCloseTo(10, 4)
    expect(cubeBBox.max[0]).toBeCloseTo(30, 4)
    // Cube first vertex should be at (10, 10, 10) (corner of cube at origin, translated by 20)
    expect(cubeWorld[0]).toBeCloseTo(10, 4)
    expect(cubeWorld[1]).toBeCloseTo(10, 4)
    expect(cubeWorld[2]).toBeCloseTo(10, 4)

    // ──────────────────────────────────────────────────────────
    // 3. CSG union
    // ──────────────────────────────────────────────────────────
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')

    // ──────────────────────────────────────────────────────────
    // 4. ЯВНО вычислить WORLD CSG
    // ──────────────────────────────────────────────────────────
    const ops = st().operations
    let csgId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') csgId = (ops[i] as GroupOperation).resultId!
    const csg = st().objects[csgId]
    expect(csg).toBeTruthy()

    // CSG: world = pivot + vertex (pivot rot/scale = identity)
    const csgWorld = new Float32Array(csg.vertices.length)
    for (let i = 0; i < csg.vertices.length; i += 3) {
      csgWorld[i] = csg.vertices[i] + csg.transform.x
      csgWorld[i + 1] = csg.vertices[i + 1] + csg.transform.y
      csgWorld[i + 2] = csg.vertices[i + 2] + csg.transform.z
    }
    const csgBBox = computeBBox(csgWorld)

    console.log('── CSG RESULT (after union) ──')
    console.log(`  id:        ${csgId}`)
    console.log(`  shapeType: ${csg.shapeType}`)
    console.log(`  pivot:     [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    console.log(`  raw[0]:    [${csg.vertices[0].toFixed(6)}, ${csg.vertices[1].toFixed(6)}, ${csg.vertices[2].toFixed(6)}]`)
    console.log(`  WORLD[0]:  [${csgWorld[0].toFixed(6)}, ${csgWorld[1].toFixed(6)}, ${csgWorld[2].toFixed(6)}]`)
    console.log(`  WORLD[1]:  [${csgWorld[3].toFixed(6)}, ${csgWorld[4].toFixed(6)}, ${csgWorld[5].toFixed(6)}]`)
    console.log(`  vertex count: ${csgWorld.length / 3}`)
    console.log(`  bbox:      [${csgBBox.min.map(n => n.toFixed(4)).join(',')}] → [${csgBBox.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log()

    // ──────────────────────────────────────────────────────────
    // 5. Сравнение: world CSG == union world operand bboxes
    // ──────────────────────────────────────────────────────────
    const expectedMin = [
      Math.min(cubeBBox.min[0], prismBBox.min[0]),
      Math.min(cubeBBox.min[1], prismBBox.min[1]),
      Math.min(cubeBBox.min[2], prismBBox.min[2]),
    ]
    const expectedMax = [
      Math.max(cubeBBox.max[0], prismBBox.max[0]),
      Math.max(cubeBBox.max[1], prismBBox.max[1]),
      Math.max(cubeBBox.max[2], prismBBox.max[2]),
    ]

    console.log('── BBOX COMPARISON ──')
    console.log(`  expected bbox (union of operands): [${expectedMin.map(n => n.toFixed(4)).join(',')}] → [${expectedMax.map(n => n.toFixed(4)).join(',')}]`)
    console.log(`  actual csg bbox:                   [${csgBBox.min.map(n => n.toFixed(4)).join(',')}] → [${csgBBox.max.map(n => n.toFixed(4)).join(',')}]`)

    const bboxDiff = Math.max(
      Math.abs(csgBBox.min[0] - expectedMin[0]), Math.abs(csgBBox.max[0] - expectedMax[0]),
      Math.abs(csgBBox.min[1] - expectedMin[1]), Math.abs(csgBBox.max[1] - expectedMax[1]),
      Math.abs(csgBBox.min[2] - expectedMin[2]), Math.abs(csgBBox.max[2] - expectedMax[2]),
    )
    console.log(`  bbox diff: ${bboxDiff.toExponential(4)}`)
    expect(bboxDiff).toBeLessThan(1e-4) // Float32 epsilon ~3.8e-6 at ~30, use 1e-4

    // ──────────────────────────────────────────────────────────
    // 6. Сравнение: pivot CSG == transformA (first operand)
    // ──────────────────────────────────────────────────────────
    const pivotDiff = Math.max(
      Math.abs(csg.transform.x - cubeT.x),
      Math.abs(csg.transform.y - cubeT.y),
      Math.abs(csg.transform.z - cubeT.z),
    )
    console.log('── PIVOT COMPARISON ──')
    console.log(`  csg.pivot:     [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    console.log(`  cube.transform: [${cubeT.x.toFixed(6)}, ${cubeT.y.toFixed(6)}, ${cubeT.z.toFixed(6)}]`)
    console.log(`  pivot diff: ${pivotDiff.toExponential(4)}`)
    expect(pivotDiff).toBeLessThan(1e-6)

    // ──────────────────────────────────────────────────────────
    // 7. Сравнение: world CSG содержит world операндов (outside)
    // ──────────────────────────────────────────────────────────
    const TOL = 1e-4

    // Куб целиком вне призмы (все 8 вершин — кандидаты, raycasting подтвердил).
    let cubeMissing = 0
    for (let i = 0; i < cubeWorld.length; i += 3) {
      const pt: [number, number, number] = [cubeWorld[i], cubeWorld[i + 1], cubeWorld[i + 2]]
      const d = nearestDist(pt, csgWorld)
      if (d > TOL) {
        cubeMissing++
        if (cubeMissing <= 3) {
          console.log(`  MISSING cube vertex: [${pt[0].toFixed(6)}, ${pt[1].toFixed(6)}, ${pt[2].toFixed(6)}] nearest CSG dist = ${d.toFixed(8)}`)
        }
      }
    }
    console.log(`  Cube vertices outside CSG: ${cubeMissing} of ${cubeWorld.length / 3}`)
    expect(cubeMissing).toBe(0)

    // Призма: вершины внутри куба поглощаются union → не будут в CSG.
    // Фильтр: только вершины вне куба (bbox = объём для куба).
    let prismMissing = 0
    for (let i = 0; i < prismWorld.length; i += 3) {
      const pt: [number, number, number] = [prismWorld[i], prismWorld[i + 1], prismWorld[i + 2]]
      if (isPointInsideBox(pt, cubeBBox)) continue // inside cube → absorbed
      const d = nearestDist(pt, csgWorld)
      if (d > TOL) {
        prismMissing++
        if (prismMissing <= 3) {
          console.log(`  MISSING prism vertex: [${pt[0].toFixed(6)}, ${pt[1].toFixed(6)}, ${pt[2].toFixed(6)}] nearest CSG dist = ${d.toFixed(8)}`)
        }
      }
    }
    console.log(`  Prism vertices outside cube: ${prismWorld.length / 3} total, ${prismMissing} missing from CSG`)
    expect(prismMissing).toBe(0)

    console.log()
    console.log('═══ ВСЕ ПРОВЕРКИ ПРОШЛИ ═══')
    console.log()
  }, 30000)
})
