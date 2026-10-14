// ============================================================
// Unit tests — document-store: computeAABB, extractAndCenterInPlace,
// resizeObject (Фаза 8, Этап 7)
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// jsdom не имеет Worker/WASM: mock worker-client синтетическими origin-мешами.
// vi.mock hoisted — определён до импорта document-store.
vi.mock('../csg/worker-client', () => {
  function originBoxMesh(id: string, params: Record<string, number>) {
    const w = params.width ?? (params.radius ?? 5) * 2
    const h = params.height ?? 10
    const d = params.depth ?? (params.radius ?? 5) * 2
    const hw = w / 2, hh = h / 2, hd = d / 2
    const vertices = new Float32Array([
      -hw, -hh, -hd, hw, -hh, -hd, hw, hh, -hd, -hw, hh, -hd,
      -hw, -hh, hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd,
    ])
    const indices = new Uint32Array([
      0, 2, 1, 0, 3, 2, 1, 2, 6, 1, 6, 5, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3,
    ])
    return { objId: id, vertices, indices, normals: null, tris: 12, ms: 0 }
  }
  return {
    workerBuildShape: vi.fn(async (id: string, _st: string, p: Record<string, number>) => originBoxMesh(id, p)),
    workerCsgBoolean: vi.fn(),
    workerCsgBooleanWithSync: vi.fn(),
    workerBuildImportedMesh: vi.fn(),
    workerApplyFillet: vi.fn(),
    workerMirrorObject: vi.fn(),
    workerRebuildScene: vi.fn(async () => ({ results: [], ms: 0 })),
    workerDeleteObjects: vi.fn(async () => { }),
    workerClearAll: vi.fn(async () => { }),
    workerSyncObjects: vi.fn(async () => { }),
    workerSyncMesh: vi.fn(async () => { }),
    workerRebuildNode: vi.fn(async () => originBoxMesh('n', {})),
  }
})

import { computeAABB, extractAndCenterInPlace } from './document-store'
import { useDocumentStore } from './document-store'
import { makeObject } from './helpers'
import { workerBuildShape } from '../csg/worker-client'
import { createPrimitiveNode, createBooleanNode, getNode, clearTree } from '../csg/history-tree'
import type { SceneObject, TransformNR } from '../csg/types'

describe('computeAABB', () => {
  it('computes correct min/max for a simple box', () => {
    const verts = new Float32Array([
      0, 0, 0,
      2, 0, 0,
      2, 3, 0,
      0, 3, 0,
      0, 0, 4,
      2, 0, 4,
      2, 3, 4,
      0, 3, 4,
    ])
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(0)
    expect(aabb.min.y).toBe(0)
    expect(aabb.min.z).toBe(0)
    expect(aabb.max.x).toBe(2)
    expect(aabb.max.y).toBe(3)
    expect(aabb.max.z).toBe(4)
  })

  it('handles negative coordinates', () => {
    const verts = new Float32Array([
      -5, -10, -3,
      5, 10, 3,
    ])
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(-5)
    expect(aabb.min.y).toBe(-10)
    expect(aabb.min.z).toBe(-3)
    expect(aabb.max.x).toBe(5)
    expect(aabb.max.y).toBe(10)
    expect(aabb.max.z).toBe(3)
  })

  it('handles a single vertex', () => {
    const verts = new Float32Array([7, 8, 9])
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(7)
    expect(aabb.min.y).toBe(8)
    expect(aabb.min.z).toBe(9)
    expect(aabb.max.x).toBe(7)
    expect(aabb.max.y).toBe(8)
    expect(aabb.max.z).toBe(9)
  })
})

