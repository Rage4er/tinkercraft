// ============================================================
// csg-no-overlap.test.ts — union двух непересекающихся фигур
// ============================================================
//
// Исключает «поглощение вершины» как объяснение. Куб и призма на разных
// позициях, их bbox НЕ пересекаются. После union все вершины должны
// сохраниться (не поглощаются), расстояния между парами вершин — точные.

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
// Независимая TRS
// ============================================================

function applyTRS(v: [number, number, number], t: TransformNR): [number, number, number] {
  let [x, y, z] = v
  x *= t.scaleX; y *= t.scaleY; z *= t.scaleZ
  const rx = t.rotX * Math.PI / 180, ry = t.rotY * Math.PI / 180, rz = t.rotZ * Math.PI / 180
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz)
  const x2 = (cy * cz) * x + (-cy * sz) * y + (sy) * z
  const y2 = (cx * sz + sx * sy * cz) * x + (cx * cz - sx * sy * sz) * y + (-sx * cy) * z
  const z2 = (-cx * sy * cz + sx * sz) * x + (cx * sy * sz + sx * cz) * y + (cx * cy) * z
  return [x2 + t.x, y2 + t.y, z2 + t.z]
}

function getSpawnTransform(id: string): TransformNR {
  const ops = st().operations
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i] as AddShapeOperation
    if (op.type === 'add_shape' && op.id === id) return { ...op.transform }
  }
  return IDENTITY
}

function computeWorldVerts(obj: SceneObject): [number, number, number][] {
  const sp = getSpawnTransform(obj.id)
  const out: [number, number, number][] = []
  for (let i = 0; i < obj.vertices.length; i += 3) {
    out.push(applyTRS([obj.vertices[i] - sp.x, obj.vertices[i + 1] - sp.y, obj.vertices[i + 2] - sp.z], obj.transform))
  }
  return out
}

function dist(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function computeBBox(pts: [number, number, number][]) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (const p of pts) for (let a = 0; a < 3; a++) {
    if (p[a] < min[a]) min[a] = p[a]
    if (p[a] > max[a]) max[a] = p[a]
  }
  return { min, max }
}

function isInsideBox(pt: [number, number, number], box: { min: number[]; max: number[] }): boolean {
  return pt[0] >= box.min[0] - 1e-9 && pt[0] <= box.max[0] + 1e-9 &&
    pt[1] >= box.min[1] - 1e-9 && pt[1] <= box.max[1] + 1e-9 &&
    pt[2] >= box.min[2] - 1e-9 && pt[2] <= box.max[2] + 1e-9
}

function bboxOverlap(a: { min: number[]; max: number[] }, b: { min: number[]; max: number[] }): boolean {
  return a.min[0] <= b.max[0] && a.max[0] >= b.min[0] &&
    a.min[1] <= b.max[1] && a.max[1] >= b.min[1] &&
    a.min[2] <= b.max[2] && a.max[2] >= b.min[2]
}

function findNearest(pt: [number, number, number], world: [number, number, number][]): { idx: number; pt: [number, number, number]; d: number } {
  let idx = -1, best = Infinity
  for (let i = 0; i < world.length; i++) {
    const d = dist(pt, world[i])
    if (d < best) { best = d; idx = i }
  }
  return { idx, pt: world[idx], d: best }
}

// ============================================================
// Тесты
// ============================================================

