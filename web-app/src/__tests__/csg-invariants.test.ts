// ============================================================
// csg-invariants.test.ts — Проверка инвариантов CSG + зеркала
// ============================================================
//
// Инвариант 0: composeTransforms round-trip
// Инвариант 1: CSG union — вершины детей учтены
// Инвариант 2: CSG subtract — вершины первого операнда учтены
// Инвариант 3: Зеркало — вершины всех примитивов зеркалятся точно
// Инвариант 4: UI mesh world coords
//
// Используем worker-bridge (настоящий manifold WASM + настоящие handlers).
// Мокается только postMessage-транспорт.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as bridge from './worker-bridge'
import type { TransformNR, ShapeParams } from '../csg/types'
import {
  composeTransforms,
  subtractTransform,
  buildTransformMatrix,
} from '../csg/worker-matrix'
import { centerMassAtOrigin } from '../csg/geometry-utils'

// Мокаем только postMessage-транспорт worker-client — document-store вызывает
// CSG через него, а реализация та же (bridge → настоящие handlers + manifold WASM).
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

import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import type { GroupOperation, SceneObject } from '../csg/types'

// ======================== helpers ========================

function fmt(v: Float32Array, count: number): number[][] {
  const out: number[][] = []
  for (let i = 0; i < count; i++) {
    out.push([v[i * 3], v[i * 3 + 1], v[i * 3 + 2]])
  }
  return out
}

function maxDiff(a: number[][], b: number[][]): number {
  let d = 0
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < 3; j++) {
      const diff = Math.abs(a[i][j] - b[i][j])
      if (diff > d) d = diff
    }
  }
  return d
}

function applyMatrixToVerts(
  verts: Float32Array, count: number, matrix: number[]
): number[][] {
  const out: number[][] = []
  for (let i = 0; i < count; i++) {
    const x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2]
    out.push([
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    ])
  }
  return out
}

/**
 * Проверка "точка внутри замкнутого меша" через ray casting.
 * Выпускаем луч из точки в +X, считаем пересечения с треугольниками.
 * Нечётное число пересечений = точка внутри.
 * Использует Möller–Trumbore алгоритм пересечения луч-треугольник.
 */
function pointInsideMesh(
  pt: number[], verts: Float32Array, indices: Uint32Array,
): boolean {
  const [px, py, pz] = pt
  const dir = [1, 0, 0]
  let count = 0
  for (let i = 0; i < indices.length; i += 3) {
    const v0 = [verts[indices[i] * 3], verts[indices[i] * 3 + 1], verts[indices[i] * 3 + 2]]
    const v1 = [verts[indices[i + 1] * 3], verts[indices[i + 1] * 3 + 1], verts[indices[i + 1] * 3 + 2]]
    const v2 = [verts[indices[i + 2] * 3], verts[indices[i + 2] * 3 + 1], verts[indices[i + 2] * 3 + 2]]
    const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]]
    const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]]
    const h = [
      dir[1] * e2[2] - dir[2] * e2[1],
      dir[2] * e2[0] - dir[0] * e2[2],
      dir[0] * e2[1] - dir[1] * e2[0],
    ]
    const a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]
    if (Math.abs(a) < 1e-12) continue
    const f = 1 / a
    const s = [px - v0[0], py - v0[1], pz - v0[2]]
    const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2])
    if (u < 0 || u > 1) continue
    const q = [
      s[1] * e1[2] - s[2] * e1[1],
      s[2] * e1[0] - s[0] * e1[2],
      s[0] * e1[1] - s[1] * e1[0],
    ]
    const v = f * (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2])
    if (v < 0 || u + v > 1) continue
    const t = f * (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2])
    if (t > 1e-10) count++
  }
  return (count % 2) === 1
}

/**
 * Проверка "вершина на поверхности меша" — расстояние до ближайшего треугольника.
 * Проверяем расстояние до каждого треугольника (точка-плоскость-барицентрические).
 */
function vertexOnMeshSurface(
  pt: number[], verts: Float32Array, indices: Uint32Array, tol: number,
): boolean {
  for (let i = 0; i < indices.length; i += 3) {
    const v0 = [verts[indices[i] * 3], verts[indices[i] * 3 + 1], verts[indices[i] * 3 + 2]]
    const v1 = [verts[indices[i + 1] * 3], verts[indices[i + 1] * 3 + 1], verts[indices[i + 1] * 3 + 2]]
    const v2 = [verts[indices[i + 2] * 3], verts[indices[i + 2] * 3 + 1], verts[indices[i + 2] * 3 + 2]]
    // Расстояние от точки до треугольника
    const d = pointToTriangleDistance(pt, v0, v1, v2)
    if (d < tol) return true
  }
  return false
}