describe('extractAndCenterInPlace', () => {
  it('shifts vertices so bbox center is at origin', () => {
    // Box from (10,20,30) to (30,40,50) — center at (20,30,40)
    const verts = new Float32Array([
      10, 20, 30,
      30, 20, 30,
      30, 40, 30,
      10, 40, 30,
      10, 20, 50,
      30, 20, 50,
      30, 40, 50,
      10, 40, 50,
    ])
    const { cx, cy, cz } = extractAndCenterInPlace(verts)
    expect(cx).toBe(20)
    expect(cy).toBe(30)
    expect(cz).toBe(40)

    // After centering, min should be at (-10,-10,-10) and max at (10,10,10)
    const aabb = computeAABB(verts)
    expect(aabb.min.x).toBe(-10)
    expect(aabb.min.y).toBe(-10)
    expect(aabb.min.z).toBe(-10)
    expect(aabb.max.x).toBe(10)
    expect(aabb.max.y).toBe(10)
    expect(aabb.max.z).toBe(10)
  })

  it('modifies the input array in-place', () => {
    const verts = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0])
    const original = new Float32Array(verts)
    extractAndCenterInPlace(verts)
    // The array should have changed
    expect(verts).not.toEqual(original)
  })

  it('returns zero center for empty array', () => {
    const verts = new Float32Array(0)
    const { cx, cy, cz } = extractAndCenterInPlace(verts)
    expect(cx).toBe(0)
    expect(cy).toBe(0)
    expect(cz).toBe(0)
  })

  it('is a no-op for already-centered geometry', () => {
    // Box from (-5,-5,-5) to (5,5,5) — center at (0,0,0)
    const verts = new Float32Array([
      -5, -5, -5,
      5, -5, -5,
      5, 5, -5,
      -5, 5, -5,
      -5, -5, 5,
      5, -5, 5,
      5, 5, 5,
      -5, 5, 5,
    ])
    const original = new Float32Array(verts)
    const { cx, cy, cz } = extractAndCenterInPlace(verts)
    expect(cx).toBe(0)
    expect(cy).toBe(0)
    expect(cz).toBe(0)
    // Vertices should not change
    expect(verts).toEqual(original)
  })
})

// ============================================================
// CSG-PRESERVE-RS: csgBoolean preserves rotation/scale from operand A
//
// NOTE: These tests require a Worker/WASM environment and cannot run
// in jsdom. They are kept as documentation for the expected behavior.
// Run manually in the browser or with a proper worker mock.
// ============================================================

/*
describe('csgBoolean preserves rotation/scale', () => {
  it('copies rotation/scale from operand A', async () => {
    const store = useDocumentStore.getState()

    // Создать куб с rotation/scale
    await store.addShape('cube', { width: 20, height: 20, depth: 20 })
    // Применяем custom transform через moveObject (rotate + scale)
    const objA = Object.values(store.objects)[0]
    await store.moveObject(objA.id, {
      x: objA.transform.x, y: objA.transform.y, z: objA.transform.z,
      rotX: 20, rotY: 20, rotZ: 20,
      scaleX: 1, scaleY: 1, scaleZ: 0.5,
    })

    // Создать второй куб
    await store.addShape('cube', { width: 20, height: 20, depth: 20 })

    // Выделить оба и сделать CSG union
    const ids = Object.values(store.objects).filter(o => o.shapeType === 'cube').map(o => o.id)
    store.selectObjects(ids, false)
    await store.csgBoolean('union')

    // Проверить результат
    const csgResult = Object.values(store.objects).find(o => o.shapeType === 'csg')

    expect(csgResult).toBeDefined()
    expect(csgResult!.transform.rotX).toBe(20)
    expect(csgResult!.transform.rotY).toBe(20)
    expect(csgResult!.transform.rotZ).toBe(20)
    expect(csgResult!.transform.scaleX).toBe(1)
    expect(csgResult!.transform.scaleY).toBe(1)
    expect(csgResult!.transform.scaleZ).toBe(0.5)
  })

  it('CSG with mirrored prism preserves negative scale', async () => {
    const store = useDocumentStore.getState()

    // Призма sides=3
    await store.addShape('prism', { radius: 12, height: 20, sides: 3 })

    // Зеркало YZ → scaleX=-1
    const prism = Object.values(store.objects)[0]
    store.selectObjects([prism.id], false)
    await store.mirrorSelected('YZ')

    const mirroredPrism = Object.values(store.objects).find(o => o.shapeType === 'prism')!
    expect(mirroredPrism).toBeDefined()
    expect(mirroredPrism!.transform.scaleX).toBe(-1)

    // Куб
    await store.addShape('cube', { width: 20, height: 20, depth: 20 })

    // CSG union
    const ids = Object.values(store.objects).map(o => o.id)
    store.selectObjects(ids, false)
    await store.csgBoolean('union')

    const csg = Object.values(store.objects).find(o => o.shapeType === 'csg')!

    // Проверить что отрицательный scale сохранён
    expect(csg.transform.scaleX).toBe(-1)
  })
})
*/

// ============================================================
// Фаза 8, Этап 7 — resizeObject: params-only, vertices в origin
// (RESIZE-TRS-DOUBLE)
// ============================================================
const IDENTITY: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

