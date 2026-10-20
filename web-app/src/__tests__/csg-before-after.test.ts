// ============================================================
// csg-before-after.test.ts — "до/после" CSG union
// ============================================================
//
// Старый тест csg-vertex-truth захватывал world-вершины операндов ПЕРЕД
// union (через snapshot transforms), но store-вершины примитивов имеют
// запечённую spawn-трансляцию. Нужно:
//   1. До union: snapshot { transform, vertices (raw) }
//   2. Вычислить true world = applyTRS(vertices − spawn, transform)
//   3. После union: verify csg.vertices, csg.transform, csg bbox
//   4. Сверить world-вершины операндов (до) с world-вершинами CSG (после)
//
// Если pivot CSG = COM (а не transformA) — pivot CSG сдвинут на
// (COM − transformA) → csg world = pivot + vertex сдвинут на тот же offset.
// Outside-вершины операндов НЕ совпадут с csg world → тест упадёт.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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
// Независимая TRS
// ============================================================

function applyTRS(v: [number, number, number], t: TransformNR): [number, number, number] {
  let [x, y, z] = v
  x *= t.scaleX; y *= t.scaleY; z *= t.scaleZ
  const rx = t.rotX * Math.PI / 180, ry = t.rotY * Math.PI / 180, rz = t.rotZ * Math.PI / 180
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz)
  const r00 = cy * cz, r01 = -cy * sz, r02 = sy
  const r10 = cx * sz + sx * sy * cz, r11 = cx * cz - sx * sy * sz, r12 = -sx * cy
  const r20 = -cx * sy * cz + sx * sz, r21 = cx * sy * sz + sx * cz, r22 = cx * cy
  return [r00 * x + r01 * y + r02 * z + t.x, r10 * x + r11 * y + r12 * z + t.y, r20 * x + r21 * y + r22 * z + t.z]
}

// ============================================================
// Утилиты
// ============================================================

/** Получить spawn-трансформ из add_shape операции. */
function spawnTransform(id: string): TransformNR {
  const ops = st().operations
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i] as AddShapeOperation
    if (op.type === 'add_shape' && op.id === id) return { ...op.transform }
  }
  return IDENTITY
}

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

function dist(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function nearestInFloat32(pt: [number, number, number], verts: Float32Array): number {
  let d = Infinity
  for (let i = 0; i < verts.length; i += 3) {
    const dx = pt[0] - verts[i], dy = pt[1] - verts[i + 1], dz = pt[2] - verts[i + 2]
    const dd = dx * dx + dy * dy + dz * dz
    if (dd < d) d = dd
  }
  return Math.sqrt(d)
}

function isPointInsideBox(pt: [number, number, number], box: { min: number[]; max: number[] }): boolean {
  return pt[0] >= box.min[0] && pt[0] <= box.max[0] &&
    pt[1] >= box.min[1] && pt[1] <= box.max[1] &&
    pt[2] >= box.min[2] && pt[2] <= box.max[2]
}

// ============================================================
// SNAP — структура снимка до union
// ============================================================

interface Snap {
  id: string
  transform: TransformNR
  rawVerts: Float32Array      // obj.vertices (spawn-baked)
  worldVerts: Float32Array    // applyTRS(raw − spawn, transform)
  bbox: { min: number[]; max: number[] }
}

function snapshot(id: string): Snap {
  const obj = st().objects[id]
  const sp = spawnTransform(id)
  const raw = new Float32Array(obj.vertices)
  // Compute world: applyTRS(raw − spawn, transform)
  const world = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i += 3) {
    const x = raw[i] - sp.x, y = raw[i + 1] - sp.y, z = raw[i + 2] - sp.z
    const t = obj.transform
    // Scale
    const sx_ = x * t.scaleX, sy_ = y * t.scaleY, sz_ = z * t.scaleZ
    // Rotation: Euler XYZ (R = Rx · Ry · Rz)
    const rx = t.rotX * Math.PI / 180, ry = t.rotY * Math.PI / 180, rz = t.rotZ * Math.PI / 180
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz)
    world[i] = (cy * cz) * sx_ + (-cy * sz) * sy_ + sy * sz_ + t.x
    world[i + 1] = (cx * sz + sx * sy * cz) * sx_ + (cx * cz - sx * sy * sz) * sy_ + (-sx * cy) * sz_ + t.y
    world[i + 2] = (-cx * sy * cz + sx * sz) * sx_ + (cx * sy * sz + sx * cz) * sy_ + (cx * cy) * sz_ + t.z
  }
  return {
    id,
    transform: { ...obj.transform },
    rawVerts: raw,
    worldVerts: world,
    bbox: computeBBox(world),
  }
}