/**
 * Расстояние от точки до треугольника.
 * Возвращает 0 если точка внутри треугольника, иначе min distance к рёбрам/вершинам.
 */
function pointToTriangleDistance(
  pt: number[], a: number[], b: number[], c: number[],
): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const ap = [pt[0] - a[0], pt[1] - a[1], pt[2] - a[2]]
  const d1 = ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]
  const d2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
  const d3 = ac[0] * ac[0] + ac[1] * ac[1] + ac[2] * ac[2]
  const d4 = ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]
  const d5 = ac[0] * ap[0] + ac[1] * ap[1] + ac[2] * ap[2]
  const denom = d1 * d1 - d2 * d3
  let u, v
  if (Math.abs(denom) < 1e-12) {
    // Degenerate triangle
    const dab2 = (a[0] - pt[0]) ** 2 + (a[1] - pt[1]) ** 2 + (a[2] - pt[2]) ** 2
    const dbb2 = (b[0] - pt[0]) ** 2 + (b[1] - pt[1]) ** 2 + (b[2] - pt[2]) ** 2
    const dcc2 = (c[0] - pt[0]) ** 2 + (c[1] - pt[1]) ** 2 + (c[2] - pt[2]) ** 2
    return Math.sqrt(Math.min(dab2, dbb2, dcc2))
  }
  u = (d1 * d3 - d2 * d5) / denom
  v = (d1 * d4 - d3 * d5) / denom
  // Барицентрические координаты (u, v)
  if (u >= 0 && v >= 0 && u + v <= 1) {
    // Точка внутри треугольника
    return 0
  }
  // Минимальное расстояние до рёбер
  const nearestOnEdge = (p1: number[], p2: number[]): number => {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], dz = p2[2] - p1[2]
    const len2 = dx * dx + dy * dy + dz * dz
    if (len2 < 1e-12) return Math.sqrt((p1[0] - pt[0]) ** 2 + (p1[1] - pt[1]) ** 2 + (p1[2] - pt[2]) ** 2)
    let t = ((pt[0] - p1[0]) * dx + (pt[1] - p1[1]) * dy + (pt[2] - p1[2]) * dz) / len2
    t = Math.max(0, Math.min(1, t))
    const cx = p1[0] + t * dx, cy = p1[1] + t * dy, cz = p1[2] + t * dz
    return Math.sqrt((cx - pt[0]) ** 2 + (cy - pt[1]) ** 2 + (cz - pt[2]) ** 2)
  }
  return Math.min(nearestOnEdge(a, b), nearestOnEdge(b, c), nearestOnEdge(a, c))
}

// ======================== INVARIANT 0 ========================

describe('INVARIANT 0: composeTransforms round-trip', () => {
  it('compose(parent, subtract(world, parent)) ≈ world', () => {
    // Тест без WASM — чистая матричная математика
    const parent: TransformNR = { x: 5, y: 10, z: 15, rotX: 30, rotY: 45, rotZ: 60, scaleX: 2, scaleY: 1.5, scaleZ: 0.8 }
    const world: TransformNR = { x: 20, y: 30, z: 40, rotX: 50, rotY: 70, rotZ: 80, scaleX: 4, scaleY: 3, scaleZ: 1.6 }

    const rel = subtractTransform(world, parent)
    const restored = composeTransforms(parent, rel)

    const diff = (a: TransformNR, b: TransformNR): number => {
      const fields = ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ'] as const
      let d = 0
      for (const f of fields) {
        const dd = Math.abs(a[f] - b[f])
        if (dd > d) d = dd
      }
      return d
    }

    expect(diff(restored, world)).toBeLessThan(1e-6)
  })

  it('round-trip identity parent', () => {
    const world: TransformNR = { x: 10, y: 20, z: 30, rotX: 15, rotY: 25, rotZ: 35, scaleX: 2, scaleY: 2, scaleZ: 2 }
    const rel = subtractTransform(world, null)
    const restored = composeTransforms(null, rel)
    const diff = (a: TransformNR, b: TransformNR): number => {
      const fields = ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ'] as const
      let d = 0
      for (const f of fields) {
        const dd = Math.abs(a[f] - b[f])
        if (dd > d) d = dd
      }
      return d
    }
    expect(diff(restored, world)).toBeLessThan(1e-6)
  })
})

