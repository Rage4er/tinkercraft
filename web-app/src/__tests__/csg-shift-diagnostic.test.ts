// ============================================================
// csg-shift-diagnostic.test.ts — ДИАГНОСТИКА CSG-сдвига (не фикс!)
// ============================================================
//
// Пользователь видит: при CSG union фигуры сдвигаются.
// Лог: assignedLocal (20.01, 19.98, 20.00) vs transformA (20,20,20).
//
// Сценарий пользователя:
//   Куб (20,20,20) identity
//   Призма sides=3 (20,20,20) rot(20,20,20) scale(1,1,0.5)
//   CSG union
//
// Измеряем:
//   1. pivot (csg.transform) vs transformA vs COM
//   2. world-вершины результата vs world-вершины union'а детей (oracle)
//   3. Gizmo = pivot (viewport берёт transform.position) — где он?
//
// Oracle: юним детей считается НЕЗАВИСИМО (workerCsgBooleanWithSync)
// и сравнивается с production-путём (csgBoolean).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as THREE from 'three'

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
import { clearTree } from '../csg/history-tree'
import { centerMassAtOrigin } from '../csg/geometry-utils'
import * as bridge from './worker-bridge'
import type { SceneObject, TransformNR, GroupOperation } from '../csg/types'

const st = () => useDocumentStore.getState()

function lastGroupResultId(): string {
  const ops = useDocumentStore.getState().operations
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].type === 'group') return (ops[i] as GroupOperation).resultId!
  }
  throw new Error('no group op')
}

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots()
  clearTree()
})

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

/** data-world (§5.4): world = pivot + vertex (pivot rot/scale = identity для CSG) */
function dataWorld(obj: SceneObject): Float32Array {
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < obj.vertices.length; i += 3) {
    out[i] = obj.vertices[i] + obj.transform.x
    out[i + 1] = obj.vertices[i + 1] + obj.transform.y
    out[i + 2] = obj.vertices[i + 2] + obj.transform.z
  }
  return out
}

/** Полный TRS-world (для oracle): v' = T·R·S·v */
function trsWorld(verts: Float32Array, t: TransformNR): Float32Array {
  // Euler XYZ (three.js default): R = Rz·Ry·Rx? Three.js Euler 'XYZ' => R = Rx*Ry*Rz?
  // Simplify: use THREE to avoid sign/order mistakes.
  const e = new THREE.Euler(t.rotX * Math.PI / 180, t.rotY * Math.PI / 180, t.rotZ * Math.PI / 180, 'XYZ')
  const q = new THREE.Quaternion().setFromEuler(e)
  const v = new THREE.Vector3()
  const out = new Float32Array(verts.length)
  for (let i = 0; i < verts.length; i += 3) {
    v.set(verts[i] * t.scaleX, verts[i + 1] * t.scaleY, verts[i + 2] * t.scaleZ).applyQuaternion(q)
    out[i] = v.x + t.x; out[i + 1] = v.y + t.y; out[i + 2] = v.z + t.z
  }
  return out
}

