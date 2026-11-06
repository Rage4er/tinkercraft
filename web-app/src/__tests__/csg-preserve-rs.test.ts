// ============================================================
// csg-preserve-rs.test.ts — CSG-PRESERVE-RS (Этап 8.5.9)
// ============================================================
// Пользователь: призма rot(20,20,20) scale(1,1,0.5) → mirror YZ → CSG union
// → csg_12.transform = pos(-20,4,20) rot(0,0,0) scl(1,1,1).
// Ожидание: csg_12.transform.rot/scale = transformA.rot/scale.
//
// Конвенция (после фикса): вершины CSG = S⁻¹Rᵀ(v_world − posA) (RS НЕ запечён),
// transform = полный TRS операнда A. Render world = posA + R·S·v = v_world.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
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
import { computeRSMatrix } from '../csg/worker-matrix'
import type { SceneObject, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()

function lastShapeId(shapeType: string): string {
  const objs = st().objects
  for (const id of Object.keys(objs)) {
    if (objs[id].shapeType === shapeType && !('operation' in objs[id])) return id
  }
  throw new Error(`no ${shapeType}`)
}

function lastCsgId(): string {
  const objs = st().objects
  let found = ''
  for (const id of Object.keys(objs)) {
    if (objs[id].shapeType === 'csg') found = id  // последний вставленный CSG
  }
  if (!found) throw new Error('no csg')
  return found
}

/** id результата последней CSG-операции (csgBoolean выделяет результат) */
function csgResultId(): string {
  const sel = st().selectedIds
  expect(sel.length).toBe(1)
  const obj = st().objects[sel[0]]
  expect(obj?.shapeType).toBe('csg')
  return sel[0]
}

beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots()
  clearTree()
})

/** world = pos + R·S·v (полный TRS, как render/STL-export) */
function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < obj.vertices.length; i += 3) {
    const x = obj.vertices[i], y = obj.vertices[i + 1], z = obj.vertices[i + 2]
    out[i] = r00 * x + r01 * y + r02 * z + t.x
    out[i + 1] = r10 * x + r11 * y + r12 * z + t.y
    out[i + 2] = r20 * x + r21 * y + r22 * z + t.z
  }
  return out
}

/** world = pos + v (pivot translation-only — текущая baked-RS конвенция) */
function worldVertsNoTRS(obj: SceneObject): Float32Array {
  const t = obj.transform
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < obj.vertices.length; i += 3) {
    out[i] = obj.vertices[i] + t.x
    out[i + 1] = obj.vertices[i + 1] + t.y
    out[i + 2] = obj.vertices[i + 2] + t.z
  }
  return out
}

function bboxOf(verts: Float32Array) {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
}

function maxBBoxDiff(a: { min: number[], max: number[] }, b: { min: number[], max: number[] }): number {
  let d = 0
  for (let i = 0; i < 3; i++) {
    d = Math.max(d, Math.abs(a.min[i] - b.min[i]), Math.abs(a.max[i] - b.max[i]))
  }
  return d
}