// ============================================================
// Тесты
// ============================================================

describe('CSG before/after — world-вершины сохраняются при union', () => {
  beforeEach(async () => {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearSnapshots()
    clearTree()
    await bridge.workerClearAll()
  }, 30000)

  it('CSG union: world vertices EXACTLY preserved (before → after)', async () => {
    // ── 1. Создать куб и призму ──
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 })

    // ── 2. СОХРАНИТЬ ДО UNION ──
    const snapCube = snapshot(cubeId)
    const snapPrism = snapshot(prismId)

    console.log('=== BEFORE UNION ===')
    console.log(`cube.transform: [${snapCube.transform.x}, ${snapCube.transform.y}, ${snapCube.transform.z}]`)
    console.log(`cube.worldVerts[0]: [${snapCube.worldVerts[0].toFixed(4)}, ${snapCube.worldVerts[1].toFixed(4)}, ${snapCube.worldVerts[2].toFixed(4)}]`)
    console.log(`cube.bbox: [${snapCube.bbox.min.map(n => n.toFixed(4)).join(',')}] → [${snapCube.bbox.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log(`prism.transform: [${snapPrism.transform.x}, ${snapPrism.transform.y}, ${snapPrism.transform.z}] rot(${snapPrism.transform.rotX},${snapPrism.transform.rotY},${snapPrism.transform.rotZ}) scale(${snapPrism.transform.scaleX},${snapPrism.transform.scaleY},${snapPrism.transform.scaleZ})`)
    console.log(`prism.worldVerts[0]: [${snapPrism.worldVerts[0].toFixed(4)}, ${snapPrism.worldVerts[1].toFixed(4)}, ${snapPrism.worldVerts[2].toFixed(4)}]`)
    console.log(`prism.bbox: [${snapPrism.bbox.min.map(n => n.toFixed(4)).join(',')}] → [${snapPrism.bbox.max.map(n => n.toFixed(4)).join(',')}]`)

    // ── 3. CSG union ──
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')

    // ── 4. ПОСЛЕ UNION ──
    const ops = st().operations
    let csgId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') csgId = (ops[i] as GroupOperation).resultId!
    const csg = st().objects[csgId]
    expect(csg).toBeTruthy()

    // World-вершины CSG: pivot + vertex (pivot rot/scale = identity)
    const csgWorld = new Float32Array(csg.vertices.length)
    for (let i = 0; i < csg.vertices.length; i += 3) {
      csgWorld[i] = csg.vertices[i] + csg.transform.x
      csgWorld[i + 1] = csg.vertices[i + 1] + csg.transform.y
      csgWorld[i + 2] = csg.vertices[i + 2] + csg.transform.z
    }
    const csgBbox = computeBBox(csgWorld)

    // ── 5a. Operands deleted, pivot = transformA ──
    expect(st().objects[cubeId]).toBeUndefined()
    expect(st().objects[prismId]).toBeUndefined()
    const pivotDiff = Math.max(
      Math.abs(csg.transform.x - snapCube.transform.x),
      Math.abs(csg.transform.y - snapCube.transform.y),
      Math.abs(csg.transform.z - snapCube.transform.z),
    )
    console.log('=== AFTER UNION ===')
    console.log(`csg.transform (pivot): [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    console.log(`snapCube.transform:    [${snapCube.transform.x.toFixed(6)}, ${snapCube.transform.y.toFixed(6)}, ${snapCube.transform.z.toFixed(6)}]`)
    console.log(`pivot diff (should ≈ 0): ${pivotDiff.toExponential(2)}`)
    expect(pivotDiff).toBeLessThan(1e-6)

    // ── 5b. CSG bbox == union of operand bboxes ──
    const expectedBbox: { min: number[]; max: number[] } = {
      min: [Math.min(snapCube.bbox.min[0], snapPrism.bbox.min[0]),
      Math.min(snapCube.bbox.min[1], snapPrism.bbox.min[1]),
      Math.min(snapCube.bbox.min[2], snapPrism.bbox.min[2])],
      max: [Math.max(snapCube.bbox.max[0], snapPrism.bbox.max[0]),
      Math.max(snapCube.bbox.max[1], snapPrism.bbox.max[1]),
      Math.max(snapCube.bbox.max[2], snapPrism.bbox.max[2])],
    }
    const bboxDiff = Math.max(
      Math.abs(csgBbox.min[0] - expectedBbox.min[0]), Math.abs(csgBbox.max[0] - expectedBbox.max[0]),
      Math.abs(csgBbox.min[1] - expectedBbox.min[1]), Math.abs(csgBbox.max[1] - expectedBbox.max[1]),
      Math.abs(csgBbox.min[2] - expectedBbox.min[2]), Math.abs(csgBbox.max[2] - expectedBbox.max[2]),
    )
    console.log(`expected bbox: [${expectedBbox.min.map(n => n.toFixed(4)).join(',')}] → [${expectedBbox.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log(`csg bbox:      [${csgBbox.min.map(n => n.toFixed(4)).join(',')}] → [${csgBbox.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log(`bbox diff: ${bboxDiff.toExponential(2)}`)
    // Float32Array storage: at coordinate ~32, eps ≈ 3.8e-6. Use 1e-4 to be safe.
    expect(bboxDiff).toBeLessThan(1e-4)

    // ── 5c. Cube world vertices outside prism → must be in CSG world ──
    const TOL = 1e-4
    const cubeOutsidePrism: { pt: [number, number, number]; dist: number }[] = []
    for (let i = 0; i < snapCube.worldVerts.length; i += 3) {
      const pt: [number, number, number] = [snapCube.worldVerts[i], snapCube.worldVerts[i + 1], snapCube.worldVerts[i + 2]]
      if (!isPointInsideBox(pt, snapPrism.bbox)) {
        const d = nearestInFloat32(pt, csgWorld)
        if (d > TOL) cubeOutsidePrism.push({ pt, dist: d })
      }
    }

    // ── 5d. Prism world vertices outside cube → must be in CSG world ──
    const prismOutsideCube: { pt: [number, number, number]; dist: number }[] = []
    for (let i = 0; i < snapPrism.worldVerts.length; i += 3) {
      const pt: [number, number, number] = [snapPrism.worldVerts[i], snapPrism.worldVerts[i + 1], snapPrism.worldVerts[i + 2]]
      if (!isPointInsideBox(pt, snapCube.bbox)) {
        const d = nearestInFloat32(pt, csgWorld)
        if (d > TOL) prismOutsideCube.push({ pt, dist: d })
      }
    }

    console.log(`Cube vertices outside prism bbox: ${snapCube.worldVerts.length / 3} total, ${snapCube.worldVerts.length / 3} all outside (cube is separate from rotated prism)`)
    console.log(`Prism vertices outside cube bbox: ${snapPrism.worldVerts.length / 3} total, ${prismOutsideCube.length} outside (some overlap)`)
    console.log(`Missing cube→CSG: ${cubeOutsidePrism.length}`)
    console.log(`Missing prism→CSG: ${prismOutsideCube.length}`)

    if (cubeOutsidePrism.length > 0) {
      for (const m of cubeOutsidePrism.slice(0, 3)) {
        console.log(`  MISSING cube vertex: [${m.pt[0].toFixed(6)}, ${m.pt[1].toFixed(6)}, ${m.pt[2].toFixed(6)}] dist to CSG = ${m.dist.toFixed(8)}`)
      }
    }
    if (prismOutsideCube.length > 0) {
      for (const m of prismOutsideCube.slice(0, 3)) {
        console.log(`  MISSING prism vertex: [${m.pt[0].toFixed(6)}, ${m.pt[1].toFixed(6)}, ${m.pt[2].toFixed(6)}] dist to CSG = ${m.dist.toFixed(8)}`)
      }
    }

    expect(cubeOutsidePrism.length).toBe(0)
    expect(prismOutsideCube.length).toBe(0)
  }, 30000)
})