describe('CSG-СДВИГ — диагностика (куб + повёрнутая масштабированная призма)', () => {
  it('DIAG: pivot vs transformA vs COM, world vs oracle', async () => {
    // ── 1. Куб (20,20,20) identity ──
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // ── 2. Призма sides=3 (20,20,20) rot(20,20,20) scale(1,1,0.5) ──
    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    const prismT: TransformNR = { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 }
    await st().moveObject(prismId, prismT)

    const cubeT = { ...st().objects[cubeId].transform }
    const cubeVertsOrigin = new Float32Array(st().objects[cubeId].vertices)
    const prismVertsOrigin = new Float32Array(st().objects[prismId].vertices)

    // ── 3. CSG union через production-путь ──
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')
    const csgId = lastGroupResultId()
    const csg = st().objects[csgId]

    // ── 4. Данные pivot vs transformA ──
    console.log('=== PIVOT vs transformA ===')
    console.log('csg.transform (pivot):', JSON.stringify(csg.transform))
    console.log('transformA (cube):    ', JSON.stringify(cubeT))
    console.log('transformB (prism):   ', JSON.stringify(prismT))
    const pivotDiffA = Math.max(
      Math.abs(csg.transform.x - cubeT.x),
      Math.abs(csg.transform.y - cubeT.y),
      Math.abs(csg.transform.z - cubeT.z),
    )
    console.log(`pivot vs transformA diff = ${pivotDiffA.toFixed(6)}`)

    // ── 5. Инвариант (FIX PIVOT-TRANSFORMA, Bug 3): pivot = transformA ──
    // Вершины сдвинуты на (COM − transformA): world = pivot + vertex сохранён,
    // COM больше НЕ совпадает с pivot.
    const dw = dataWorld(csg)
    const comOfResult = centerMassAtOrigin(new Float32Array(dw), new Uint32Array(csg.indices))
    console.log('=== PIVOT = TRANSFORMA (Bug 3) ===')
    console.log(`COM(data-world) = [${comOfResult.cx.toFixed(6)}, ${comOfResult.cy.toFixed(6)}, ${comOfResult.cz.toFixed(6)}]`)
    console.log(`pivot           = [${csg.transform.x.toFixed(6)}, ${csg.transform.y.toFixed(6)}, ${csg.transform.z.toFixed(6)}]`)
    const comVsPivot = Math.max(
      Math.abs(comOfResult.cx - csg.transform.x),
      Math.abs(comOfResult.cy - csg.transform.y),
      Math.abs(comOfResult.cz - csg.transform.z),
    )
    console.log(`COM(data-world) vs pivot diff = ${comVsPivot.toFixed(8)} (≠ 0 — норма: pivot = transformA ≠ COM)`)

    // ── 6. ORACLE: независимый union детей (тот же worker, прямые вызовы) ──
    // дети origin-центрированы; world = T·R·S·v. Oracle = COM-центрированный
    // мир union'а, поставленный на pivot результата.
    const oracleMesh = await bridge.workerCsgBooleanWithSync(
      'diag-a', 'diag-b', 'union', 'diag-r',
      cubeT, prismT,
      { shapeType: 'cube', params: { width: 20, height: 20, depth: 20 } as never },
      { shapeType: 'prism', params: { radius: 12, height: 20, sides: 3 } as never },
    )
    const oracleVerts = new Float32Array(oracleMesh.vertices)
    const ocom = centerMassAtOrigin(oracleVerts, new Uint32Array(oracleMesh.indices))
    // Ставим oracle в мир: COM-центрированные вершины + COM = исходный мир.
    // (pivot = transformA — вершины результата центрированы НЕ вокруг pivot.)
    for (let i = 0; i < oracleVerts.length; i += 3) {
      oracleVerts[i] += ocom.cx
      oracleVerts[i + 1] += ocom.cy
      oracleVerts[i + 2] += ocom.cz
    }
    const expectedWorld = bboxOf(oracleVerts)
    const actualWorld = bboxOf(dw)
    const worldDiff = bboxDiff(actualWorld, expectedWorld)

    console.log('=== WORLD vs ORACLE ===')
    console.log(`oracle COM (should ≈ pivot): [${ocom.cx.toFixed(4)}, ${ocom.cy.toFixed(4)}, ${ocom.cz.toFixed(4)}]`)
    console.log(`actual world bbox: min=[${actualWorld.min.map(n => n.toFixed(3))}] max=[${actualWorld.max.map(n => n.toFixed(3))}]`)
    console.log(`oracle world bbox: min=[${expectedWorld.min.map(n => n.toFixed(3))}] max=[${expectedWorld.max.map(n => n.toFixed(3))}]`)
    console.log(`WORLD vs ORACLE bbox diff = ${worldDiff.toFixed(6)}`)

    // ── 7. Gizmo: viewport берёт transform.position как позицию pivot ──
    // (Viewport3D: pivot.position.set(t.x, t.y, t.z)). Значит gizmo = pivot = transformA.
    console.log('=== GIZMO ===')
    console.log(`gizmo position = pivot = [${csg.transform.x.toFixed(4)}, ${csg.transform.y.toFixed(4)}, ${csg.transform.z.toFixed(4)}] (= transformA)`)
    console.log(`ожидание пользователя: transformA = [${cubeT.x}, ${cubeT.y}, ${cubeT.z}]`)
    console.log(`смещение gizmo от transformA = ${pivotDiffA.toFixed(6)}`)

    // ── 8. Вывод ──
    console.log('=== ВЫВОД (FIX PIVOT-TRANSFORMA, Bug 3) ===')
    console.log(`pivot = transformA: ${pivotDiffA < 1e-6 ? 'ДА' : 'НЕТ'} (diff ${pivotDiffA.toExponential(2)})`)
    console.log(`pivot = COM: ${comVsPivot < 1e-6 ? 'ДА' : 'НЕТ'} (diff ${comVsPivot.toExponential(2)})`)
    console.log(`мировершины = oracle union: ${worldDiff < 1e-4 ? 'ДА' : 'НЕТ'} (diff ${worldDiff.toExponential(2)})`)

    // Инварианты (FIX PIVOT-TRANSFORMA, Bug 3):
    // 1) pivot == transformA (первый операнд) — gizmo на месте первого операнда
    expect(pivotDiffA).toBeLessThan(1e-6)
    // 2) world = pivot + vertex == oracle union — геометрия не сдвинулась
    expect(worldDiff).toBeLessThan(1e-4)
    // 3) COM != pivot (COM больше не источник истины для pivot)
    expect(comVsPivot).toBeGreaterThan(1e-3)
  }, 30000)

  it('DIAG: bbox-центр vs COM — насколько gizmo «уезжает» от центра куба', async () => {
    // Пользователь ждёт pivot в transformA (20,20,20).
    // pivot = COM union'а куба и призма со scale(1,1,0.5).
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube')!
    await st().moveObject(cubeId, { x: 20, y: 20, z: 20, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    await st().addShape('prism', { radius: 12, height: 20, sides: 3 })
    const prismId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
    await st().moveObject(prismId, { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 })

    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')
    const csg = st().objects[lastGroupResultId()]

    const dw = dataWorld(csg)
    const bb = bboxOf(dw)
    const bboxCenter = [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2]
    console.log('=== pivot vs bboxCenter vs transformA ===')
    console.log(`pivot (transformA) = [${csg.transform.x.toFixed(4)}, ${csg.transform.y.toFixed(4)}, ${csg.transform.z.toFixed(4)}]`)
    console.log(`bboxCenter    = [${bboxCenter.map(n => n.toFixed(4)).join(', ')}]`)
    console.log(`transformA    = [20, 20, 20]`)
    const gizmoOffset = Math.max(
      Math.abs(csg.transform.x - 20),
      Math.abs(csg.transform.y - 20),
      Math.abs(csg.transform.z - 20),
    )
    console.log(`gizmo offset от (20,20,20) = ${gizmoOffset.toFixed(6)}`)
    // FIX (PIVOT-TRANSFORMA, Bug 3): gizmo на transformA первого операнда
    expect(gizmoOffset).toBeLessThan(1e-6)
  }, 30000)
})
