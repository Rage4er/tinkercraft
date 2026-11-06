// ============================================================
// csg-mirror-primitive-params.test.ts — CSG-MIRROR-PRIMITIVE-PARAMS (Этап 8.5.10)
// ============================================================
//
// Баг: зеркальный примитив при CSG пересобирается из params через
// workerSyncObjects → зеркальная форма теряется (замерено: mirror-призма
// x∈[-25.27,-15.55], CSG x∈[-24.45,...]).
//
// Причина: syncObjectsForOperation маршрутизирует primitive →
// workerSyncObjects (buildPrimitive(params) — без зеркала).
//
// Исправление (Вариант A): зеркальный примитив (mirrored flag) →
// syncObjectsForOperation → workerSyncMesh (vertices).
// rebuildFromHistory → до-зеркалит вершины worker'а.
// rebuildBuildTree → mirror-потомок примитива = baked-нода.
//
// FIX (CSG-MIRROR-PRIMITIVE-PARAMS, Stage 8.5.10): зеркальный примитив
// — vertices авторитетны, params оригинальны.

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
import { clearTree, getNode } from '../csg/history-tree'
import { rebuildFromHistory } from '../store/rebuild'
import { computeRSMatrix } from '../csg/worker-matrix'
import type { SceneObject, GroupOperation } from '../csg/types'

const st = () => useDocumentStore.getState()

function lastShapeId(shapeType: string): string {
  const objs = st().objects
  for (const id of Object.keys(objs)) {
    if (objs[id].shapeType === shapeType && !('operation' in objs[id])) return id
  }
  throw new Error(`no ${shapeType}`)
}

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

function findMirroredObj(plane: 'XY' | 'XZ' | 'YZ'): SceneObject {
  for (const obj of Object.values(st().objects)) {
    if (obj.mirrored && obj.mirrored.includes(plane)) return obj
  }
  throw new Error(`no mirrored obj for plane ${plane}`)
}