// Тот же origin-box, что возвращает mock workerBuildShape — для seed-объектов
function originBox(params: Record<string, number>): { vertices: Float32Array; indices: Uint32Array } {
  const w = params.width ?? (params.radius ?? 5) * 2
  const h = params.height ?? 10
  const d = params.depth ?? (params.radius ?? 5) * 2
  const hw = w / 2, hh = h / 2, hd = d / 2
  return {
    vertices: new Float32Array([
      -hw, -hh, -hd, hw, -hh, -hd, hw, hh, -hd, -hw, hh, -hd,
      -hw, -hh, hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd,
    ]),
    indices: new Uint32Array([
      0, 2, 1, 0, 3, 2, 1, 2, 6, 1, 6, 5, 4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 0, 4, 7, 0, 7, 3,
    ]),
  }
}

function seedObject(id: string, shapeType: SceneObject['shapeType'], params: Record<string, number>, transform: TransformNR): SceneObject {
  const { vertices, indices } = originBox(params)
  const obj = makeObject({ id, shapeType, params: { ...params }, color: '#fff', transform, visible: true, locked: false, vertices, indices, normals: null })
  useDocumentStore.setState((s) => ({ objects: { ...s.objects, [id]: obj } }))
  return obj
}

describe('resizeObject (Этап 7, RESIZE-TRS-DOUBLE)', () => {
  beforeEach(() => {
    clearTree()
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    vi.mocked(workerBuildShape).mockClear()
  })

  it('vertices не удваиваются: mesh пересобирается в ORIGIN, transform не меняется', async () => {
    const transform: TransformNR = { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 30, scaleX: 2, scaleY: 1, scaleZ: 1 }
    seedObject('p1', 'prism', { radius: 12, height: 20, sides: 3 }, transform)
    const before = useDocumentStore.getState().objects.p1
    const beforeAabb = computeAABB(before.vertices)
    const beforeMax = Math.max(...Array.from(before.vertices.map(Math.abs)))

    await useDocumentStore.getState().resizeObject('p1', { height: 40 })
    const after = useDocumentStore.getState().objects.p1

    // Ключевой признак Stage 7: mesh запрошен с НУЛЕВЫМ transform (origin),
    // а НЕ с obj.transform (иначе TRS запекается в vertices → удвоение на pivot)
    const call = vi.mocked(workerBuildShape).mock.calls.find((c) => c[0] === 'p1')!
    expect(call[3]).toEqual({ x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

    // params обновлены
    expect(after.params).toEqual({ radius: 12, height: 40, sides: 3 })
    // vertices в origin: bbox центрирован, ни rot, ни scale не запечены
    const aabb = computeAABB(after.vertices)
    const afterMax = Math.max(...Array.from(after.vertices.map(Math.abs)))
    expect((aabb.min.x + aabb.max.x) / 2).toBeCloseTo(0, 5)
    expect((aabb.min.y + aabb.max.y) / 2).toBeCloseTo(0, 5)
    expect(aabb.max.y - aabb.min.y).toBeCloseTo(40, 5) // новый params.height, не 40*2
    // transform не изменился — TRS живёт ТОЛЬКО в transform
    expect(after.transform).toEqual(transform)

    console.log(`Before resize: vertices in origin (max |v| = ${beforeMax}), transform.position = [${transform.x}, ${transform.y}, ${transform.z}]`)
    console.log(`After resize:  vertices in origin (max |v| = ${afterMax}), transform.position = [${after.transform.x}, ${after.transform.y}, ${after.transform.z}]`)
  })

  it('anchor-семантика: transform.position не меняется (центральный anchor; anchorDelta в API отсутствует)', async () => {
    // grep-факт: resizeObject(id, params: ShapeParams) — параметра anchor нет;
    // anchor в store существует только у alignSelected. Текущая семантика —
    // рост вокруг pivot (центр). Проверим, что position сохранён.
    const transform: TransformNR = { ...IDENTITY, x: 10 }
    seedObject('c1', 'cube', { width: 10, height: 10, depth: 10 }, transform)
    await useDocumentStore.getState().resizeObject('c1', { width: 30 })
    const after = useDocumentStore.getState().objects.c1
    expect(after.transform.x).toBe(10)
    expect(after.transform.y).toBe(0)
    expect(after.transform.z).toBe(0)
    expect(after.params.width).toBe(30)
  })

  it('CSG-результат: vertices не трогаются, resize = scale в transform', async () => {
    const transform: TransformNR = { ...IDENTITY, x: 5 }
    const obj = seedObject('g1', 'csg', {}, transform)
    const beforeVertices = obj.vertices

    await useDocumentStore.getState().resizeObject('g1', { width: 20 })
    const after = useDocumentStore.getState().objects.g1

    // vertices не перезаписаны (тот же буфер, тот же origin-контент)
    expect(after.vertices).toBe(beforeVertices)
    const aabb = computeAABB(after.vertices)
    expect((aabb.min.x + aabb.max.x) / 2).toBeCloseTo(0, 5)
    // scale = target/currentSize (20/10), позиция не изменилась
    expect(after.transform.scaleX).toBeCloseTo(2, 6)
    expect(after.transform.x).toBe(5)
    // CSG НЕ пересобирается через workerBuildShape (mesh-запись — корень бага)
    expect(vi.mocked(workerBuildShape)).not.toHaveBeenCalled()
  })

  it('Scenario 2 (§10.2): призма → rotate 30° → scale 2× → resize — без удвоения', async () => {
    const transform: TransformNR = { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 30, scaleX: 2, scaleY: 1, scaleZ: 1 }
    seedObject('sc2', 'prism', { radius: 12, height: 20, sides: 3 }, transform)

    await useDocumentStore.getState().resizeObject('sc2', { height: 40 })
    const after = useDocumentStore.getState().objects.sc2

    // Математическое ожидание: vertices = origin-бокс НОВЫХ params;
    // мировые габариты = params × scale (scale применён ОДИН раз — на pivot).
    const aabb = computeAABB(after.vertices)
    const localSize = { x: aabb.max.x - aabb.min.x, y: aabb.max.y - aabb.min.y, z: aabb.max.z - aabb.min.z }
    const worldSize = {
      x: localSize.x * after.transform.scaleX,
      y: localSize.y * after.transform.scaleY,
      z: localSize.z * after.transform.scaleZ,
    }
    const expected = { x: 48, y: 40, z: 24 } // (2*radius)*scaleX, height, (2*radius)*scaleZ
    const diff = Math.max(
      Math.abs(worldSize.x - expected.x),
      Math.abs(worldSize.y - expected.y),
      Math.abs(worldSize.z - expected.z),
    )
    // Старый код дал бы worldSize.x = 24*2(запеч.) *2(pivot) = 96 — удвоение
    expect(diff).toBeLessThan(1e-4)
    expect(after.transform.rotZ).toBe(30) // rotation не удвоен и не запечён
    expect(after.transform.scaleX).toBe(2)

    console.log('Prism sides=3 → rotate 30° → scale 2x → resize height=40')
    console.log(`Final world size: [${worldSize.x}, ${worldSize.y}, ${worldSize.z}]`)
    console.log(`Expected:         [${expected.x}, ${expected.y}, ${expected.z}]  diff = ${diff}`)
  })

  it('relativeToParent детей boolean не меняется при resize', async () => {
    createPrimitiveNode('ra', 'cube', { width: 10, height: 10, depth: 10 }, { ...IDENTITY })
    createPrimitiveNode('rb', 'cube', { width: 10, height: 10, depth: 10 }, { ...IDENTITY, x: 10 })
    createBooleanNode('ru', 'union', 'ra', 'rb')

    const beforeRelA = JSON.parse(JSON.stringify(getNode('ra')!.relativeToParent))
    expect(beforeRelA).not.toBeNull() // Stage 3 заполняет relativeToParent детей

    seedObject('ra', 'cube', { width: 10, height: 10, depth: 10 }, { ...IDENTITY })
    await useDocumentStore.getState().resizeObject('ra', { width: 30 })

    const afterNode = getNode('ra')!
    // JSON-клон нормализует -0 → 0 (subtractTransform даёт -0 в rotationDelta;
    // Object.is различает 0 и -0, семантически это одно и то же)
    expect(JSON.parse(JSON.stringify(afterNode.relativeToParent))).toEqual(beforeRelA)
    expect(afterNode.params).toEqual({ width: 30, height: 10, depth: 10 })
  })

  it('localTransform ноды не меняется при resize (anchor = центр)', async () => {
    const T: TransformNR = { x: 7, y: 2, z: 0, rotX: 0, rotY: 0, rotZ: 45, scaleX: 1, scaleY: 1, scaleZ: 1 }
    seedObject('lt1', 'cube', { width: 10, height: 10, depth: 10 }, T)

    await useDocumentStore.getState().resizeObject('lt1', { width: 20 })

    const node = getNode('lt1')!
    expect(node.localTransform).toEqual(T)
    expect(node.params).toEqual({ width: 20, height: 10, depth: 10 })
    // и в store transform идентичен
    expect(useDocumentStore.getState().objects.lt1.transform).toEqual(T)
  })
})
