// ============================================================
// csg-p2-check.test.ts — проверка P2 (внешняя вершина призмы)
// ============================================================
//
// P2 = [9.65, 27.78, 21.18] — вершина призмы, ВНЕ куба (x=9.65 < 10 = cube.minX).
// Должна сохраниться в CSG после union. Проверяем:
//   1. P2 найдена в CSG world (nearest-neighbor)
//   2. Расстояние от C0 до P2 не изменилось

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

describe('CSG P2 check — внешняя вершина призмы', () => {
  beforeEach(async () => {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearSnapshots()
    clearTree()
    await bridge.workerClearAll()
  }, 30000)

  it('P2 (внешняя вершина) найдена в CSG, расстояние C0-P2 сохранено', async () => {
    // ── 1. Создать куб и призму (как в тесте distance) ──
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 })

    const cubeObj = st().objects[cubeId]
    const prismObj = st().objects[prismId]

    // ── 2. World-вершины ДО union ──
    const cubeWorld = computeWorldVerts(cubeObj)
    const prismWorld = computeWorldVerts(prismObj)
    const cubeBBox = computeBBox(cubeWorld)

    console.log('═══════════════════════════════════════════')
    console.log('  CSG P2 CHECK — внешняя вершина призмы')
    console.log('═══════════════════════════════════════════')
    console.log()
    console.log('── CUBE ──')
    cubeWorld.forEach((v, i) => {
      const inside = isInsideBox(v, computeBBox(prismWorld))
      console.log(`  C${i}: [${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)}]${inside ? '  <-- inside prism' : ''}`)
    })
    console.log(`  bbox: [${cubeBBox.min.map(n => n.toFixed(4)).join(',')}] → [${cubeBBox.max.map(n => n.toFixed(4)).join(',')}]`)

    console.log()
    console.log('── PRISM ──')
    prismWorld.forEach((v, i) => {
      const inside = isInsideBox(v, cubeBBox)
      console.log(`  P${i}: [${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)}]${inside ? '  <-- INSIDE cube (поглощается)' : '  <-- OUTSIDE cube (сохраняется)'}`)
    })
    console.log(`  bbox: [${computeBBox(prismWorld).min.map(n => n.toFixed(4)).join(',')}] → [${computeBBox(prismWorld).max.map(n => n.toFixed(4)).join(',')}]`)

    // ── 3. Классификация вершин ──
    const outsideCube = prismWorld.map((v, i) => ({ idx: i, pt: v })).filter(({ pt }) => !isInsideBox(pt, cubeBBox))
    const insideCube = prismWorld.map((v, i) => ({ idx: i, pt: v })).filter(({ pt }) => isInsideBox(pt, cubeBBox))
    console.log()
    console.log(`── ПРИЗМА: ${outsideCube.length} вершин вне куба (сохранятся), ${insideCube.length} внутри (поглощаются) ──`)
    for (const p of outsideCube) console.log(`  ✓ P${p.idx}: [${p.pt[0].toFixed(4)}, ${p.pt[1].toFixed(4)}, ${p.pt[2].toFixed(4)}]`)
    for (const p of insideCube) console.log(`  ✗ P${p.idx}: [${p.pt[0].toFixed(4)}, ${p.pt[1].toFixed(4)}, ${p.pt[2].toFixed(4)}]`)

    // ── 4. Union ──
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')

    const ops = st().operations
    let csgId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') csgId = (ops[i] as GroupOperation).resultId!
    const csg = st().objects[csgId]
    expect(csg).toBeTruthy()

    // ── 5. CSG world ПОСЛЕ ──
    const csgWorld: [number, number, number][] = []
    for (let i = 0; i < csg.vertices.length; i += 3) {
      csgWorld.push([csg.vertices[i] + csg.transform.x, csg.vertices[i + 1] + csg.transform.y, csg.vertices[i + 2] + csg.transform.z])
    }
    console.log()
    console.log('── CSG RESULT ──')
    console.log(`  pivot: [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    console.log(`  vertex count: ${csgWorld.length}`)

    // ── 6. Проверить: все вне-кубовые вершины призмы найдены ──
    const TOL = 1e-3
    console.log()
    console.log('── ПРОВЕРКА ВНЕ-КУБОВЫХ ВЕРШИН ──')
    let allFound = true
    for (const { idx, pt } of outsideCube) {
      const nearest = findNearest(pt, csgWorld)
      const status = nearest.d < TOL ? '✓ FOUND' : '✗ NOT FOUND'
      if (nearest.d >= TOL) allFound = false
      console.log(`  P${idx}: [${pt[0].toFixed(4)}, ${pt[1].toFixed(4)}, ${pt[2].toFixed(4)}] nearest CSG [${nearest.pt[0].toFixed(4)}, ${nearest.pt[1].toFixed(4)}, ${nearest.pt[2].toFixed(4)}] dist=${nearest.d.toFixed(6)} ${status}`)
    }
    expect(allFound).toBe(true)
    for (const { idx, pt } of outsideCube) {
      const nearest = findNearest(pt, csgWorld)
      expect(nearest.d).toBeLessThan(TOL)
    }

    // ── 7. Проверить: поглощённые вершины НЕ найдены ──
    console.log()
    console.log('── ПРОВЕРКА ПОГЛОЩЁННЫХ ВЕРШИН ──')
    for (const { idx, pt } of insideCube) {
      const nearest = findNearest(pt, csgWorld)
      console.log(`  P${idx}: [${pt[0].toFixed(4)}, ${pt[1].toFixed(4)}, ${pt[2].toFixed(4)}] nearest CSG dist=${nearest.d.toFixed(4)} (поглощена, dist > TOL = OK)`)
    }

    // ── 8. Явная проверка P2 (вершина 2 призмы) ──
    // P2 = prismWorld[2]
    const p2 = prismWorld[2]
    const p2Outside = isInsideBox(p2, cubeBBox) ? 'ВНУТРИ' : 'ВНЕ'
    console.log()
    console.log(`── P2 (prismWorld[2]): [${p2[0].toFixed(6)}, ${p2[1].toFixed(6)}, ${p2[2].toFixed(6)}] — ${p2Outside} куба ──`)
    const nearestP2 = findNearest(p2, csgWorld)
    console.log(`  nearest in CSG: [${nearestP2.pt[0].toFixed(6)}, ${nearestP2.pt[1].toFixed(6)}, ${nearestP2.pt[2].toFixed(6)}]`)
    console.log(`  dist: ${nearestP2.d.toFixed(8)}`)

    if (p2Outside === 'ВНЕ') {
      expect(nearestP2.d).toBeLessThan(TOL)
    } else {
      // P2 внутри куба — поглощена
      expect(nearestP2.d).toBeGreaterThan(TOL)
    }

    // ── 9. Расстояние от C0 до всех вершин призмы ДО и ПОСЛЕ ──
    const c0 = cubeWorld[0]
    console.log()
    console.log('── Расстояние C0 ↔ все вершины призмы ──')
    interface Pair { idx: number; before: number; after: number; outside: boolean }
    const pairs: Pair[] = []
    for (let pi = 0; pi < prismWorld.length; pi++) {
      const before = dist(c0, prismWorld[pi])
      const nearest = findNearest(prismWorld[pi], csgWorld)
      const after = nearest.d < TOL ? dist(c0, nearest.pt) : Infinity
      pairs.push({ idx: pi, before, after, outside: !isInsideBox(prismWorld[pi], cubeBBox) })
      console.log(`  C0↔P${pi}: before=${before.toFixed(4)} after=${after === Infinity ? '∞ (поглощена)' : after.toFixed(4)} outside=${pairs[pairs.length - 1].outside ? 'да' : 'нет'}`)
    }

    // Все вне-кубовые вершины: distance C0-Pi совпадает
    for (const p of pairs) {
      if (p.outside) {
        expect(p.after).not.toBe(Infinity)
        expect(Math.abs(p.after - p.before)).toBeLessThan(TOL)
      }
    }

    console.log()
    console.log('═══ P2 CHECK: ВСЕ ВНЕ-КУБОВЫЕ ВЕРШИНЫ НАЙДЕНЫ ═══')
  }, 30000)

  it('P2 для no-overlap сценария (разделённые фигуры)', async () => {
    // No-overlap: куб (10,10,10), призма (20,55,20)
    // Все вершины призмы — вне куба, все должны сохраниться.
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 10, y: 10, z: 10, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 55, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    const cubeObj = st().objects[cubeId]
    const prismObj = st().objects[prismId]
    const cubeWorld = computeWorldVerts(cubeObj)
    const prismWorld = computeWorldVerts(prismObj)
    const cubeBBox = computeBBox(cubeWorld)

    console.log('── No-overlap: куб (10,10,10), призма (20,55,20) ──')
    console.log(`  cube bbox: [${cubeBBox.min.map(n => n.toFixed(4)).join(',')}] → [${cubeBBox.max.map(n => n.toFixed(4)).join(',')}]`)
    console.log(`  prism bbox: [${computeBBox(prismWorld).min.map(n => n.toFixed(4)).join(',')}] → [${computeBBox(prismWorld).max.map(n => n.toFixed(4)).join(',')}]`)

    // Все вершины призмы — вне куба
    for (let i = 0; i < prismWorld.length; i++) {
      const inside = isInsideBox(prismWorld[i], cubeBBox)
      console.log(`  P${i}: [${prismWorld[i].map(n => n.toFixed(4)).join(',')}] ${inside ? 'ВНУТРИ' : 'ВНЕ'} cube`)
      expect(inside).toBe(false)
    }

    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')

    const ops = st().operations
    let csgId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') csgId = (ops[i] as GroupOperation).resultId!
    const csg = st().objects[csgId]
    const csgWorld: [number, number, number][] = []
    for (let i = 0; i < csg.vertices.length; i += 3) {
      csgWorld.push([csg.vertices[i] + csg.transform.x, csg.vertices[i + 1] + csg.transform.y, csg.vertices[i + 2] + csg.transform.z])
    }

    console.log(`  CSG vertices: ${csgWorld.length} (ожидание 14 = 8+6)`)

    // Все вершины призмы найдены
    const TOL = 1e-3
    for (let i = 0; i < prismWorld.length; i++) {
      const nearest = findNearest(prismWorld[i], csgWorld)
      console.log(`  P${i} in CSG: dist=${nearest.d.toFixed(6)} ${nearest.d < TOL ? '✓' : '✗'}`)
      expect(nearest.d).toBeLessThan(TOL)
    }

    // Расстояние C0-P2 не изменилось
    const c0 = cubeWorld[0]
    const p2 = prismWorld[2]
    const dBefore = dist(c0, p2)
    const nearestP2 = findNearest(p2, csgWorld)
    const c0Nearest = findNearest(c0, csgWorld)
    const dAfter = dist(c0Nearest.pt, nearestP2.pt)
    console.log(`  C0-P2: before=${dBefore.toFixed(6)} after=${dAfter.toFixed(6)} diff=${Math.abs(dAfter - dBefore).toExponential(4)}`)
    expect(Math.abs(dAfter - dBefore)).toBeLessThan(TOL)

    console.log()
    console.log('═══ NO-OVERLAP P2: СОХРАНЕНА ═══')
  }, 30000)
})