// ============================================================
// Test 1: Mirror primitive → CSG preserves mirror (prism)
// ============================================================
describe('Mirror primitive → CSG', () => {
  it('CSG из mirror prism (sides=3): зеркальная форма сохраняется', async () => {
    // 1. Асимметричная призма (sides=3: треугольник) — mirror YZ меняет x-range
    //    Оригинал: x∈[-7.5, 15]. Зеркало YZ: x∈[-15, 7.5].
    await st().addShape('prism', { radius: 15, height: 20, sides: 3 })
    const prismId = lastShapeId('prism')

    // 2. Mirror YZ → зеркальный примитив
    useDocumentStore.setState({ selectedIds: [prismId] })
    await st().mirrorSelected('YZ')
    const mirror = findMirroredObj('YZ')
    const mirrorId = mirror.id

    // 3. Маленький куб (6×6×6) — перемещаем в origin (внутри призмы)
    await st().addShape('cube', { width: 6, height: 6, depth: 6 })
    const cubeId = lastShapeId('cube')
    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // 4. CSG union(mirror_prism, cube_inside) = mirror_prism
    useDocumentStore.setState({ selectedIds: [mirrorId, cubeId] })
    await st().csgBoolean('union')
    const csgId = csgResultId()
    const csg = st().objects[csgId]

    // 5. Union(mirrored_prism, cube_inside) = mirrored_prism
    //    World bbox csg ≈ world bbox mirrored_prism
    const csgWorld = worldVerts(csg)
    const mirrorWorld = worldVerts(mirror)
    const csgBbox = bboxOf(csgWorld)
    const mirrorBbox = bboxOf(mirrorWorld)
    const diff = maxBBoxDiff(csgBbox, mirrorBbox)

    // DEBUG: print bbox values
    console.log('[CSG mirror prism] csgBbox.x:', csgBbox.min[0].toFixed(2), 'to', csgBbox.max[0].toFixed(2))
    console.log('[CSG mirror prism] mirrorBbox.x:', mirrorBbox.min[0].toFixed(2), 'to', mirrorBbox.max[0].toFixed(2))
    console.log('[CSG mirror prism] diff:', diff.toFixed(6))

    expect(diff).toBeLessThan(1e-4)
  })

  it('CSG из mirror cone: зеркальная форма', async () => {
    // Cone (sides=32) — rotationally symmetric, mirror = same geometry.
    // Test ensures mirror→CSG path doesn't break symmetric shapes.
    await st().addShape('cone', { radius: 15, height: 20, segments: 32 })
    const coneId = lastShapeId('cone')

    useDocumentStore.setState({ selectedIds: [coneId] })
    await st().mirrorSelected('YZ')
    const mirror = findMirroredObj('YZ')
    const mirrorId = mirror.id

    // Small cube inside cone at origin
    await st().addShape('cube', { width: 8, height: 8, depth: 8 })
    const cubeId = lastShapeId('cube')
    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    useDocumentStore.setState({ selectedIds: [mirrorId, cubeId] })
    await st().csgBoolean('union')
    const csgId = csgResultId()
    const csg = st().objects[csgId]

    const csgWorld = worldVerts(csg)
    const mirrorWorld = worldVerts(mirror)
    const csgBbox = bboxOf(csgWorld)
    const mirrorBbox = bboxOf(mirrorWorld)
    const diff = maxBBoxDiff(csgBbox, mirrorBbox)

    console.log('[CSG mirror cone] csgBbox.x:', csgBbox.min[0].toFixed(2), 'to', csgBbox.max[0].toFixed(2))
    console.log('[CSG mirror cone] mirrorBbox.x:', mirrorBbox.min[0].toFixed(2), 'to', mirrorBbox.max[0].toFixed(2))
    console.log('[CSG mirror cone] diff:', diff.toFixed(6))

    expect(diff).toBeLessThan(1e-4)
  })

  it('CSG из mirror pyramid: зеркальная форма', async () => {
    // Pyramid (sides=4, square base) — symmetric, mirror = same geometry.
    await st().addShape('pyramid', { radius: 15, height: 20, sides: 4 })
    const pyramidId = lastShapeId('pyramid')

    useDocumentStore.setState({ selectedIds: [pyramidId] })
    await st().mirrorSelected('YZ')
    const mirror = findMirroredObj('YZ')
    const mirrorId = mirror.id

    await st().addShape('cube', { width: 8, height: 8, depth: 8 })
    const cubeId = lastShapeId('cube')
    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    useDocumentStore.setState({ selectedIds: [mirrorId, cubeId] })
    await st().csgBoolean('union')
    const csgId = csgResultId()
    const csg = st().objects[csgId]

    const csgWorld = worldVerts(csg)
    const mirrorWorld = worldVerts(mirror)
    const csgBbox = bboxOf(csgWorld)
    const mirrorBbox = bboxOf(mirrorWorld)
    const diff = maxBBoxDiff(csgBbox, mirrorBbox)

    console.log('[CSG mirror pyramid] csgBbox.x:', csgBbox.min[0].toFixed(2), 'to', csgBbox.max[0].toFixed(2))
    console.log('[CSG mirror pyramid] mirrorBbox.x:', mirrorBbox.min[0].toFixed(2), 'to', mirrorBbox.max[0].toFixed(2))
    console.log('[CSG mirror pyramid] diff:', diff.toFixed(6))

    expect(diff).toBeLessThan(1e-4)
  })

  it('CSG из mirror prism (sides=5): асимметричная пятиугольная призма', async () => {
    // sides=5: pentagon, asymmetric by mirror
    await st().addShape('prism', { radius: 15, height: 20, sides: 5 })
    const prismId = lastShapeId('prism')

    useDocumentStore.setState({ selectedIds: [prismId] })
    await st().mirrorSelected('YZ')
    const mirror = findMirroredObj('YZ')
    const mirrorId = mirror.id

    await st().addShape('cube', { width: 8, height: 8, depth: 8 })
    const cubeId = lastShapeId('cube')
    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    useDocumentStore.setState({ selectedIds: [mirrorId, cubeId] })
    await st().csgBoolean('union')
    const csgId = csgResultId()
    const csg = st().objects[csgId]

    const csgWorld = worldVerts(csg)
    const mirrorWorld = worldVerts(mirror)
    const csgBbox = bboxOf(csgWorld)
    const mirrorBbox = bboxOf(mirrorWorld)
    const diff = maxBBoxDiff(csgBbox, mirrorBbox)

    console.log('[CSG mirror prism sides=5] diff:', diff.toFixed(6))
    expect(diff).toBeLessThan(1e-4)
  })

  // ============================================================
  // Test 2: Double mirror = identity
  // ============================================================
  it('Двойное зеркало = identity', async () => {
    await st().addShape('prism', { radius: 15, height: 20, sides: 3 })
    const id1 = lastShapeId('prism')
    const v1 = new Float32Array(st().objects[id1].vertices)

    useDocumentStore.setState({ selectedIds: [id1] })
    await st().mirrorSelected('YZ')
    const id2 = findMirroredObj('YZ').id

    useDocumentStore.setState({ selectedIds: [id2] })
    await st().mirrorSelected('YZ')
    const id3 = Object.values(st().objects).find(o => o.id !== id1 && o.id !== id2 && o.mirrored === undefined)!.id
    expect(st().objects[id3].mirrored).toBeUndefined()

    const v3 = st().objects[id3].vertices
    expect(v3.length).toBe(v1.length)
    for (let i = 0; i < v1.length; i++) {
      expect(v3[i]).toBeCloseTo(v1[i], 6)
    }
  })

  // ============================================================
  // Test 3: rebuildFromHistory preserves mirror
  // ============================================================
  it('rebuildFromHistory сохраняет зеркальный примитив', async () => {
    await st().addShape('prism', { radius: 15, height: 20, sides: 3 })
    const id1 = lastShapeId('prism')

    useDocumentStore.setState({ selectedIds: [id1] })
    await st().mirrorSelected('YZ')
    const id2 = findMirroredObj('YZ').id
    const liveVertices = new Float32Array(st().objects[id2].vertices)
    const liveMirrored = st().objects[id2].mirrored

    // Rebuild from history
    const ops = st().operations
    const rebuilt = await rebuildFromHistory(ops)
    const rb2 = rebuilt[id2]
    expect(rb2).toBeDefined()
    expect(rb2!.mirrored).toEqual(liveMirrored)

    for (let i = 0; i < liveVertices.length; i++) {
      expect(rb2!.vertices[i]).toBeCloseTo(liveVertices[i], 6)
    }
  })

  it('rebuildFromHistory: CSG из mirror prism сохраняет форму', async () => {
    await st().addShape('prism', { radius: 15, height: 20, sides: 3 })
    const id1 = lastShapeId('prism')

    useDocumentStore.setState({ selectedIds: [id1] })
    await st().mirrorSelected('YZ')
    const id2 = findMirroredObj('YZ').id

    await st().addShape('cube', { width: 6, height: 6, depth: 6 })
    const cubeId = lastShapeId('cube')
    await st().moveObject(cubeId, { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    useDocumentStore.setState({ selectedIds: [id2, cubeId] })
    await st().csgBoolean('union')
    const csgId = csgResultId()
    const liveCsg = st().objects[csgId]

    // Rebuild from history
    const ops = st().operations
    const rebuilt = await rebuildFromHistory(ops)
    const rbCsg = rebuilt[csgId]
    expect(rbCsg).toBeDefined()

    // CSG world bbox after rebuild ≈ live world bbox
    const liveWorld = worldVerts(liveCsg)
    const rebuildWorld = worldVerts(rbCsg!)
    const diff = maxBBoxDiff(bboxOf(liveWorld), bboxOf(rebuildWorld))

    console.log('[rebuild CSG mirror] diff:', diff.toFixed(6))
    expect(diff).toBeLessThan(1e-4)
  })

  // ============================================================
  // Test 4: CSG→mirror→CSG (Scenario 3 из chirality теста)
  // Не сломан ли CSG-результат при зеркале и повторном CSG?
  // ============================================================
  it('CSG→mirror→CSG: не сломан', async () => {
    // 1. Создать два примитива
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cubeId = lastShapeId('cube')
    await st().addShape('sphere', { radius: 10, segments: 16 })
    const sphereId = lastShapeId('sphere')

    // 2. CSG union → csg_1
    useDocumentStore.setState({ selectedIds: [cubeId, sphereId] })
    await st().csgBoolean('union')
    const csgId1 = csgResultId()

    // 3. Зеркалим CSG-результат
    useDocumentStore.setState({ selectedIds: [csgId1] })
    await st().mirrorSelected('YZ')
    // csgId1 (оригинал), newId (зеркало)

    // 4. Второй CSG-результат (для проверки что зеркало CSG не сломано)
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const cube2Id = lastShapeId('cube')

    useDocumentStore.setState({ selectedIds: [csgId1, cube2Id] })
    await st().csgBoolean('union')
    const csgId2 = csgResultId()
    const csg2 = st().objects[csgId2]

    // Проверка: csg_2 имеет mesh (vertices, indices)
    expect(csg2.vertices.length).toBeGreaterThan(0)
    expect(csg2.indices.length).toBeGreaterThan(0)
  })

  // ============================================================
  // Test 5: mirrored flag routing in syncObjectsForOperation
  // ============================================================
  it('Зеркальный примитив: mirrored flag установлен', async () => {
    await st().addShape('prism', { radius: 15, height: 20, sides: 3 })
    const id1 = lastShapeId('prism')

    useDocumentStore.setState({ selectedIds: [id1] })
    await st().mirrorSelected('YZ')
    const mirror = findMirroredObj('YZ')

    expect(mirror.mirrored).toEqual(['YZ'])
    expect(mirror.shapeType).toBe('prism')
    expect(mirror.vertices.length).toBeGreaterThan(0)
  })
})
