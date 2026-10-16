// ============================================================
// csg-mirror-chirality.test.ts — Проверка хиральности зеркала CSG
// ============================================================
//
// Пользователь: "зеркало призмы не работает".
//
// Гипотеза: mirrorObject (production путь) зеркалит ТРАНСФОРМЫ детей
// (mirrorPoint + mirrorEuler + abs scale), но НЕ геометрию примитивов.
// Для призмы sides=3 это даёт неправильное зеркало (хиральность не отражена).
//
// Oracle: берём оригинальный CSG mesh (worker путь), применяем mirror matrix
// (x → -x) — это ПРАВИЛЬНОЕ зеркало геометрии.
//
// Production: document-store.csgBoolean → mirrorSelected('YZ').

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
import { centerMassAtOrigin } from '../csg/geometry-utils'
import type { SceneObject, TransformNR, MirrorOperation, GroupOperation } from '../csg/types'

const st = () => useDocumentStore.getState()

function lastGroupResultId(): string {
  const ops = useDocumentStore.getState().operations
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].type === 'group') return (ops[i] as GroupOperation).resultId!
  }
  throw new Error('no group op')
}

function lastShapeId(shapeType: string): string {
  const objs = st().objects
  for (const id of Object.keys(objs)) {
    if (objs[id].shapeType === shapeType && !('operation' in objs[id])) return id
  }
  throw new Error(`no ${shapeType}`)
}

beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots()
  clearTree()
})

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

function csgWorldVerts(obj: SceneObject): Float32Array {
  const out = new Float32Array(obj.vertices.length)
  const t = obj.transform
  for (let i = 0; i < obj.vertices.length; i += 3) {
    out[i] = obj.vertices[i] + t.x
    out[i + 1] = obj.vertices[i + 1] + t.y
    out[i + 2] = obj.vertices[i + 2] + t.z
  }
  return out
}

function mirroredWorldVerts(obj: SceneObject, plane: 'XY' | 'XZ' | 'YZ'): Float32Array {
  const world = csgWorldVerts(obj)
  const out = new Float32Array(world.length)
  for (let i = 0; i < world.length; i += 3) {
    out[i] = plane === 'YZ' ? -world[i] : world[i]
    out[i + 1] = plane === 'XZ' ? -world[i + 1] : world[i + 1]
    out[i + 2] = plane === 'XY' ? -world[i + 2] : world[i + 2]
  }
  return out
}

function maxBBoxDiff(a: { min: number[], max: number[] }, b: { min: number[], max: number[] }): number {
  let d = 0
  for (let i = 0; i < 3; i++) {
    d = Math.max(d, Math.abs(a.min[i] - b.min[i]), Math.abs(a.max[i] - b.max[i]))
  }
  return d
}