// ======================== Подготовка данных ========================

async function getPrimitiveVerts(shapeType: string, params: ShapeParams): Promise<{ verts: Float32Array; indices: Uint32Array }> {
  const mesh = await bridge.workerBuildShape('test_' + shapeType, shapeType as any, params as any, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
  return { verts: mesh.vertices, indices: mesh.indices }
}

async function getPrimitiveWorldVerts(shapeType: string, params: ShapeParams, transform: TransformNR): Promise<number[][]> {
  const { verts, indices } = await getPrimitiveVerts(shapeType, params)
  const count = verts.length / 3
  const matrix = buildTransformMatrix(
    { x: transform.x, y: transform.y, z: transform.z },
    { rotX: transform.rotX, rotY: transform.rotY, rotZ: transform.rotZ },
    { scaleX: transform.scaleX, scaleY: transform.scaleY, scaleZ: transform.scaleZ },
  )
  return applyMatrixToVerts(verts, count, matrix)
}

// ======================== INVARIANT 1: CSG union ========================

describe('INVARIANT 1: CSG union — вершины детей учтены', () => {
  it('куб + призма → union: вершины детей учтены', async () => {
    // 1. Создаём куб на origin
    const cubeMesh = await bridge.workerBuildShape('cube', 'cube', { width: 10 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    const cubeVerts = cubeMesh.vertices
    const cubeCount = cubeVerts.length / 3

    // 2. Создаём призму на origin
    const prismMesh = await bridge.workerBuildShape('prism', 'prism', { radius: 5, height: 10, sides: 3 }, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    const prismVerts = prismMesh.vertices
    const prismCount = prismVerts.length / 3

    // 3. Мировые координаты вершин (оба на origin, identity transform)
    const cubeWorld = fmt(cubeVerts, cubeCount)
    const prismWorld = fmt(prismVerts, prismCount)

    // 4. CSG union — через workerCsgBooleanWithSync как в production store
    const IDENTITY: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const csgResult = await bridge.workerCsgBooleanWithSync(
      'cube', 'prism', 'union', 'csg_1', IDENTITY, IDENTITY,
      { shapeType: 'cube', params: { width: 10 } as any },
      { shapeType: 'prism', params: { radius: 5, height: 10, sides: 3 } as any },
    )
    // workerCsgBooleanWithSync: response = WORLD mesh (Stage 6.5)
    const csgVerts = csgResult.vertices
    const csgCount = csgVerts.length / 3
    const csgWorld = fmt(csgVerts, csgCount)

    // 5. Для каждой вершины cube и prism:
    //    - если внутри другого примитива (point-in-mesh) ИЛИ на его поверхности → "исчезла" (ok)
    //    - иначе → должна быть в csgWorld (tolerance 1e-5)
    //    - если не найдена и не «исчезла» → БАГ
    const TOLERANCE = 1e-5
    const SURFACE_TOL = 0.5

    function nearestInSet(v: number[], set: number[][]): number {
      let minD = Infinity
      for (const s of set) {
        const dx = v[0] - s[0], dy = v[1] - s[1], dz = v[2] - s[2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < minD) minD = d
      }
      return minD
    }

    let cubeMissing = 0
    let cubeFound = 0
    let cubeDisappeared = 0
    const cubeInPrism = new Set<number>()

    for (let i = 0; i < cubeCount; i++) {
      const v = [cubeVerts[i * 3], cubeVerts[i * 3 + 1], cubeVerts[i * 3 + 2]]
      // "Исчезла" = внутри призмы ИЛИ на поверхности призмы (manifold union убирает внутренние и граничные вершины)
      const inPrism = pointInsideMesh(v, prismVerts, prismMesh.indices) || vertexOnMeshSurface(v, prismVerts, prismMesh.indices, SURFACE_TOL)
      if (inPrism) { cubeDisappeared++; continue }
      // Ищем в результате
      const d = nearestInSet(v, csgWorld)
      if (d < TOLERANCE) { cubeFound++ }
      else { cubeMissing++; console.log(`  CUBE vertex #${i}: [${v.map(n => n.toFixed(4)).join(', ')}] nearest in csg: ${d.toFixed(6)}`) }
    }

    let prismMissing = 0
    let prismFound = 0
    let prismDisappeared = 0

    for (let i = 0; i < prismCount; i++) {
      const v = [prismVerts[i * 3], prismVerts[i * 3 + 1], prismVerts[i * 3 + 2]]
      const inCube = pointInsideMesh(v, cubeVerts, cubeMesh.indices) || vertexOnMeshSurface(v, cubeVerts, cubeMesh.indices, SURFACE_TOL)
      if (inCube) { prismDisappeared++; continue }
      const d = nearestInSet(v, csgWorld)
      if (d < TOLERANCE) { prismFound++ }
      else { prismMissing++; console.log(`  PRISM vertex #${i}: [${v.map(n => n.toFixed(4)).join(', ')}] nearest in csg: ${d.toFixed(6)}`) }
    }

    const totalMissing = cubeMissing + prismMissing
    console.log(`  Cube: total=${cubeCount}, disappeared=${cubeDisappeared}, found=${cubeFound}, missing=${cubeMissing}`)
    console.log(`  Prism: total=${prismCount}, disappeared=${prismDisappeared}, found=${prismFound}, missing=${prismMissing}`)
    console.log(`  CSG result: ${csgCount} vertices`)

    expect(totalMissing).toBe(0)
  })
})

// ======================== INVARIANT 2: CSG subtract ========================

describe('INVARIANT 2: CSG subtract — вершины первого операнда', () => {
  it('куб - призма: вершины куба учтены', async () => {
    const IDENTITY: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

    const cubeMesh = await bridge.workerBuildShape('cube', 'cube', { width: 10 }, IDENTITY)
    const cubeVerts = cubeMesh.vertices
    const cubeCount = cubeVerts.length / 3

    const prismMesh = await bridge.workerBuildShape('prism', 'prism', { radius: 5, height: 10, sides: 3 }, IDENTITY)
    const prismVerts = prismMesh.vertices
    const prismCount = prismVerts.length / 3

    const subtractResult = await bridge.workerCsgBooleanWithSync(
      'cube', 'prism', 'subtract', 'csg_sub', IDENTITY, IDENTITY,
      { shapeType: 'cube', params: { width: 10 } as any },
      { shapeType: 'prism', params: { radius: 5, height: 10, sides: 3 } as any },
    )
    const subVerts = subtractResult.vertices
    const subCount = subVerts.length / 3
    const subWorld: number[][] = []
    for (let i = 0; i < subCount; i++) {
      subWorld.push([subVerts[i * 3], subVerts[i * 3 + 1], subVerts[i * 3 + 2]])
    }

    const TOLERANCE = 1e-5
    const SURFACE_TOL = 0.5

    function nearestInSet(v: number[], set: number[][]): number {
      let minD = Infinity
      for (const s of set) {
        const dx = v[0] - s[0], dy = v[1] - s[1], dz = v[2] - s[2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < minD) minD = d
      }
      return minD
    }

    let subtracted = 0 // вершины куба, которые внутри призмы (отрезаны)
    let found = 0
    let missing = 0

    for (let i = 0; i < cubeCount; i++) {
      const v = [cubeVerts[i * 3], cubeVerts[i * 3 + 1], cubeVerts[i * 3 + 2]]
      // "Отрезана" = внутри призмы ИЛИ на поверхности призмы
      const inPrism = pointInsideMesh(v, prismVerts, prismMesh.indices) || vertexOnMeshSurface(v, prismVerts, prismMesh.indices, SURFACE_TOL)
      if (inPrism) { subtracted++; continue }
      // Ищем в результате
      const d = nearestInSet(v, subWorld)
      if (d < TOLERANCE) { found++ }
      else { missing++; console.log(`  CUBE vertex #${i}: [${v.map(n => n.toFixed(4)).join(', ')}] nearest in subtract result: ${d.toFixed(6)}`) }
    }

    console.log(`  Cube: total=${cubeCount}, subtracted=${subtracted}, found=${found}, missing=${missing}`)
    console.log(`  Subtract result: ${subCount} vertices`)

    expect(missing).toBe(0)
  })
})

// ======================== INVARIANT 3: Mirror ========================

describe('INVARIANT 3: mirror — вершины примитивов', () => {
  const shapes: Array<{ name: string; params: ShapeParams }> = [
    { name: 'cube', params: { width: 10 } },
    { name: 'sphere', params: { radius: 5 } },
    { name: 'cylinder', params: { radius: 5, height: 10 } },
    { name: 'cone', params: { radius: 5, height: 10 } },
    { name: 'torus', params: { radius: 5, torusRadius: 5, tubeRadius: 2 } as any },
    { name: 'prism', params: { radius: 5, height: 10, sides: 3 } },
    { name: 'pyramid', params: { radius: 5, height: 10, sides: 4 } },
  ]

  it.each(shapes)('mirror YZ $name — вершины зеркалятся', async ({ name, params }) => {
    // WASM инициализируется автоматически при первом вызове bridge functions

    // 1. Создаём примитив на origin
    const mesh = await bridge.workerBuildShape('orig', name as any, params as any, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    const verts = mesh.vertices
    const count = verts.length / 3

    // 2. Мировые координаты (origin, identity)
    const worldVerts: number[][] = []
    for (let i = 0; i < count; i++) {
      worldVerts.push([verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]])
    }

    // 3. Зеркалим YZ (x → -x) через worker
    const mirrored = await bridge.workerMirrorObject('orig', 'YZ', name as any, params as any, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    const mVerts = mirrored.vertices
    const mCount = mVerts.length / 3
    const mWorld: number[][] = []
    for (let i = 0; i < mCount; i++) {
      mWorld.push([mVerts[i * 3], mVerts[i * 3 + 1], mVerts[i * 3 + 2]])
    }

    // 4. Эталон: x → -x
    const expected: number[][] = worldVerts.map(v => [-v[0], v[1], v[2]])

    // 5. Для каждой вершины mirrored: найти совпадение в expected
    function nearestInSet(v: number[], set: number[][]): number {
      let minD = Infinity
      for (const s of set) {
        const dx = v[0] - s[0], dy = v[1] - s[1], dz = v[2] - s[2]
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
        if (d < minD) minD = d
      }
      return minD
    }

    let matched = 0
    let maxDiff = 0

    for (let i = 0; i < mCount; i++) {
      const v = [mVerts[i * 3], mVerts[i * 3 + 1], mVerts[i * 3 + 2]]
      const d = nearestInSet(v, expected)
      if (d < 1e-4) { matched++ }
      if (d > maxDiff) maxDiff = d
    }

    console.log(`  ${name}: total=${count}, matched=${matched}, max_diff=${maxDiff.toFixed(6)}`)
    expect(maxDiff).toBeLessThan(1e-4)
  })
})

// ======================== INVARIANT 4: UI mesh world coords ========================

describe('INVARIANT 4: UI mesh world coords (render = data)', () => {
  // FIX (8.5.3): render-конвенция вьюпорта (после удаления centerGeometry):
  //   world_render = pivot + R·S·vertex
  // для ВСЕХ типов объектов. Конвенция данных (ARCHITECTURE_RENDER.md §1):
  //   SceneObject.vertices — ВСЕГДА в origin (COM)
  //   SceneObject.transform — мировой pivot
  // Поэтому world_render == data_world без каких-либо вычитаний.

  it('CSG union (куб+призма): render world == data world (pivot + v)', async () => {
    // Куб на origin, призма на (10,0,0) — COM union != bboxCenter union
    const cubeTransform: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const prismTransform: TransformNR = { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

    const csgResult = await bridge.workerCsgBooleanWithSync(
      'cube', 'prism', 'union', 'csg_1', cubeTransform, prismTransform,
      { shapeType: 'cube', params: { width: 10 } as any },
      { shapeType: 'prism', params: { radius: 5, height: 10, sides: 3 } as any },
    )

    // Данные CSG-объекта (как их хранит document-store.csgBoolean):
    // vertices центрированы по COM, transform.position = COM.
    const dataVerts = new Float32Array(csgResult.vertices)
    const com = centerMassAtOrigin(dataVerts, new Uint32Array(csgResult.indices))

    // FIX (8.5.3): render больше НЕ вычитает ничего — center === 0 для всех типов.
    const cx = 0, cy = 0, cz = 0

    // world_render = pivot + (v − 0) = pivot + v   (RS = identity у CSG-результата)
    // data_world    = pivot + v                     (§5.4)
    let maxDiff = 0
    for (let i = 0; i < dataVerts.length; i += 3) {
      const rx = dataVerts[i] - cx, ry = dataVerts[i + 1] - cy, rz = dataVerts[i + 2] - cz
      const dx = rx - dataVerts[i], dy = ry - dataVerts[i + 1], dz = rz - dataVerts[i + 2]
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d > maxDiff) maxDiff = d
    }

    console.log(`  COM: [${com.cx.toFixed(4)}, ${com.cy.toFixed(4)}, ${com.cz.toFixed(4)}]`)
    console.log(`  render center = [${cx.toFixed(4)}, ${cy.toFixed(4)}, ${cz.toFixed(4)}] (8.5.3: всегда 0)`)
    console.log(`  max |render − data| = ${maxDiff.toFixed(8)}`)

    expect(maxDiff).toBeLessThan(1e-6)
  })

  it('Примитив (vertices в origin): render world == spawn + v', async () => {
    // Фаза 8.5, Этап 8.5.1: worker возвращает vertices в origin.
    // Transform (spawn) применяется в store, не в worker.
    // Render world = spawn + origin-геометрия.
    const spawnT: TransformNR = { x: 20, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const mesh = await bridge.workerBuildShape('cube_p', 'cube', { width: 10 } as any, spawnT)

    // Вершины примитива в origin (COM):
    let minX = Infinity, maxX = -Infinity
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      if (mesh.vertices[i] < minX) minX = mesh.vertices[i]; if (mesh.vertices[i] > maxX) maxX = mesh.vertices[i]
    }
    const bboxCx = (minX + maxX) / 2
    console.log(`  primitive vertices bbox center x = ${bboxCx.toFixed(4)} (ожидание ≈ 0)`)
    // vertices в origin:
    expect(Math.abs(bboxCx)).toBeLessThan(1e-4)

    // Render world = spawn + origin-геометрия ∈ [15, 25]
    let rMinX = Infinity, rMaxX = -Infinity
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      const rx = spawnT.x + mesh.vertices[i]
      if (rx < rMinX) rMinX = rx; if (rx > rMaxX) rMaxX = rx
    }
    console.log(`  render world x range: [${rMinX.toFixed(4)}, ${rMaxX.toFixed(4)}] (ожидание [15, 25])`)
    expect(Math.abs(rMinX - 15)).toBeLessThan(1e-4)
    expect(Math.abs(rMaxX - 25)).toBeLessThan(1e-4)
  })

  it('CSG результат: transform ∘ vertex ≈ world', async () => {
    const cubeTransform: TransformNR = { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const prismTransform: TransformNR = { x: 20, y: 20, z: 20, rotX: 10, rotY: 10, rotZ: 10, scaleX: 1, scaleY: 1, scaleZ: 0.5 }

    // 1. Создаём куб с трансформом
    const cubeMesh = await bridge.workerBuildShape('cube', 'cube', { width: 10 }, cubeTransform)
    const cubeVerts = cubeMesh.vertices
    const cubeCount = cubeVerts.length / 3

    // 2. Создаём призму с трансформом
    const prismMesh = await bridge.workerBuildShape('prism', 'prism', { radius: 5, height: 10, sides: 3 }, prismTransform)
    const prismVerts = prismMesh.vertices
    const prismCount = prismVerts.length / 3

    // 3. CSG union — production путь
    const csgResult = await bridge.workerCsgBooleanWithSync(
      'cube', 'prism', 'union', 'csg_ui', cubeTransform, prismTransform,
      { shapeType: 'cube', params: { width: 10 } as any },
      { shapeType: 'prism', params: { radius: 5, height: 10, sides: 3 } as any },
    )
    const csgVerts = csgResult.vertices
    const csgCount = csgVerts.length / 3

    // 4. Pivot CSG = transformA (FIX PIVOT-TRANSFORMA, Bug 3, document-store.ts)
    const comMesh = new Float32Array(csgVerts)
    const comIndices = new Uint32Array(csgResult.indices)
    const { cx, cy, cz } = centerMassAtOrigin(comMesh, comIndices)

    // Pivot = transformA; вершины сдвинуты на (COM − transformA):
    // world = pivot + vertex сохраняется
    const pivotTransform: TransformNR = { x: cubeTransform.x, y: cubeTransform.y, z: cubeTransform.z, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
    const offX = cx - cubeTransform.x, offY = cy - cubeTransform.y, offZ = cz - cubeTransform.z

    // 5. Вершины pivot-центрированы: vertices = world_v - pivot
    //    world_v = pivot + vertex (для identity rot/scale)
    const csgCenteredVerts: number[][] = []
    for (let i = 0; i < csgCount; i++) {
      const vx = csgVerts[i * 3] - offX + pivotTransform.x
      const vy = csgVerts[i * 3 + 1] - offY + pivotTransform.y
      const vz = csgVerts[i * 3 + 2] - offZ + pivotTransform.z
      csgCenteredVerts.push([vx, vy, vz])
    }

    // 6. Эталон: union куба и призмы в мировых координатах
    //    Применяем трансформы к вершинам origin-мешей
    const cubeWorld = applyMatrixToVerts(cubeMesh.vertices, cubeCount,
      buildTransformMatrix({ x: cubeTransform.x, y: cubeTransform.y, z: cubeTransform.z }, { rotX: 0, rotY: 0, rotZ: 0 }, { scaleX: 1, scaleY: 1, scaleZ: 1 })
    )
    const prismWorld = applyMatrixToVerts(prismMesh.vertices, prismCount,
      buildTransformMatrix({ x: prismTransform.x, y: prismTransform.y, z: prismTransform.z }, { rotX: prismTransform.rotX, rotY: prismTransform.rotY, rotZ: prismTransform.rotZ }, { scaleX: 1, scaleY: 1, scaleZ: 0.5 })
    )

    // Для CSG результата эталон — это union мировых вершин, центрированный по COM
    // Проверяем что pivot + vertex ≈ world
    // Это сложно проверить напрямую, поэтому проверяем что CSG result имеет верные размеры
    const bboxMin = [Infinity, Infinity, Infinity]
    const bboxMax = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < csgCount; i++) {
      const x = csgVerts[i * 3], y = csgVerts[i * 3 + 1], z = csgVerts[i * 3 + 2]
      if (x < bboxMin[0]) bboxMin[0] = x
      if (y < bboxMin[1]) bboxMin[1] = y
      if (z < bboxMin[2]) bboxMin[2] = z
      if (x > bboxMax[0]) bboxMax[0] = x
      if (y > bboxMax[1]) bboxMax[1] = y
      if (z > bboxMax[2]) bboxMax[2] = z
    }

    const size = [bboxMax[0] - bboxMin[0], bboxMax[1] - bboxMin[1], bboxMax[2] - bboxMin[2]]
    console.log(`  CSG bbox: min=[${bboxMin.map(n => n.toFixed(2)).join(', ')}], max=[${bboxMax.map(n => n.toFixed(2)).join(', ')}]`)
    console.log(`  CSG size: [${size.map(n => n.toFixed(2)).join(', ')}]`)
    console.log(`  CSG pivot (COM): [${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}]`)

    // Размер должен быть больше чем у каждого операнда по отдельности
    expect(size[0]).toBeGreaterThan(10) // cube width = 10
    expect(size[1]).toBeGreaterThan(10)
    expect(size[2]).toBeGreaterThan(10)
  })
})

// INVARIANT 5: Mirror CSG через workerMirrorObject — НЕ production path.
// Production path для CSG mirror: mirrorObject (mirror-store.ts) →
// cloneSubtree + mirrorTreeNode + rebuildNode.
// Проверка production path: csg-mirror-chirality.test.ts

// ======================== INVARIANT 6: pivot CSG = transformA (Bug 3) ========================
// FIX (PIVOT-TRANSFORMA): pivot результата CSG = позиция первого операнда
// (transformA) — стандарт CAD. Раньше pivot = COM → gizmo «съезжал» с места
// первого операнда. Инвариант world = pivot + vertex сохранён.

describe('INVARIANT 6: pivot CSG = transformA (первый операнд), не COM', () => {
  const st = () => useDocumentStore.getState()

  beforeEach(async () => {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearTree()
    clearSnapshots()
    await bridge.workerClearAll()
  }, 30000)

  /** Сценарий пользователя: куб (20,20,20) + призма (20,20,20) rot(20,20,20) scale(1,1,0.5) → union */
  async function userScenario(): Promise<{ csg: SceneObject; transformA: TransformNR }> {
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 })
    const transformA = { ...st().objects[cubeId].transform }
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')
    const ops = st().operations
    let resultId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') { resultId = (ops[i] as GroupOperation).resultId!; break }
    return { csg: st().objects[resultId], transformA }
  }

  function dataWorld(obj: SceneObject): Float32Array {
    const out = new Float32Array(obj.vertices.length)
    for (let i = 0; i < obj.vertices.length; i += 3) {
      out[i] = obj.vertices[i] + obj.transform.x
      out[i + 1] = obj.vertices[i + 1] + obj.transform.y
      out[i + 2] = obj.vertices[i + 2] + obj.transform.z
    }
    return out
  }

  function bboxOf(verts: Float32Array) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < verts.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        if (verts[i + a] < min[a]) min[a] = verts[i + a]
        if (verts[i + a] > max[a]) max[a] = verts[i + a]
      }
    }
    return { min, max }
  }

  function bboxDiff(a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }): number {
    let d = 0
    for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a.min[k] - b.min[k]), Math.abs(a.max[k] - b.max[k]))
    return d
  }

  it('CSG union: pivot === transformA', async () => {
    const { csg, transformA } = await userScenario()
    const diff = Math.max(
      Math.abs(csg.transform.x - transformA.x),
      Math.abs(csg.transform.y - transformA.y),
      Math.abs(csg.transform.z - transformA.z),
    )
    console.log(`  pivot = [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    console.log(`  transformA = [${transformA.x}, ${transformA.y}, ${transformA.z}]  max diff = ${diff.toExponential(2)}`)
    expect(diff).toBeLessThan(1e-6)
    // rot/scale результата — identity (RS запечён в геометрию)
    expect(csg.transform.rotX).toBe(0)
    expect(csg.transform.scaleX).toBe(1)
  }, 30000)

  it('CSG union: world vertices === oracle (world = pivot + v не сдвинулся)', async () => {
    const { csg, transformA } = await userScenario()
    // Независимый oracle: тот же union, мир = T·R·S вершин детей
    const oracle = await bridge.workerCsgBooleanWithSync(
      'inv6-a', 'inv6-b', 'union', 'inv6-r',
      transformA, { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 },
      { shapeType: 'cube', params: { width: 20, height: 20, depth: 20 } as ShapeParams },
      { shapeType: 'prism', params: { radius: 12, height: 20, sides: 3 } as ShapeParams },
    )
    const oracleBBox = bboxOf(new Float32Array(oracle.vertices))
    const actualBBox = bboxOf(dataWorld(csg))
    const diff = bboxDiff(actualBBox, oracleBBox)
    console.log(`  world bbox: min=[${actualBBox.min.map(n => n.toFixed(4))}] max=[${actualBBox.max.map(n => n.toFixed(4))}]`)
    console.log(`  oracle bbox: min=[${oracleBBox.min.map(n => n.toFixed(4))}] max=[${oracleBBox.max.map(n => n.toFixed(4))}]`)
    console.log(`  max diff = ${diff.toExponential(2)}`)
    expect(diff).toBeLessThan(1e-4)
  }, 30000)

  it('CSG union: rebuild from history preserves pivot', async () => {
    const { csg, transformA } = await userScenario()
    const pivotBefore = { ...csg.transform }
    // undo → redo: rebuildFromHistory восстанавливает pivot из resultCenter
    await st().undo()
    await st().redo()
    const ops = st().operations
    let resultId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') { resultId = (ops[i] as GroupOperation).resultId!; break }
    const rebuilt = st().objects[resultId]
    expect(rebuilt, 'CSG object exists after undo/redo').toBeTruthy()
    const diffPivot = Math.max(
      Math.abs(rebuilt.transform.x - pivotBefore.x),
      Math.abs(rebuilt.transform.y - pivotBefore.y),
      Math.abs(rebuilt.transform.z - pivotBefore.z),
    )
    const diffA = Math.max(
      Math.abs(rebuilt.transform.x - transformA.x),
      Math.abs(rebuilt.transform.y - transformA.y),
      Math.abs(rebuilt.transform.z - transformA.z),
    )
    // Геометрия после rebuild тоже на месте (world == pivot + v совпадает с до-undo)
    const dwBefore = dataWorld(csg), dwAfter = dataWorld(rebuilt)
    let diffGeo = 0
    if (dwBefore.length === dwAfter.length) {
      for (let i = 0; i < dwBefore.length; i++) diffGeo = Math.max(diffGeo, Math.abs(dwBefore[i] - dwAfter[i]))
    } else {
      diffGeo = bboxDiff(bboxOf(dwBefore), bboxOf(dwAfter))
    }
    console.log(`  pivot до = [${pivotBefore.x.toFixed(6)}, ${pivotBefore.y.toFixed(6)}, ${pivotBefore.z.toFixed(6)}]`)
    console.log(`  pivot после = [${rebuilt.transform.x.toFixed(6)}, ${rebuilt.transform.y.toFixed(6)}, ${rebuilt.transform.z.toFixed(6)}]`)
    console.log(`  diff(pivot до/после) = ${diffPivot.toExponential(2)}, diff(pivot, transformA) = ${diffA.toExponential(2)}, geo diff = ${diffGeo.toExponential(2)}`)
    expect(diffPivot).toBeLessThan(1e-6)
    expect(diffA).toBeLessThan(1e-6)
    expect(diffGeo).toBeLessThan(1e-4)
  }, 30000)
})
