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
//
// FIX (MIRROR-CHIRALITY, Variant B): bakeMirroredSubtree converts primitive
// children to baked with mirrored vertices (reflects geometry, not just transforms).
// shapeType + params preserved for future child-edit flow.

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
import { clearTree, getNode, treeStore, bakeMirroredSubtree } from '../csg/history-tree'
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
  // ✅ ИСПРАВЛЕНО (БАГ 2, Variant B): bakeMirroredSubtree зеркалит геометрию
  // примитивов (vertices + winding), не только transforms.
  it('CSG (cube+prism sides=3) mirror YZ: world bbox = mirror(world bbox)', async () => {
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

  // ========================================================
  // Тест 1 — vertex-level точное зеркало CSG с призмами
  // ========================================================
  it('CSG with prism sides=3 → mirror YZ → vertices precisely mirrored (nearest-neighbor)', async () => {
    // 1. Создаём CSG: cube + prism (asymmetric)
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 })
    st().selectObjects([lastShapeId('cube'), lastShapeId('prism')], false)
    await st().csgBoolean('union')
    const csgId = lastGroupResultId()
    const csg = st().objects[csgId]
    expect(csg.shapeType).toBe('csg')

    // 2. Сохраняем COM-центрированные вершины оригинала
    const originalVerts = new Float32Array(csg.vertices)

    // 3. Зеркалим CSG
    st().selectObjects([csgId], false)
    await st().mirrorSelected('YZ')
    const ops = st().operations
    const mop = ops[ops.length - 1] as MirrorOperation
    const mirId = mop.ids[0]
    const mirrored = st().objects[mirId]
    expect(mirrored.shapeType).toBe('csg')

    // 4. Эталон: зеркалим оригинальные COM-центрированные вершины (x → -x)
    const expectedVerts = new Float32Array(originalVerts.length)
    for (let i = 0; i < originalVerts.length; i += 3) {
      expectedVerts[i] = -originalVerts[i]
      expectedVerts[i + 1] = originalVerts[i + 1]
      expectedVerts[i + 2] = originalVerts[i + 2]
    }

    // 5. Сравниваем вершины зеркального CSG с эталоном (nearest-neighbor)
    const maxDiff = maxVertexSetDiff(new Float32Array(mirrored.vertices), expectedVerts)
    console.log(`  vertices original: ${originalVerts.length / 3}, mirrored: ${mirrored.vertices.length / 3}`)
    console.log(`  max vertex nearest-neighbor diff = ${maxDiff.toFixed(8)}`)

    // После FIX (MIRROR-CHIRALITY): max diff ≈ 0 (float32 точность)
    // До фикса: призма sides=3 не зеркалится → diff > 2.0
    expect(maxDiff).toBeLessThan(1e-3)
  })

  // ========================================================
  // Тест 2 — параметры детей CSG сохраняются после зеркала
  // ========================================================
  it('CSG mirror: children params preserved', async () => {
    // Создаём CSG: cube + prism
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 })
    st().selectObjects([lastShapeId('cube'), lastShapeId('prism')], false)
    await st().csgBoolean('union')
    const csgId = lastGroupResultId()

    // Зеркалим
    st().selectObjects([csgId], false)
    await st().mirrorSelected('YZ')
    const ops = st().operations
    const mop = ops[ops.length - 1] as MirrorOperation
    const mirId = mop.ids[0]

    // Проверяем дерево: mirrored CSG → boolean → baked children
    const mirNode = getNode(mirId)
    expect(mirNode?.type).toBe('boolean')
    const childIds = mirNode?.children ?? []
    expect(childIds.length).toBe(2)

    for (const childId of childIds) {
      const child = getNode(childId)
      expect(child?.type).toBe('baked')
      expect(child?.shapeType).toBeDefined()
      expect(child?.params).toBeDefined()
      expect(child?.mirroredPlane).toBe('YZ')
      // Проверяем, что params = оригинальные, не зеркалёные
      const p = child?.params as Record<string, number>
      expect(p.width ?? p.radius ?? p.torusRadius).toBeGreaterThan(0)
      expect(p.height).toBeGreaterThan(0)
    }
  })

  // ========================================================
  // Тест 3 — редактирование baked-ребёнка: params → rebuild → mirror applied
  // ========================================================
  it('Edit baked child: params → rebuild → mirror applied', async () => {
    // Создаём CSG
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 })
    st().selectObjects([lastShapeId('cube'), lastShapeId('prism')], false)
    await st().csgBoolean('union')
    const csgId = lastGroupResultId()

    // Зеркалим
    st().selectObjects([csgId], false)
    await st().mirrorSelected('YZ')
    const ops = st().operations
    const mop = ops[ops.length - 1] as MirrorOperation
    const mirId = mop.ids[0]

    // Находим baked-ребёнка (prism)
    const mirNode = getNode(mirId)!
    const prismChild = mirNode.children!.map(id => getNode(id)).find(n => n?.shapeType === 'prism')!
    expect(prismChild.type).toBe('baked')
    expect(prismChild.mirroredPlane).toBe('YZ')

    // Проверяем: params = оригинальные (radius: 5, height: 10, sides: 3)
    const p = prismChild.params! as Record<string, number>
    expect(p.radius).toBe(5)
    expect(p.height).toBe(10)
    expect(p.sides).toBe(3)

    // Вершин у призмы sides=3 — асимметричная (не круг)
    // Зеркало отражает x-координаты: если bbox.x был [a,b], то зеркальный [−b,−a]
    const childVerts = prismChild.vertices!
    let minX = Infinity, maxX = -Infinity
    for (let i = 0; i < childVerts.length; i += 3) {
      if (childVerts[i] < minX) minX = childVerts[i]
      if (childVerts[i] > maxX) maxX = childVerts[i]
    }
    // Призма sides=3 не симметрична по x: min ≠ −max
    expect(Math.abs(minX + maxX)).toBeGreaterThan(0.5)
  })

  // ========================================================
  // Тест 4 — все примитивы: CSG с каждым → mirror YZ → точное
  // ========================================================
  it.each([
    { shapeType: 'prism' as const, params: { radius: 5, height: 10, sides: 3 } },
    { shapeType: 'pyramid' as const, params: { radius: 5, height: 10, sides: 4 } },
    { shapeType: 'cone' as const, params: { radius: 5, height: 10, segments: 16 } },
    { shapeType: 'cylinder' as const, params: { radius: 5, height: 10, segments: 16 } },
    { shapeType: 'torus' as const, params: { torusRadius: 10, tubeRadius: 3, segments: 24 } },
  ])(
    'CSG with %s → mirror YZ → precise (max diff < 1e-3)',
    async ({ shapeType, params }) => {
      await st().addShape('cube', { width: 10, height: 10, depth: 10 })
      await st().addShape(shapeType, params)
      st().selectObjects([lastShapeId('cube'), lastShapeId(shapeType)], false)
      await st().csgBoolean('union')
      const csgId = lastGroupResultId()
      const csg = st().objects[csgId]

      st().selectObjects([csgId], false)
      await st().mirrorSelected('YZ')
      const ops = st().operations
      const mop = ops[ops.length - 1] as MirrorOperation
      const mirrored = st().objects[mop.ids[0]]

      // Oracle: mirror original vertices (x → -x)
      const expectedVerts = new Float32Array(csg.vertices.length)
      for (let i = 0; i < csg.vertices.length; i += 3) {
        expectedVerts[i] = -csg.vertices[i]
        expectedVerts[i + 1] = csg.vertices[i + 1]
        expectedVerts[i + 2] = csg.vertices[i + 2]
      }

      const maxDiff = maxVertexSetDiff(new Float32Array(mirrored.vertices), expectedVerts)
      console.log(`  %s mirror YZ: max vertex diff = ${maxDiff.toFixed(8)}`)
      expect(maxDiff).toBeLessThan(1e-3)
    },
  )

  // ========================================================
  // Тест 5 — UI: mirrored CSG on place (INVARIANT 4 через mesh sync)
  // ========================================================
  it('UI: mirrored CSG renders on place (data-world == mirror-oracle)', async () => {
    // Создаём CSG: cube + prism
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    await st().addShape('prism', { radius: 5, height: 10, sides: 3 })
    st().selectObjects([lastShapeId('cube'), lastShapeId('prism')], false)
    await st().csgBoolean('union')
    const csgId = lastGroupResultId()
    const csg = st().objects[csgId]

    // Зеркалим CSG
    st().selectObjects([csgId], false)
    await st().mirrorSelected('YZ')
    const ops = st().operations
    const mop = ops[ops.length - 1] as MirrorOperation
    const mirrored = st().objects[mop.ids[0]]

    // Data-world: mirror transforms + COM-centered vertices
    // transform.x = mirror(csg.transform.x) = -csg.transform.x
    const dataWorld = new Float32Array(mirrored.vertices.length)
    for (let i = 0; i < mirrored.vertices.length; i += 3) {
      dataWorld[i] = mirrored.vertices[i] + mirrored.transform.x
      dataWorld[i + 1] = mirrored.vertices[i + 1] + mirrored.transform.y
      dataWorld[i + 2] = mirrored.vertices[i + 2] + mirrored.transform.z
    }

    // Oracle: mirror of original CSG world vertices
    const oracleWorld = new Float32Array(csg.vertices.length)
    for (let i = 0; i < csg.vertices.length; i += 3) {
      oracleWorld[i] = -(csg.vertices[i] + csg.transform.x)
      oracleWorld[i + 1] = csg.vertices[i + 1] + csg.transform.y
      oracleWorld[i + 2] = csg.vertices[i + 2] + csg.transform.z
    }

    const dataBBox = bboxOf(dataWorld)
    const oracleBBox = bboxOf(oracleWorld)
    const diff = maxBBoxDiff(dataBBox, oracleBBox)
    console.log(`  UI mirrored CSG: data-world vs oracle bbox diff = ${diff.toFixed(8)}`)

    // После FIX: diff ≈ 0 (float32 точность)
    expect(diff).toBeLessThan(1e-3)
  })
})

/**
 * Max nearest-neighbor distance from each vertex in `actual` to the closest
 * vertex in `expected`. Used to compare two vertex sets (meshes) for equality.
 * Tolerance: 1e-4 for float32 output from manifold.
 */
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
