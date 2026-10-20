// ============================================================
// csg-distance-test.ts — расстояние между вершинами до/после union
// ============================================================
//
// Пользователь: до union расстояние 20.33 мм, после — 17.34 мм (~3 мм сдвиг).
// World-vertex тесты зелёные → значит, либо:
//   (a) конкретные измеренные вершины НЕ совпадают в до/после (реальный баг), либо
//   (b) измеренная вершина ПОГЛОЩЕНА union (лежала внутри другого операнда) —
//       после union её нет на меше, UI привязался к ближайшей (кривая
//       пересечения) → расстояние изменилось. Это ожидаемое поведение union.
//
// Тест:
//   1. Независимые world-вершины куба и призмы ДО union.
//   2. Парные расстояния ДО.
//   3. Union.
//   4. Те же точки ищутся в CSG world (nearest-neighbor).
//   5. Парные расстояния ПОСЛЕ — сверка.

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

/** world = applyTRS(transform, raw − spawn) */
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

/** Ближайшая вершина CSG (по индексу) + расстояние. */
function findClosest(pt: [number, number, number], csgWorld: [number, number, number][]): { idx: number; pt: [number, number, number]; d: number } {
  let idx = -1, best = Infinity
  for (let i = 0; i < csgWorld.length; i++) {
    const d = dist(pt, csgWorld[i])
    if (d < best) { best = d; idx = i }
  }
  return { idx, pt: csgWorld[idx], d: best }
}

// ============================================================
// Тесты
// ============================================================

