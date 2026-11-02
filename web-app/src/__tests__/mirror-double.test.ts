// ============================================================
// mirror-double.test.ts — Double mirror primitive = identity
// ============================================================
// После FIX (MIRROR-DOUBLE) примитив mirrorObject зеркалит ТЕКУЩИЕ
// obj.vertices напрямую, без rebuildNode из params. Это значит:
//   1-е зеркало: mirror(vertices) → вершины отражены
//   2-е зеркало: mirror(mirrored_vertices) → вершины обратно к оригиналу
// + transform дважды зеркалится → identity к оригиналу
// Итог: double mirror primitive = identity (pivot + vertices).

import { describe, it, expect, beforeEach, vi } from 'vitest'

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
import type { SceneObject } from '../csg/types'

const st = () => useDocumentStore.getState()

function lastShapeId(shapeType: string): string {
  const objs = st().objects
  for (const id of Object.keys(objs)) {
    if (objs[id].shapeType === shapeType && !('operation' in objs[id])) return id
  }
  throw new Error(`no ${shapeType}`)
}

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots()
  clearTree()
})

function worldVerts(obj: SceneObject): Float32Array {
  const out = new Float32Array(obj.vertices.length)
  const t = obj.transform
  for (let i = 0; i < obj.vertices.length; i += 3) {
    out[i] = obj.vertices[i] + t.x
    out[i + 1] = obj.vertices[i + 1] + t.y
    out[i + 2] = obj.vertices[i + 2] + t.z
  }
  return out
}

function maxVertexSetDiff(actual: Float32Array, expected: Float32Array): number {
  let maxD = 0
  for (let i = 0; i < actual.length; i += 3) {
    const ax = actual[i], ay = actual[i + 1], az = actual[i + 2]
    let best = Infinity
    for (let j = 0; j < expected.length; j += 3) {
      const dx = ax - expected[j], dy = ay - expected[j + 1], dz = az - expected[j + 2]
      const d = dx * dx + dy * dy + dz * dz
      if (d < best) best = d
    }
    maxD = Math.max(maxD, Math.sqrt(best))
  }
  return maxD
}