describe('CSG no-overlap — union без пересечения', () => {
  beforeEach(async () => {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearSnapshots()
    clearTree()
    await bridge.workerClearAll()
  }, 30000)

  it('Union без пересечения: все вершины сохранены, расстояния точные', async () => {
    // ── 1. Куб (10,10,10), 20x20x20 → bbox [0,0,0] → [20,20,20] ──
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 10, y: 10, z: 10, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // ── 2. Призма (20,40,20), radius=12, height=20, sides=3, rot(0,0,0) ──
    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 40, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // ── 3. world-вершины ДО ──
    const cubeObj = st().objects[cubeId]
    const prismObj = st().objects[prismId]
    const cubeWorld = computeWorldVerts(cubeObj)
    const prismWorld = computeWorldVerts(prismObj)
    const cubeBBox = computeBBox(cubeWorld)
    const prismBBox = computeBBox(prismWorld)

    const cubeT = cubeObj.transform
    const prismT = prismObj.transform
    const cubeSpawn = getSpawnTransform(cubeId)
    const prismSpawn = getSpawnTransform(prismId)

    console.log('═══════════════════════════════════════════')
    console.log('  CSG NO-OVERLAP — union двух отдельных фигур')
    console.log('═══════════════════════════════════════════')
    console.log()
    console.log('── CUBE (10, 10, 10), 20x20x20 ──')
    console.log(`  spawn:    [${cubeSpawn.x}, ${cubeSpawn.y}, ${cubeSpawn.z}]`)
    console.log(`  transform: [${cubeT.x}, ${cubeT.y}, ${cubeT.z}]`)
    console.log(`  bbox:     [${cubeBBox.min.map(n => n.toFixed(4)).join(',')}] → [${cubeBBox.max.map(n => n.toFixed(4)).join(',')}]`)
    cubeWorld.forEach((v, i) => console.log(`    C${i}: [${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)}]`))

    console.log()
    console.log('── PRISM (20, 40, 20), radius=12, height=20, sides=3 ──')
    console.log(`  spawn:    [${prismSpawn.x}, ${prismSpawn.y}, ${prismSpawn.z}]`)
    console.log(`  transform: [${prismT.x}, ${prismT.y}, ${prismT.z}]`)
    console.log(`  bbox:     [${prismBBox.min.map(n => n.toFixed(4)).join(',')}] → [${prismBBox.max.map(n => n.toFixed(4)).join(',')}]`)
    prismWorld.forEach((v, i) => console.log(`    P${i}: [${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)}]`))

    // ── 4. Проверка: bbox НЕ пересекаются ──
    const overlaps = bboxOverlap(cubeBBox, prismBBox)
    console.log()
    console.log(`── BBOX OVERLAP: ${overlaps ? 'ДА (пересекаются)' : 'НЕТ (раздельные)'} ──`)
    if (overlaps) {
      console.warn('  ⚠️  BBox пересекаются — test не подходит для no-overlap проверки')
    }
    // Z: cube.maxZ=20, prism.minZ=10 → cube [10,20] vs prism [10,30] → overlap Z.
    // Y: cube.maxY=30, prism.minY=40-12=28 → cube [10,30] vs prism [28,52] → overlap Y.
    // X: cube.maxX=30, prism.minX=20-12=8 → overlap X.
    // Корректируем: призма на Y=55 → bbox [43, 67] vs cube [10, 30] → no overlap.
    // Нет — лучше переместим призму подальше.
    console.log()
    console.log('── Перемещаем призму на Y=55 для гарантированного no-overlap ──')

    // Перемещаем призму дальше
    await st().moveObject(prismId, { x: 20, y: 55, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    const prismWorld2 = computeWorldVerts(st().objects[prismId])
    const prismBBox2 = computeBBox(prismWorld2)
    const prismT2 = st().objects[prismId].transform

    console.log(`  new prism bbox: [${prismBBox2.min.map(n => n.toFixed(4)).join(',')}] → [${prismBBox2.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log(`  cube bbox:      [${cubeBBox.min.map(n => n.toFixed(4)).join(',')}] → [${cubeBBox.max.map(n => n.toFixed(4)).join(',')}]`)
    const overlaps2 = bboxOverlap(cubeBBox, prismBBox2)
    console.log(`  overlap: ${overlaps2 ? 'ДА' : 'НЕТ'} ✅`)
    expect(overlaps2).toBe(false)

    // ── 5. Сохранить все парные расстояния ──
    interface Pair { ci: number; pi: number; dBefore: number }
    const pairs: Pair[] = []
    for (let ci = 0; ci < cubeWorld.length; ci++) {
      for (let pi = 0; pi < prismWorld2.length; pi++) {
        pairs.push({ ci, pi, dBefore: dist(cubeWorld[ci], prismWorld2[pi]) })
      }
    }

    // ── 6. Union ──
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')

    const ops = st().operations
    let csgId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') csgId = (ops[i] as GroupOperation).resultId!
    const csg = st().objects[csgId]
    expect(csg).toBeTruthy()

    // ── 7. CSG world ПОСЛЕ ──
    const csgWorld: [number, number, number][] = []
    for (let i = 0; i < csg.vertices.length; i += 3) {
      csgWorld.push([csg.vertices[i] + csg.transform.x, csg.vertices[i + 1] + csg.transform.y, csg.vertices[i + 2] + csg.transform.z])
    }

    console.log()
    console.log('── CSG RESULT (after union) ──')
    console.log(`  id:        ${csgId}`)
    console.log(`  shapeType: ${csg.shapeType}`)
    console.log(`  pivot:     [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    console.log(`  csg.vertices count: ${csg.vertices.length / 3}`)
    console.log(`  csgWorld count: ${csgWorld.length}`)

    // ── 8. Проверить: pivot = transformA (куб) ──
    const pivotDiff = Math.max(
      Math.abs(csg.transform.x - cubeT.x),
      Math.abs(csg.transform.y - cubeT.y),
      Math.abs(csg.transform.z - cubeT.z),
    )
    console.log(`  pivot diff vs cube transform: ${pivotDiff.toExponential(4)} (expect <1e-6)`)
    expect(pivotDiff).toBeLessThan(1e-6)

    // ── 9. Проверить: все cube-вершины и все prism-вершины найдены ──
    const TOL = 1e-3
    let cubeMissing = 0, prismMissing = 0
    for (let ci = 0; ci < cubeWorld.length; ci++) {
      const f = findNearest(cubeWorld[ci], csgWorld)
      if (f.d > TOL) { cubeMissing++; console.log(`  MISSING C${ci}: [${cubeWorld[ci].map(n => n.toFixed(4)).join(',')}] dist=${f.d.toFixed(4)}`) }
    }
    for (let pi = 0; pi < prismWorld2.length; pi++) {
      const f = findNearest(prismWorld2[pi], csgWorld)
      if (f.d > TOL) { prismMissing++; console.log(`  MISSING P${pi}: [${prismWorld2[pi].map(n => n.toFixed(4)).join(',')}] dist=${f.d.toFixed(4)}`) }
    }
    console.log(`  Cube missing: ${cubeMissing} of ${cubeWorld.length}`)
    console.log(`  Prism missing: ${prismMissing} of ${prismWorld2.length}`)
    expect(cubeMissing).toBe(0)
    expect(prismMissing).toBe(0)

    // ── 10. Проверить: все парные расстояния совпадают ──
    let maxDrift = 0
    let worstPair = ''
    for (const p of pairs) {
      const c = findNearest(cubeWorld[p.ci], csgWorld)
      const pr = findNearest(prismWorld2[p.pi], csgWorld)
      const dAfter = dist(c.pt, pr.pt)
      const drift = Math.abs(dAfter - p.dBefore)
      if (drift > maxDrift) { maxDrift = drift; worstPair = `C${p.ci}↔P${p.pi}` }
    }
    console.log(`  Max pairwise drift: ${maxDrift.toExponential(4)} at ${worstPair}`)
    expect(maxDrift).toBeLessThan(TOL)

    // ── 11. Явные пары ──
    // C0 ↔ P0
    const fc0 = findNearest(cubeWorld[0], csgWorld)
    const fp0 = findNearest(prismWorld2[0], csgWorld)
    const dBefore00 = dist(cubeWorld[0], prismWorld2[0])
    const dAfter00 = dist(fc0.pt, fp0.pt)
    console.log()
    console.log('── Явные пары (C0 ↔ P0) ──')
    console.log(`  C0 before: [${cubeWorld[0].map(n => n.toFixed(4)).join(',')}]`)
    console.log(`  P0 before: [${prismWorld2[0].map(n => n.toFixed(4)).join(',')}]`)
    console.log(`  C0 after:  [${fc0.pt.map(n => n.toFixed(4)).join(',')}] (nearest CSG, dist=${fc0.d.toFixed(6)})`)
    console.log(`  P0 after:  [${fp0.pt.map(n => n.toFixed(4)).join(',')}] (nearest CSG, dist=${fp0.d.toFixed(6)})`)
    console.log(`  dist before: ${dBefore00.toFixed(6)}`)
    console.log(`  dist after:  ${dAfter00.toFixed(6)}`)
    console.log(`  diff: ${Math.abs(dAfter00 - dBefore00).toExponential(4)}`)

    // Сдвиг P0
    const pShift = {
      x: fp0.pt[0] - prismWorld2[0][0],
      y: fp0.pt[1] - prismWorld2[0][1],
      z: fp0.pt[2] - prismWorld2[0][2],
    }
    console.log(`  P0 shift: [${pShift.x.toFixed(6)}, ${pShift.y.toFixed(6)}, ${pShift.z.toFixed(6)}]`)
    expect(Math.abs(dAfter00 - dBefore00)).toBeLessThan(TOL)

    console.log()
    console.log('═══ NO-OVERLAP: ВСЕ ВЕРШИНЫ И РАССТОЯНИЯ СОХРАНЕНЫ ═══')
  }, 30000)
})