describe('CSG distance — расстояние между вершинами до/после union', () => {
  beforeEach(async () => {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearSnapshots()
    clearTree()
    await bridge.workerClearAll()
  }, 30000)

  it('Все парные расстояния (куб ↔ призма-вне-куба) совпадают до/после union', async () => {
    // ── 1. Создать куб и призму ──
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 })

    // ── 2. world-вершины ДО union (независимо) ──
    const cubeWorldBefore = computeWorldVerts(st().objects[cubeId])
    const prismWorldBefore = computeWorldVerts(st().objects[prismId])
    const cubeBBox = computeBBox(cubeWorldBefore)

    console.log('═══════════════════════════════════════════')
    console.log('  CSG DISTANCE TEST — до/после union')
    console.log('═══════════════════════════════════════════')
    console.log('  cube world (before):')
    cubeWorldBefore.forEach((v, i) => console.log(`    C${i}: [${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)}]`))
    console.log('  prism world (before):')
    prismWorldBefore.forEach((v, i) => console.log(`    P${i}: [${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)}]${isInsideBox(v, cubeBBox) ? '  <-- INSIDE cube (будет поглощена union)' : ''}`))

    // ── 3. Сохранить ВСЕ парные расстояния ДО ──
    interface Pair { ci: number; pi: number; dBefore: number; prismOutsideCube: boolean }
    const pairs: Pair[] = []
    for (let ci = 0; ci < cubeWorldBefore.length; ci++) {
      for (let pi = 0; pi < prismWorldBefore.length; pi++) {
        pairs.push({
          ci, pi,
          dBefore: dist(cubeWorldBefore[ci], prismWorldBefore[pi]),
          prismOutsideCube: !isInsideBox(prismWorldBefore[pi], cubeBBox),
        })
      }
    }

    // ── 4. Union ──
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')

    const ops = st().operations
    let csgId = ''
    for (let i = ops.length - 1; i >= 0; i--) if (ops[i].type === 'group') csgId = (ops[i] as GroupOperation).resultId!
    const csg = st().objects[csgId]
    expect(csg).toBeTruthy()

    // ── 5. CSG world ПОСЛЕ: pivot + vertex (pivot rot/scale = identity) ──
    const csgWorld: [number, number, number][] = []
    for (let i = 0; i < csg.vertices.length; i += 3) {
      csgWorld.push([csg.vertices[i] + csg.transform.x, csg.vertices[i + 1] + csg.transform.y, csg.vertices[i + 2] + csg.transform.z])
    }
    console.log(`  CSG pivot: [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    console.log(`  CSG vertex count: ${csgWorld.length}`)

    // ── 6. Для каждой пары — найти обе вершины в CSG, сравнить расстояния ──
    const TOL = 1e-3
    let maxDriftOutside = 0
    let worstPair = ''
    const absorbed: string[] = []

    console.log()
    console.log('  ── Парные расстояния (куб C{i} ↔ призма P{j}) ──')
    for (const p of pairs) {
      const cubePt = cubeWorldBefore[p.ci]
      const prismPt = prismWorldBefore[p.pi]
      const fC = findClosest(cubePt, csgWorld)
      const fP = findClosest(prismPt, csgWorld)
      const dAfter = dist(fC.pt, fP.pt)
      const drift = Math.abs(dAfter - p.dBefore)

      const cubeExists = fC.d < TOL
      const prismExists = fP.d < TOL

      if (!prismExists) {
        // Вершина призмы отсутствует в CSG → поглощена (или совмещена)
        absorbed.push(`P${p.pi}: [${prismPt[0].toFixed(4)}, ${prismPt[1].toFixed(4)}, ${prismPt[2].toFixed(4)}] nearest CSG dist=${fP.d.toFixed(4)}${p.prismOutsideCube ? '  !!! ВНЕ куба, но отсутствует' : ' (внутри куба — поглощена union, OK)'}`)
        continue
      }
      if (!cubeExists) {
        absorbed.push(`C${p.ci}: [${cubePt[0].toFixed(4)}, ${cubePt[1].toFixed(4)}, ${cubePt[2].toFixed(4)}] nearest CSG dist=${fC.d.toFixed(4)}  !!! куб-вершина отсутствует`)
        continue
      }

      if (drift > maxDriftOutside) {
        maxDriftOutside = drift
        worstPair = `C${p.ci}↔P${p.pi}: dBefore=${p.dBefore.toFixed(4)} dAfter=${dAfter.toFixed(4)} drift=${drift.toExponential(3)}`
      }
      if (p.dBefore > 15 && p.dBefore < 25) {
        console.log(`    C${p.ci}↔P${p.pi}: before=${p.dBefore.toFixed(4)}  after=${dAfter.toFixed(4)}  drift=${drift.toExponential(2)}${p.prismOutsideCube ? '' : '  (P внутри куба)'}`)
      }
    }

    console.log()
    console.log(`  Худшая пара: ${worstPair}`)
    console.log(`  Max drift (обе вершины существуют): ${maxDriftOutside.toExponential(4)}`)
    if (absorbed.length > 0) {
      console.log('  Поглощённые/отсутствующие вершины:')
      for (const a of [...new Set(absorbed)]) console.log(`    ${a}`)
    }

    // Все cube-вершины должны существовать в CSG (куб целиком? нет — часть может быть внутри призмы;
    // но в этом сценарии куб 20³ и призма частично пересекает — cube-вершины outside призмы обязаны быть)
    // Главное утверждение: если обе вершины пары существуют в CSG — расстояние совпадает.
    expect(maxDriftOutside).toBeLessThan(TOL)

    // Все cube-вершины существуют в CSG (в этом сценарии — да, куб не целиком в призме)
    for (let ci = 0; ci < cubeWorldBefore.length; ci++) {
      const f = findClosest(cubeWorldBefore[ci], csgWorld)
      expect(f.d).toBeLessThan(TOL)
    }

    console.log()
    console.log('═══ DISTANCE TEST: РАССТОЯНИЯ СОХРАНЕНЫ ═══')
  }, 30000)

  it('ДЕМОНСТРАЦИЯ: измерение до поглощённой вершины — расстояние «меняется» (не баг)', async () => {
    // Гипотеза для скриншота пользователя (20.33 → 17.34):
    // пользователь измерил расстояние ДО union между вершиной куба и вершиной
    // призмы, которая при union ПОГЛОЩАЕТСЯ (лежит внутри куба). После union
    // этой вершины на меше нет — привязка (snap) цепляется за ближайшую точку
    // (ребро/вершина кривой пересечения) → расстояние становится другим.
    // Это корректное поведение boolean union, а не сдвиг геометрии.

    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 })

    const cubeWorld = computeWorldVerts(st().objects[cubeId])
    const prismWorld = computeWorldVerts(st().objects[prismId])
    const cubeBBox = computeBBox(cubeWorld)

    // Вершины призмы вне куба и внутри куба
    const outside = prismWorld.filter(v => !isInsideBox(v, cubeBBox))
    const inside = prismWorld.filter(v => isInsideBox(v, cubeBBox))
    console.log(`  Призма: ${outside.length} вершин вне куба, ${inside.length} внутри (поглощаются)`)
    inside.forEach(v => console.log(`    absorbed: [${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)}]`))

    // Измерение до union: C0 ↔ absorbed P
    const c0 = cubeWorld[0]
    const absorbedP = inside[0]
    const dBefore = dist(c0, absorbedP)
    console.log(`  ДО union: C0 [${c0.map(n => n.toFixed(4)).join(',')}] ↔ Pabs [${absorbedP.map(n => n.toFixed(4)).join(',')}] = ${dBefore.toFixed(4)}`)

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

    const fC = findClosest(c0, csgWorld)
    const fAbs = findClosest(absorbedP, csgWorld)
    const dAfter = dist(fC.pt, fAbs.pt)
    console.log(`  ПОСЛЕ union: ближайшая к Pabs = [${fAbs.pt.map(n => n.toFixed(4)).join(',')}] (dist ${fAbs.d.toFixed(4)} — вершина поглощена, это НЕ она)`)
    console.log(`  «расстояние» к ближайшей точке: before=${dBefore.toFixed(4)} after=${dAfter.toFixed(4)} diff=${Math.abs(dAfter - dBefore).toFixed(4)}`)

    // Вне-кубовые вершины призмы — обязаны сохраниться, расстояние к ним совпадает
    const pOut = outside[0]
    const dBeforeOut = dist(c0, pOut)
    const fOut = findClosest(pOut, csgWorld)
    const dAfterOut = dist(fC.pt, fOut.pt)
    console.log(`  Вне-кубовая Pout [${pOut.map(n => n.toFixed(4)).join(',')}]: before=${dBeforeOut.toFixed(4)} after=${dAfterOut.toFixed(4)} drift=${Math.abs(dAfterOut - dBeforeOut).toExponential(2)}`)

    // Сохранённая (вне) вершина: distance совпадает
    expect(fOut.d).toBeLessThan(1e-3)
    expect(Math.abs(dAfterOut - dBeforeOut)).toBeLessThan(1e-3)
    // Поглощённая вершина: её НЕТ в CSG (dist > tolerance) — это и есть объяснение
    // «изменения расстояния» на скриншоте пользователя.
    expect(fAbs.d).toBeGreaterThan(1e-3)
  }, 30000)
})