describe('CSG mirror YZ — хиральность призмы', () => {
  // it.fails: воспроизводит МIRROR-CHIRALITY (БАГ 2, исправляется отдельным
  // этапом): mirrorNodeRecursive зеркалит ТРАНСФОРМЫ детей, но не геометрию
  // примитивов, поэтому призма sides=3 остаётся незеркалённой (diff = 2.5).
  // Когда баг будет исправлен, vitest сообщит об этом как о провале — тогда
  // маркер нужно снять.
  it.fails('CSG (cube+prism sides=3) mirror YZ: world bbox = mirror(world bbox)', async () => {
    await st().addShape('cube', { width: 10, height: 10, depth: 10 }); const cubeId = lastShapeId('cube')
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 }); const prismId = lastShapeId('prism')

    // CSG union
    st().selectObjects([cubeId, prismId], false)
    await st().csgBoolean('union')
    const csgId = lastGroupResultId()
    const csg = st().objects[csgId]
    expect(csg.shapeType).toBe('csg')

    // Зеркало YZ
    st().selectObjects([csgId], false)
    await st().mirrorSelected('YZ')
    const ops = st().operations
    const mop = ops[ops.length - 1] as MirrorOperation
    expect(mop.type).toBe('mirror')
    const mirId = mop.ids[0]
    const mirrored = st().objects[mirId]

    // Эталон: зеркалим оригинальный CSG world-вершины (x → -x)
    const expectedMirrored = mirroredWorldVerts(csg, 'YZ')
    const expectedBBox = bboxOf(expectedMirrored)

    // Факт: world-вершины зеркального CSG
    const actualWorld = csgWorldVerts(mirrored)
    const actualBBox = bboxOf(actualWorld)

    console.log(`  Original CSG world bbox: min=[${bboxOf(csgWorldVerts(csg)).min.map(n => n.toFixed(2)).join(', ')}], max=[${bboxOf(csgWorldVerts(csg)).max.map(n => n.toFixed(2)).join(', ')}]`)
    console.log(`  Expected mirror bbox:    min=[${expectedBBox.min.map(n => n.toFixed(2)).join(', ')}], max=[${expectedBBox.max.map(n => n.toFixed(2)).join(', ')}]`)
    console.log(`  Actual mirror bbox:      min=[${actualBBox.min.map(n => n.toFixed(2)).join(', ')}], max=[${actualBBox.max.map(n => n.toFixed(2)).join(', ')}]`)

    const diff = maxBBoxDiff(expectedBBox, actualBBox)
    console.log(`  max bbox diff = ${diff.toFixed(6)}`)

    // Если призма sides=3 зеркалится точно — diff ≈ 0
    // Если зеркало неправильное (хиральность не отражена) — diff > 0
    expect(diff).toBeLessThan(0.01)
  })

  it('CSG (cube+sphere) mirror YZ: world bbox = mirror(world bbox)', async () => {
    // Куб 10 на origin
    await st().addShape('cube', { width: 10, height: 10, depth: 10 }); const cubeId = lastShapeId('cube')
    // Сфера на origin (симметричный — для контроля)
    await st().addShape('sphere', { radius: 5 }); const sphereId = lastShapeId('sphere')

    st().selectObjects([cubeId, sphereId], false)
    await st().csgBoolean('union')
    const csgId = lastGroupResultId()
    const csg = st().objects[csgId]

    st().selectObjects([csgId], false)
    await st().mirrorSelected('YZ')
    const ops = st().operations
    const mop = ops[ops.length - 1] as MirrorOperation
    const mirId = mop.ids[0]
    const mirrored = st().objects[mirId]

    const expectedMirrored = mirroredWorldVerts(csg, 'YZ')
    const expectedBBox = bboxOf(expectedMirrored)
    const actualWorld = csgWorldVerts(mirrored)
    const actualBBox = bboxOf(actualWorld)

    const diff = maxBBoxDiff(expectedBBox, actualBBox)
    console.log(`  cube+sphere mirror YZ: max bbox diff = ${diff.toFixed(6)}`)
    expect(diff).toBeLessThan(0.01)
  })

  it('CSG (cube+pyramid) mirror YZ: world bbox = mirror(world bbox)', async () => {
    await st().addShape('cube', { width: 10, height: 10, depth: 10 }); const cubeId = lastShapeId('cube')
    await st().addShape('pyramid', { radius: 5, height: 10, sides: 4 }); const pyrId = lastShapeId('pyramid')

    st().selectObjects([cubeId, pyrId], false)
    await st().csgBoolean('union')
    const csgId = lastGroupResultId()
    const csg = st().objects[csgId]

    st().selectObjects([csgId], false)
    await st().mirrorSelected('YZ')
    const ops = st().operations
    const mop = ops[ops.length - 1] as MirrorOperation
    const mirId = mop.ids[0]
    const mirrored = st().objects[mirId]

    const expectedMirrored = mirroredWorldVerts(csg, 'YZ')
    const expectedBBox = bboxOf(expectedMirrored)
    const actualWorld = csgWorldVerts(mirrored)
    const actualBBox = bboxOf(actualWorld)

    const diff = maxBBoxDiff(expectedBBox, actualBBox)
    console.log(`  cube+pyramid mirror YZ: max bbox diff = ${diff.toFixed(6)}`)
    expect(diff).toBeLessThan(0.01)
  })
})