describe('Double mirror primitive = identity', () => {
  it('double YZ mirror: pivot + vertices = original (prism sides=3)', async () => {
    // 1. Создаём призму с TRS
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 })
    const id1 = lastShapeId('prism')
    const obj1 = st().objects[id1] as SceneObject

    // 2. Зеркалим YZ → obj_2
    st().selectObjects([id1], false)
    await st().mirrorSelected('YZ')
    const ops1 = st().operations
    const mirror1 = ops1[ops1.length - 1] as any
    const id2 = mirror1.ids[0]
    const obj2 = st().objects[id2] as SceneObject

    // 3. Зеркалим obj_2 YZ → obj_3
    st().selectObjects([id2], false)
    await st().mirrorSelected('YZ')
    const ops2 = st().operations
    const mirror2 = ops2[ops2.length - 1] as any
    const id3 = mirror2.ids[0]
    const obj3 = st().objects[id3] as SceneObject

    // 4. Transform = identity к obj_1
    expect(obj3.transform.x).toBeCloseTo(obj1.transform.x, 6)
    expect(obj3.transform.y).toBeCloseTo(obj1.transform.y, 6)
    expect(obj3.transform.z).toBeCloseTo(obj1.transform.z, 6)
    expect(obj3.transform.rotX).toBeCloseTo(obj1.transform.rotX, 6)
    expect(obj3.transform.rotY).toBeCloseTo(obj1.transform.rotY, 6)
    expect(obj3.transform.rotZ).toBeCloseTo(obj1.transform.rotZ, 6)
    expect(obj3.transform.scaleX).toBeCloseTo(obj1.transform.scaleX, 6)
    expect(obj3.transform.scaleY).toBeCloseTo(obj1.transform.scaleY, 6)
    expect(obj3.transform.scaleZ).toBeCloseTo(obj1.transform.scaleZ, 6)

    // 5. World vertices = identity к obj_1
    const world1 = worldVerts(obj1)
    const world3 = worldVerts(obj3)
    expect(world3.length).toBe(world1.length)
    const diff = maxVertexSetDiff(world3, world1)
    console.log(`  double YZ mirror: max vertex diff = ${diff.toFixed(8)}`)
    expect(diff).toBeLessThan(1e-4)

    // shapeType остаётся 'prism'
    expect(obj3.shapeType).toBe('prism')
  })

  it('double XZ mirror: pivot + vertices = original (prism sides=3)', async () => {
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 })
    const id1 = lastShapeId('prism')

    st().selectObjects([id1], false)
    await st().mirrorSelected('XZ')
    const id2 = (st().operations[st().operations.length - 1] as any).ids[0]

    st().selectObjects([id2], false)
    await st().mirrorSelected('XZ')
    const id3 = (st().operations[st().operations.length - 1] as any).ids[0]

    const obj3 = st().objects[id3] as SceneObject
    const obj1 = st().objects[id1] as SceneObject

    // Transform identity
    for (const key of ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ'] as const) {
      expect(obj3.transform[key]).toBeCloseTo(obj1.transform[key], 6)
    }

    const world1 = worldVerts(obj1)
    const world3 = worldVerts(obj3)
    const diff = maxVertexSetDiff(world3, world1)
    console.log(`  double XZ mirror: max vertex diff = ${diff.toFixed(8)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  it('double XY mirror: pivot + vertices = original (prism sides=3)', async () => {
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 })
    const id1 = lastShapeId('prism')

    st().selectObjects([id1], false)
    await st().mirrorSelected('XY')
    const id2 = (st().operations[st().operations.length - 1] as any).ids[0]

    st().selectObjects([id2], false)
    await st().mirrorSelected('XY')
    const id3 = (st().operations[st().operations.length - 1] as any).ids[0]

    const obj3 = st().objects[id3] as SceneObject
    const obj1 = st().objects[id1] as SceneObject

    for (const key of ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ'] as const) {
      expect(obj3.transform[key]).toBeCloseTo(obj1.transform[key], 6)
    }

    const world1 = worldVerts(obj1)
    const world3 = worldVerts(obj3)
    const diff = maxVertexSetDiff(world3, world1)
    console.log(`  double XY mirror: max vertex diff = ${diff.toFixed(8)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  it('double YZ mirror: vertices = original (cone)', async () => {
    await st().addShape('cone', { radius: 5, height: 10 })
    const id1 = lastShapeId('cone')

    st().selectObjects([id1], false)
    await st().mirrorSelected('YZ')
    const id2 = (st().operations[st().operations.length - 1] as any).ids[0]

    st().selectObjects([id2], false)
    await st().mirrorSelected('YZ')
    const id3 = (st().operations[st().operations.length - 1] as any).ids[0]

    const obj3 = st().objects[id3] as SceneObject
    const obj1 = st().objects[id1] as SceneObject

    const world1 = worldVerts(obj1)
    const world3 = worldVerts(obj3)
    const diff = maxVertexSetDiff(world3, world1)
    console.log(`  cone double YZ: max vertex diff = ${diff.toFixed(8)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  it('double YZ mirror: vertices = original (pyramid)', async () => {
    await st().addShape('pyramid', { radius: 5, height: 10, sides: 4 })
    const id1 = lastShapeId('pyramid')

    st().selectObjects([id1], false)
    await st().mirrorSelected('YZ')
    const id2 = (st().operations[st().operations.length - 1] as any).ids[0]

    st().selectObjects([id2], false)
    await st().mirrorSelected('YZ')
    const id3 = (st().operations[st().operations.length - 1] as any).ids[0]

    const obj3 = st().objects[id3] as SceneObject
    const obj1 = st().objects[id1] as SceneObject

    const world1 = worldVerts(obj1)
    const world3 = worldVerts(obj3)
    const diff = maxVertexSetDiff(world3, world1)
    console.log(`  pyramid double YZ: max vertex diff = ${diff.toFixed(8)}`)
    expect(diff).toBeLessThan(1e-4)
  })

  it('double YZ mirror: vertices = original (cube — symmetric)', async () => {
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const id1 = lastShapeId('cube')

    st().selectObjects([id1], false)
    await st().mirrorSelected('YZ')
    const id2 = (st().operations[st().operations.length - 1] as any).ids[0]

    st().selectObjects([id2], false)
    await st().mirrorSelected('YZ')
    const id3 = (st().operations[st().operations.length - 1] as any).ids[0]

    const obj3 = st().objects[id3] as SceneObject
    const obj1 = st().objects[id1] as SceneObject

    const world1 = worldVerts(obj1)
    const world3 = worldVerts(obj3)
    const diff = maxVertexSetDiff(world3, world1)
    console.log(`  cube double YZ: max vertex diff = ${diff.toFixed(8)}`)
    expect(diff).toBeLessThan(1e-4)
  })
})