describe('CSG-PRESERVE-RS (Этап 8.5.9)', () => {
  it('csgBoolean: transform.rot/scale = transformA (cube rot(20,20,20) scale(1,1,0.5))', async () => {
    // 1. Куб с rot/scale
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const cubeId = lastShapeId('cube')
    const cubeT: TransformNR = { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 }
    await st().moveObject(cubeId, cubeT)

    // 2. Сфера на origin
    await st().addShape('sphere', { radius: 5 })
    const sphereId = lastShapeId('sphere')

    // 3. CSG union
    st().selectObjects([cubeId, sphereId], false)
    await st().csgBoolean('union')
    const csg = st().objects[csgResultId()] as SceneObject

    // 4. transform = полный TRS операнда A
    expect(csg.transform.x).toBeCloseTo(20, 5)
    expect(csg.transform.y).toBeCloseTo(20, 5)
    expect(csg.transform.z).toBeCloseTo(20, 5)
    expect(csg.transform.rotX).toBeCloseTo(20, 5)
    expect(csg.transform.rotY).toBeCloseTo(20, 5)
    expect(csg.transform.rotZ).toBeCloseTo(20, 5)
    expect(csg.transform.scaleX).toBeCloseTo(1, 5)
    expect(csg.transform.scaleY).toBeCloseTo(1, 5)
    expect(csg.transform.scaleZ).toBeCloseTo(0.5, 5)

    // 5. Render world = data world (полный TRS) == операнды до CSG (bbox)
    const world = worldVerts(csg)
    const wb = bboxOf(world)
    // Куб 10×10×5 rot(20,20,20) на (20,20,20) + сфера r=5 на origin → union bbox
    // Проверяем, что union bbox содержит куб-вершины (pivot + R·S·v == world операнда)
    console.log(`  CSG bbox (full TRS): min=[${wb.min.map(n => n.toFixed(2))}], max=[${wb.max.map(n => n.toFixed(2))}]`)
    // Для rot(20,20,20) scale(1,1,0.5) куба: world extent ≈ 10·(|cos20·cos20|+...) — просто сверим с worker-эталоном ниже
  })

  it('csgBoolean: world (full TRS) == componentwise union операндов (render = data)', async () => {
    // Эталон: world-вершины CSG (pivot + R·S·v, как Viewport3D) должны точно
    // совпадать с компонентным объединением world-bbox операндов (куб 10
    // rot(20,20,20) scale(1,1,0.5) на (20,20,20) + сфера r=5 на spawn-позиции).
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const cubeId = lastShapeId('cube')
    const cubeT: TransformNR = { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 }
    await st().moveObject(cubeId, cubeT)
    const cubeBefore = { ...st().objects[cubeId] }

    await st().addShape('sphere', { radius: 5 })
    const sphereId = lastShapeId('sphere')
    const sphereBefore = { ...st().objects[sphereId] }

    st().selectObjects([cubeId, sphereId], false)
    await st().csgBoolean('union')
    const csg = st().objects[csgResultId()] as SceneObject

    const cubeWorldBBox = bboxOf(worldVerts(cubeBefore))
    const sphereWorldBBox = bboxOf(worldVerts(sphereBefore))
    const csgWorldBBox = bboxOf(worldVerts(csg))
    console.log(`  cube world bbox:   min=[${cubeWorldBBox.min.map(n => n.toFixed(3))}], max=[${cubeWorldBBox.max.map(n => n.toFixed(3))}]`)
    console.log(`  sphere world bbox: min=[${sphereWorldBBox.min.map(n => n.toFixed(3))}], max=[${sphereWorldBBox.max.map(n => n.toFixed(3))}]`)
    console.log(`  csg world bbox:    min=[${csgWorldBBox.min.map(n => n.toFixed(3))}], max=[${csgWorldBBox.max.map(n => n.toFixed(3))}]`)

    // Точный эталон union bbox (куб и сфера не пересекаются → union bbox точный)
    for (let i = 0; i < 3; i++) {
      expect(csgWorldBBox.min[i]).toBeCloseTo(Math.min(cubeWorldBBox.min[i], sphereWorldBBox.min[i]), 2)
      expect(csgWorldBBox.max[i]).toBeCloseTo(Math.max(cubeWorldBBox.max[i], sphereWorldBBox.max[i]), 2)
    }
  })

  it('undo/redo после CSG: rot/scale preserved (rebuild path)', async () => {
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const cubeId = lastShapeId('cube')
    const cubeT: TransformNR = { x: 20, y: 20, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 }
    await st().moveObject(cubeId, cubeT)

    await st().addShape('sphere', { radius: 5 })
    const sphereId = lastShapeId('sphere')

    st().selectObjects([cubeId, sphereId], false)
    await st().csgBoolean('union')

    // undo → redo. clearSnapshots() перед undo/redo форсирует ПУТЬ REBUILD
    // (rebuildFromHistory читает GroupOperation.resultCenter/Rotation/Scale),
    // а не snapshot-кэш. Так проверяется, что rot/scale реально сохраняются
    // в истории операций и восстанавливаются из неё.
    const csgId = csgResultId()
    const csgLive = { ...st().objects[csgId] as SceneObject }

    clearSnapshots()
    await st().undo()
    clearSnapshots()
    await st().redo()
    const csgRedo = st().objects[csgId] as SceneObject
    expect(csgRedo).toBeDefined()

    for (const key of ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ'] as const) {
      expect(csgRedo.transform[key]).toBeCloseTo(csgLive.transform[key], 5)
    }

    // world совпадает (snapshot и rebuild пути)
    const diff = maxBBoxDiff(bboxOf(worldVerts(csgRedo)), bboxOf(worldVerts(csgLive)))
    console.log(`  redo vs live world bbox diff = ${diff.toExponential(3)}`)
    expect(diff).toBeLessThan(1e-3)
  })

  it('CSG из зеркальных примитивов: transform = полный TRS операнда A', async () => {
    // Пользовательский сценарий: призма rot(20,20,20) scale(1,1,0.5) → mirror YZ
    // → obj_3 (pos(-20,4,20) rot(20,-20,-20) scl(1,1,0.5)); obj_3 → mirror XZ →
    // obj_4; CSG union(obj_3, obj_4) → csg.transform обязан сохранить TRS obj_3
    // (раньше: rot(0,0,0) scl(1,1,1) — потеря, gizmo/PropertiesPanel/resize
    // работали с неверной ориентацией).
    //
    // ⚠️ Геометрию (хиральность) mirror-примитива в CSG здесь НЕ проверяем:
    // syncObjectsForOperation пересобирает mirror-ПРИМИТИВ из params
    // (workerSyncObjects) и теряет зеркальную форму — это отдельный
    // задокументированный баг CSG-MIRROR-PRIMITIVE-PARAMS (Этап 8.5.9
    // ограничена resultTransform).
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 })
    const prismId = lastShapeId('prism')
    const t0: TransformNR = { x: 20, y: 4, z: 20, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 0.5 }
    await st().moveObject(prismId, t0)

    // mirror YZ → obj_3
    st().selectObjects([prismId], false)
    await st().mirrorSelected('YZ')
    const ops1 = st().operations
    const mir1 = ops1[ops1.length - 1] as any
    const mir1Id = mir1.ids[0]
    const mir1Obj = st().objects[mir1Id] as SceneObject

    // mirror XZ от obj_3 → obj_4
    st().selectObjects([mir1Id], false)
    await st().mirrorSelected('XZ')
    const ops2 = st().operations
    const mir2 = ops2[ops2.length - 1] as any
    const mir2Id = mir2.ids[0]

    // CSG union(obj_3, obj_4)
    st().selectObjects([mir1Id, mir2Id], false)
    await st().csgBoolean('union')
    const csg = st().objects[lastCsgId()] as SceneObject

    // transform = TRS операнда A (obj_3): pos mirrorPoint(t0)=(-20,4,20), rot mirrorEuler=(20,-20,-20)
    const a = mir1Obj.transform
    expect(csg.transform.x).toBeCloseTo(a.x, 4)
    expect(csg.transform.y).toBeCloseTo(a.y, 4)
    expect(csg.transform.z).toBeCloseTo(a.z, 4)
    expect(csg.transform.rotX).toBeCloseTo(a.rotX, 4)
    expect(csg.transform.rotY).toBeCloseTo(a.rotY, 4)
    expect(csg.transform.rotZ).toBeCloseTo(a.rotZ, 4)
    expect(csg.transform.scaleX).toBeCloseTo(a.scaleX, 4)
    expect(csg.transform.scaleY).toBeCloseTo(a.scaleY, 4)
    expect(csg.transform.scaleZ).toBeCloseTo(a.scaleZ, 4)

    // Сам зеркальный TRS призмы: pos(-20,4,20), rot(20,-20,-20) (mirrorEuler YZ)
    expect(a.x).toBeCloseTo(-20, 4)
    expect(a.rotY).toBeCloseTo(-20, 4)
    expect(a.scaleZ).toBeCloseTo(0.5, 4)
  })

  it('CSG от зеркального CSG-результата: render = data (workerSyncMesh путь)', async () => {
    // Путь без бага хиральности: operand A — зеркальный CSG-результат
    // (shapeType='csg' → workerSyncMesh → точные вершины).
    // CSG: cube + prism(rot) → mirror YZ → mirroredCSG; union(mirroredCSG, sphere)
    // → transform = TRS mirroredCSG, world = pos + R·S·v = worker world.
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const cubeId = lastShapeId('cube')
    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 })
    const prismId = lastShapeId('prism')
    await st().moveObject(prismId, { x: 12, y: 0, z: 0, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // operand A = prism с rot(20,20,20) → csg1.transform.rot = (20,20,20)
    st().selectObjects([prismId, cubeId], false)
    await st().csgBoolean('union')
    const csg1Id = lastCsgId()
    const csg1 = st().objects[csg1Id] as SceneObject
    expect(csg1.transform.rotX).toBeCloseTo(20, 5)

    // mirror YZ от CSG → mirrored CSG (полный TRS через mirrorEuler)
    st().selectObjects([csg1Id], false)
    await st().mirrorSelected('YZ')
    const ops = st().operations
    const mirOp = ops[ops.length - 1] as any
    const mirId = mirOp.ids[0]
    const mirrored = st().objects[mirId] as SceneObject
    expect(mirrored.shapeType).toBe('csg')

    // sphere как второй operand
    await st().addShape('sphere', { radius: 4 })
    const sphereId = lastShapeId('sphere')
    await st().moveObject(sphereId, { x: -30, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    const sphereBefore = { ...st().objects[sphereId] }
    const mirroredBefore = { ...mirrored }

    st().selectObjects([mirId, sphereId], false)
    await st().csgBoolean('union')
    const csg = st().objects[csgResultId()] as SceneObject
    for (const key of ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ'] as const) {
      expect(csg.transform[key]).toBeCloseTo(mirroredBefore.transform[key], 5)
    }

    // render = data: world CSG == componentwise union world-bbox операндов
    const cWB = bboxOf(worldVerts(csg))
    const mWB = bboxOf(worldVerts(mirroredBefore))
    const sWB = bboxOf(worldVerts(sphereBefore))
    for (let i = 0; i < 3; i++) {
      expect(cWB.min[i]).toBeCloseTo(Math.min(mWB.min[i], sWB.min[i]), 2)
      expect(cWB.max[i]).toBeCloseTo(Math.max(mWB.max[i], sWB.max[i]), 2)
    }
  })
})
