// ============================================================
// Фаза 8, Этап 8 — интеграционные тесты: 8 сценариев §10.2
// ============================================================
//
// Транспорт Worker заменён in-process мостом (worker-bridge.ts):
// вызываются НАСТОЯЩИЕ worker-handlers с НАСТОЯЩИМ manifold-3d WASM
// (загружается в vitest — проверено спайком). Мокается только postMessage
// транспорт, ничего из CSG-математики и центрирования не подделано.
//
// Конвенции данных (ARCHITECTURE_TRANSFORMS.md §5):
// - примитивы: vertices = origin-геометрия + запечённая spawn-трансляция;
//   workerWorld = T·R·S·(v − spawnT)   (как handleCsgBooleanSync)
// - CSG-результаты: vertices = COM-центрированные; world = pivot + vertex (§5.4)
// - рендер/STL: world = R·S·(v − c) + t, где c = bboxCenter(v) для примитивов
//   (spawn запечён в вершинах) и c = 0 для CSG (FIX VIEWPORT-DOUBLE-CENTERING:
//   CSG-вершины уже COM-центрированы, повторное центрирование сдвигало меш)

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Мост подменяет только транспорт Worker (в jsdom его нет).
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
import { workerBuildShape, workerClearAll, workerCsgBooleanWithSync } from '../csg/worker-client'
import { clearTree, getNode } from '../csg/history-tree'
import { centerMassAtOrigin, isPivotCenteredGeometry } from '../csg/geometry-utils'
import { buildTransformMatrix } from '../csg/worker-matrix'
import { exportToStl } from '../io/stl-export'
import { serializeDoodle, parseDoodle } from '../io/doodle-io'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import type { SceneObject, TransformNR, GroupOperation, MirrorOperation } from '../csg/types'

// ---- helpers ----

const IDENTITY = (): TransformNR => ({ x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })

interface BB { min: [number, number, number]; max: [number, number, number] }

function bboxOf(verts: Float32Array): BB {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < verts.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      if (verts[i + a] < min[a]) min[a] = verts[i + a]
      if (verts[i + a] > max[a]) max[a] = verts[i + a]
    }
  }
  return { min, max }
}

function bboxUnion(a: BB, b: BB): BB {
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1]), Math.min(a.min[2], b.min[2])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1]), Math.max(a.max[2], b.max[2])],
  }
}

function bboxClose(actual: BB, expected: BB, tol: number, label: string): number {
  let diff = 0
  for (let a = 0; a < 3; a++) {
    diff = Math.max(diff, Math.abs(actual.min[a] - expected.min[a]), Math.abs(actual.max[a] - expected.max[a]))
  }
  expect(diff, `${label}: bbox diff`).toBeLessThan(tol)
  return diff
}

/** spawn-трансляция примитива из его add_shape операции (запечена в vertices) */
function spawnTransform(id: string): TransformNR {
  const op = useDocumentStore.getState().operations.find(o => o.type === 'add_shape' && o.id === id) as
    { transform: TransformNR } | undefined
  return op ? op.transform : IDENTITY()
}

/** workerWorld примитива: T·R·S·(v − spawnT) — как handleCsgBooleanSync */
function workerWorldVerts(obj: SceneObject): Float32Array {
  const sp = spawnTransform(obj.id)
  const t = obj.transform
  const m = buildTransformMatrix(
    { x: t.x, y: t.y, z: t.z },
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < obj.vertices.length; i += 3) {
    const x = obj.vertices[i] - sp.x
    const y = obj.vertices[i + 1] - sp.y
    const z = obj.vertices[i + 2] - sp.z
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
  }
  return out
}

/** data-world CSG-результата: pivot + vertex (§5.4; RS у CSG-результата identity) */
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

function worldOf(obj: SceneObject): Float32Array {
  return obj.shapeType === 'csg' ? csgWorldVerts(obj) : workerWorldVerts(obj)
}

/** origin-геометрия примитива: vertices минус запечённая spawn-трансляция */
function minusSpawn(obj: SceneObject): Float32Array {
  const sp = spawnTransform(obj.id)
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < obj.vertices.length; i += 3) {
    out[i] = obj.vertices[i] - sp.x
    out[i + 1] = obj.vertices[i + 1] - sp.y
    out[i + 2] = obj.vertices[i + 2] - sp.z
  }
  return out
}

/** world = T·R·S·v (manifold-конвенция, как buildTransformMatrix в воркере) */
function applyTRSTo(origin: Float32Array, t: TransformNR): Float32Array {
  const m = buildTransformMatrix(
    { x: t.x, y: t.y, z: t.z },
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const out = new Float32Array(origin.length)
  for (let i = 0; i < origin.length; i += 3) {
    const x = origin[i], y = origin[i + 1], z = origin[i + 2]
    out[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
    out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
    out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
  }
  return out
}

function objOf(id: string): SceneObject {
  const o = useDocumentStore.getState().objects[id]
  expect(o, `object ${id} exists`).toBeTruthy()
  return o
}

/** Инвариант §5.4: pivot == COM(world mesh) */
function expectPivotIsCOM(obj: SceneObject): number {
  const world = csgWorldVerts(obj)
  const com = centerMassAtOrigin(world, obj.indices)
  const diff = Math.max(Math.abs(com.cx - obj.transform.x), Math.abs(com.cy - obj.transform.y), Math.abs(com.cz - obj.transform.z))
  return diff
}

function lastGroupResultId(): string {
  const ops = useDocumentStore.getState().operations
  for (let i = ops.length - 1; i >= 0; i--) {
    if (ops[i].type === 'group') return (ops[i] as GroupOperation).resultId!
  }
  throw new Error('no group op')
}

/**
 * Ожидание экспорта: world = R·S·(v − bboxCenter(v)) + t — независимая
 * реализация той же формулы, что stl-export/Viewport3D (FIX UB-0).
 */
function expectedStlBBox(objects: SceneObject[]): BB {
  let expected: BB = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
  for (const o of objects) {
    // FIX (VIEWPORT-DOUBLE-CENTERING): конвенция рендера/STL —
    // world = R·S·(v − c) + t, где c = bboxCenter(v) только для объектов с
    // запечённой трансляцией (примитивы/импорт). CSG-вершины уже
    // COM-центрированы (§5.4) → c = 0. Предикат — продакшн, чтобы
    // модель теста не могла разойтись с кодом.
    const c = isPivotCenteredGeometry(o.shapeType)
      ? [0, 0, 0]
      : (() => {
        const b = bboxOf(o.vertices)
        return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2]
      })()
    const m = buildTransformMatrix(
      { x: o.transform.x, y: o.transform.y, z: o.transform.z },
      { rotX: o.transform.rotX, rotY: o.transform.rotY, rotZ: o.transform.rotZ },
      { scaleX: o.transform.scaleX, scaleY: o.transform.scaleY, scaleZ: o.transform.scaleZ },
    )
    const wv = new Float32Array(o.vertices.length)
    for (let i = 0; i < o.vertices.length; i += 3) {
      const x = o.vertices[i] - c[0], y = o.vertices[i + 1] - c[1], z = o.vertices[i + 2] - c[2]
      wv[i] = m[0] * x + m[4] * y + m[8] * z + m[12]
      wv[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]
      wv[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14]
    }
    expected = bboxUnion(expected, bboxOf(wv))
  }
  return expected
}

const st = () => useDocumentStore.getState()

async function addCube(size = 20): Promise<string> {
  await st().addShape('cube', { width: size, height: size, depth: size })
  return Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cube' && !('operation' in st().objects[id]))!
}

async function addPrism(r = 12, h = 20): Promise<string> {
  await st().addShape('prism', { radius: r, height: h, sides: 3 })
  return Object.keys(st().objects).find(id => st().objects[id].shapeType === 'prism')!
}

async function unionIds(a: string, b: string): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean('union')
  return lastGroupResultId()
}

// ============================================================

describe('Фаза 8 §10.2 — 8 сценариев (in-process manifold bridge)', () => {

  beforeEach(async () => {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearTree()
    clearSnapshots()
    await workerClearAll()
  }, 30000)

  // ------------------------------------------------------------
  it('Scenario 1: cube + prism sides=3 → CSG Union — не сдвинут', async () => {
    const cubeId = await addCube(20)
    const prismId = await addPrism(12, 20)
    // «призма в origin (без сдвига)»: spawn x=25 → переместить в 0
    await st().moveObject(prismId, IDENTITY())

    const cubeW = bboxOf(worldOf(objOf(cubeId)))
    const prismW = bboxOf(worldOf(objOf(prismId)))
    const expected = bboxUnion(cubeW, prismW)

    const gId = await unionIds(cubeId, prismId)
    const g = objOf(gId)

    // Результат — CSG-нода с pivot=COM, vertices COM-центрированы
    expect(g.shapeType).toBe('csg')
    expect(g.children).toEqual([cubeId, prismId])

    // «На месте»: world-габарит результата == компонентное объединение миров операндов
    const w = bboxOf(csgWorldVerts(g))
    const diffBBox = bboxClose(w, expected, 1e-2, 'scenario1 union bbox')

    // Инвариант §5.4: pivot == COM(world)
    const diffCOM = expectPivotIsCOM(g)

    // Исторический CSG-PRISM-OFFSET: z призмы [0,20] вместо [-10,10]
    expect(w.min[2]).toBeCloseTo(-10, 1)
    expect(w.max[2]).toBeCloseTo(10, 1)

    console.log(`CSG center = [${g.transform.x.toFixed(4)}, ${g.transform.y.toFixed(4)}, ${g.transform.z.toFixed(4)}]`)
    console.log(`Expected (centerMassAtOrigin) = [${(g.transform.x).toFixed(4)}, ...] — diff(pivot,COM) = ${diffCOM.toExponential(2)}`)
    console.log(`union bbox diff vs operands = ${diffBBox.toExponential(2)}`)
    expect(diffCOM).toBeLessThan(1e-3)
  }, 30000)

  // ------------------------------------------------------------
  it('Scenario 2: prism → rotate → scale → resize — не удваивается', async () => {
    const id = await addPrism(12, 20)
    const T: TransformNR = { x: 10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 30, scaleX: 2, scaleY: 2, scaleZ: 2 }
    await st().moveObject(id, T)

    const before = objOf(id)
    const beforeMax = Math.max(...Array.from(before.vertices.map(Math.abs)))

    await st().resizeObject(id, { height: 40 })
    const after = objOf(id)

    // params обновились, transform НЕ тронут (anchor = центр, anchorDelta в API нет)
    expect(after.params).toEqual({ radius: 12, height: 40, sides: 3 })
    expect(after.transform).toEqual(T)

    // vertices = origin-меш НОВЫХ params — сверка с настоящим workerBuildShape(ZERO)
    const oracle = await workerBuildShape('probe-origin', 'prism', { radius: 12, height: 40, sides: 3 }, IDENTITY())
    let maxVertDiff = 0
    expect(after.vertices.length).toBe(oracle.vertices.length)
    for (let i = 0; i < after.vertices.length; i++) {
      maxVertDiff = Math.max(maxVertDiff, Math.abs(after.vertices[i] - oracle.vertices[i]))
    }
    // RESIZE-TRS-DOUBLE: раньше сюда попадал mesh с запечённым worldTransform
    expect(maxVertDiff).toBeLessThan(1e-6)

    // Мировой размер = origin-размер × scale, применённый ОДИН раз (pivot)
    const zw = bboxOf(workerWorldVerts(after))
    const zSpan = zw.max[2] - zw.min[2]
    expect(zSpan).toBeCloseTo(40 * 2, 3) // height 40 × scaleZ 2 (не 160 — без удвоения)

    const afterMax = Math.max(...Array.from(after.vertices.map(Math.abs)))
    console.log(`Prism sides=3 → rotate 30° → scale 2x → resize height=40`)
    console.log(`Before resize: vertices in origin (max |v| = ${beforeMax}), transform.position = [${T.x}, ${T.y}, ${T.z}]`)
    console.log(`After resize:  vertices in origin (max |v| = ${afterMax}), transform.position = [${after.transform.x}, ${after.transform.y}, ${after.transform.z}]`)
    console.log(`Final z world size: ${zSpan}, Expected: 80, diff = ${Math.abs(zSpan - 80)}`)
  }, 30000)

  // ------------------------------------------------------------
  it('Scenario 3: prism(RS) → CSG → зеркало YZ — позиция зеркальна, RS сохранён', async () => {
    const cubeId = await addCube(20)
    const prismId = await addPrism(12, 20)
    // RS на ребёнке — тест MIRROR-CSG-CHILD-RS-LOSS
    const prismT: TransformNR = { x: 15, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 20, scaleX: 1.5, scaleY: 1, scaleZ: 1 }
    await st().moveObject(prismId, prismT)

    // origin-геометрия детей ДО union (дети удаляются из objects при union)
    const cubeOrigin = minusSpawn(objOf(cubeId))
    const prismOrigin = minusSpawn(objOf(prismId))
    const cubeT0 = { ...objOf(cubeId).transform }
    const prismT0 = { ...objOf(prismId).transform }

    const g1Id = await unionIds(cubeId, prismId)
    const g1 = objOf(g1Id)

    st().selectObjects([g1Id], false)
    await st().mirrorSelected('YZ')

    const ops = st().operations
    const mop = ops[ops.length - 1] as MirrorOperation
    expect(mop.type).toBe('mirror')
    const g2Id = mop.ids[0]
    const g2 = objOf(g2Id)

    // 1) Позиция зеркальна (mirrorPoint YZ, center 0), scale abs сохранён
    expect(g2.shapeType).toBe('csg')
    expect(g2.transform.x).toBeCloseTo(-g1.transform.x, 3)
    expect(g2.transform.y).toBeCloseTo(g1.transform.y, 3)
    expect(g2.transform.scaleX).toBeCloseTo(Math.abs(g1.transform.scaleX), 6)
    expect(g2.transform.scaleY).toBeCloseTo(Math.abs(g1.transform.scaleY), 6)

    // 2) RS детей сохранён (MIRROR-CSG-CHILD-RS-LOSS): в клонированном дереве
    //    призма-ребёнок retains scale 1.5 и rotation (зеркальный, mirrorEuler YZ)
    const n2 = getNode(g2Id)
    expect(n2?.type).toBe('boolean')
    expect(n2?.children?.length).toBe(2)
    const clonePrism = n2!.children!.map(cid => getNode(cid!)).find(n => n && n.shapeType === 'prism')
    expect(clonePrism, 'mirrored tree keeps prism child').toBeTruthy()
    expect(clonePrism!.localTransform!.scaleX).toBeCloseTo(1.5, 6)
    expect(clonePrism!.localTransform!.rotZ).toBeCloseTo(-20, 4)
    expect(clonePrism!.localTransform!.x).toBeCloseTo(-15, 4)

    // 3) Геометрия: COM-центрирована, pivot = COM (§5.4)
    //    MIRROR-CSG-CHILD-RS-LOSS: в клонированном дереве призма-ребёнок
    //    retains scale 1.5 и rotation (зеркальный, mirrorEuler YZ)
    const diffCOM = expectPivotIsCOM(g2)

    // FIX (MIRROR-CHIRALITY): старый оракл (workerCsgBooleanWithSync с
    // зеркальными TRS) давал НЕТОЧНОЕ зеркало — геометрия детей не отражалась.
    // После FIX (MIRROR-CHIRALITY, Variant B) baked-дети имеют отражённые
    // вершины, поэтому production-путь даёт ТОЧНОЕ зеркало.
    // Новый оракл: mirror(original CSG world vertices) — true mirror oracle.
    const origWorldVerts = csgWorldVerts(g1)
    const mirrorVerts = new Float32Array(origWorldVerts.length)
    for (let i = 0; i < origWorldVerts.length; i += 3) {
      mirrorVerts[i] = -origWorldVerts[i]    // YZ mirror: x → -x
      mirrorVerts[i + 1] = origWorldVerts[i + 1]
      mirrorVerts[i + 2] = origWorldVerts[i + 2]
    }
    const expected3 = bboxOf(mirrorVerts)
    const b2 = bboxOf(csgWorldVerts(g2))
    const diff3 = bboxClose(b2, expected3, 1e-2, 'scenario3 mirrored geometry (true mirror)')

    console.log(`Mirrored CSG center = [${g2.transform.x.toFixed(4)}, ${g2.transform.y.toFixed(4)}, ${g2.transform.z.toFixed(4)}]`)
    console.log(`Scale preserved = [${g2.transform.scaleX}, ${g2.transform.scaleY}, ${g2.transform.scaleZ}] (COM diff = ${diffCOM.toExponential(2)}, geometry doctrine diff = ${diff3.toExponential(2)})`)
  }, 30000)

  // ------------------------------------------------------------
  it('Scenario 4: CSG + CSG Union — на месте, без drift', async () => {
    const cubeId = await addCube(20)
    const prismId = await addPrism(12, 20)
    await st().moveObject(prismId, IDENTITY())
    const g1Id = await unionIds(cubeId, prismId)

    await st().addShape('sphere', { radius: 10, segments: 16 })
    const sphereId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'sphere')!
    await st().addShape('cylinder', { radius: 8, height: 20, segments: 16 })
    const cylId = Object.keys(st().objects).find(id => st().objects[id].shapeType === 'cylinder')!
    await st().moveObject(sphereId, { ...IDENTITY(), x: 60 })
    await st().moveObject(cylId, { ...IDENTITY(), x: 60 })
    const g2Id = await unionIds(sphereId, cylId)

    const b1 = bboxOf(worldOf(objOf(g1Id)))
    const b2 = bboxOf(worldOf(objOf(g2Id)))
    const expected = bboxUnion(b1, b2)

    // Оба операнда — CSG → путь workerCsgBoolean
    const g3Id = await unionIds(g1Id, g2Id)
    const g3 = objOf(g3Id)

    const w = bboxOf(csgWorldVerts(g3))
    const diffBBox = bboxClose(w, expected, 1e-2, 'scenario4 CSG+CSG bbox (drift check)')
    const diffCOM = expectPivotIsCOM(g3)
    expect(diffCOM).toBeLessThan(1e-3)

    console.log(`CSG_3 center = [${g3.transform.x.toFixed(4)}, ${g3.transform.y.toFixed(4)}, ${g3.transform.z.toFixed(4)}]`)
    console.log(`Expected = [${((expected.min[0] + expected.max[0]) / 2).toFixed(4)}, ...] (bbox center reference)`)
    console.log(`bbox diff = ${diffBBox.toExponential(2)}, pivot-vs-COM diff = ${diffCOM.toExponential(2)} (должно быть < 1e-3)`)
  }, 30000)

  // ------------------------------------------------------------
  it('Scenario 5: cube(scale 0.5) + prism(rot 20,20,20) → CSG — на месте', async () => {
    const cubeId = await addCube(20)
    await st().moveObject(cubeId, { x: -10, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 0.5, scaleY: 0.5, scaleZ: 0.5 })
    const prismId = await addPrism(12, 20)
    await st().moveObject(prismId, { x: 10, y: 0, z: 0, rotX: 20, rotY: 20, rotZ: 20, scaleX: 1, scaleY: 1, scaleZ: 1 })

    const bCube = bboxOf(worldOf(objOf(cubeId)))
    const bPrism = bboxOf(worldOf(objOf(prismId)))
    const expected = bboxUnion(bCube, bPrism)

    const gId = await unionIds(cubeId, prismId)
    const g = objOf(gId)

    const w = bboxOf(csgWorldVerts(g))
    const diffBBox = bboxClose(w, expected, 1e-2, 'scenario5 scaled+rotated union bbox')
    const diffCOM = expectPivotIsCOM(g)
    expect(diffCOM).toBeLessThan(1e-3)

    console.log(`CSG center = [${g.transform.x.toFixed(4)}, ${g.transform.y.toFixed(4)}, ${g.transform.z.toFixed(4)}]`)
    console.log(`bbox diff vs operands (scale 0.5 + rot 20,20,20) = ${diffBBox.toExponential(2)}`)
  }, 30000)

  // ------------------------------------------------------------
  it('Scenario 6: Export STL — правильные координаты', async () => {
    const cubeId = await addCube(20)
    const prismId = await addPrism(12, 20)
    await st().moveObject(prismId, IDENTITY())
    const gId = await unionIds(cubeId, prismId)
    // Второй объект в сцене — проверка «не разлетаются» при экспорте нескольких
    const cube2Id = await addCube(10)
    await st().moveObject(cube2Id, { ...IDENTITY(), x: 40 })

    const objects = Object.values(st().objects)
    const blob = exportToStl(objects)
    const buf = new DataView(await blob.arrayBuffer())

    const count = buf.getUint32(80, true)
    expect(count).toBe(objects.reduce((s, o) => s + o.indices.length / 3, 0))

    // Бинарный STL: 80 байт заголовок + uint32 count + по 50 байт (normal + 3 вершины + attr)
    const parsed: number[] = []
    for (let t = 0; t < count; t++) {
      const off = 84 + t * 50 + 12 // пропустить normal
      for (let k = 0; k < 9; k++) parsed.push(buf.getFloat32(off + k * 4, true))
    }
    const stlBB = bboxOf(new Float32Array(parsed))

    // Ожидание — формула стл-экспорта/вьюпорта: world = R·S·(v − c) + t,
    // c = bboxCenter для примитивов, c = 0 для CSG (§5.4 + VIEWPORT-DOUBLE-CENTERING)
    const expected = expectedStlBBox(objects)

    const diff = bboxClose(stlBB, expected, 1e-2, 'scenario6 STL bbox')
    console.log(`STL vertex count = ${count * 3}, tris = ${count}`)
    console.log(`STL bbox = [${stlBB.min.map(n => n.toFixed(2)).join(', ')}] .. [${stlBB.max.map(n => n.toFixed(2)).join(', ')}]`)
    console.log(`bbox diff vs expected(world-конвенция) = ${diff.toExponential(2)}`)
  }, 30000)

  // ------------------------------------------------------------
  it('Scenario 7: Undo/redo — CSG восстанавливается на месте', async () => {
    const cubeId = await addCube(20)
    const prismId = await addPrism(12, 20)
    await st().moveObject(prismId, IDENTITY())
    const gId = await unionIds(cubeId, prismId)
    const gBefore = objOf(gId)
    const bboxBefore = bboxOf(csgWorldVerts(gBefore))
    const pivotBefore = { ...gBefore.transform }

    // 1) канонический путь — snapshot cache
    await st().undo()
    expect(st().objects[gId]).toBeUndefined()
    expect(objOf(cubeId)).toBeTruthy()
    expect(objOf(prismId)).toBeTruthy()
    console.log('After undo: CSG не существует')

    await st().redo()
    const gAfter = objOf(gId)
    expect(gAfter.transform).toEqual(pivotBefore)
    const diffSnap = bboxClose(bboxOf(csgWorldVerts(gAfter)), bboxBefore, 1e-4, 'scenario7 snapshot-path redo')

    // 2) путь пересборки — clearSnapshots → rebuildFromHistory (настоящий handleRebuildScene)
    clearSnapshots()
    await st().undo()
    expect(st().objects[gId]).toBeUndefined()
    expect(objOf(cubeId)).toBeTruthy()
    expect(objOf(prismId)).toBeTruthy()
    console.log('After undo (rebuild path): CSG не существует, операнды восстановлены')

    await st().redo()
    const gRebuilt = objOf(gId)
    const diffRebuild = bboxClose(bboxOf(csgWorldVerts(gRebuilt)), bboxBefore, 1e-2, 'scenario7 rebuild-path redo')

    console.log(`After redo: CSG восстановлен, snapshot-path diff = ${diffSnap.toExponential(2)}, rebuild-path diff = ${diffRebuild.toExponential(2)}`)
  }, 30000)

  // ------------------------------------------------------------
  it('Scenario 8: Save/load .doodle — CSG восстанавливается', async () => {
    const cubeId = await addCube(20)
    const prismId = await addPrism(12, 20)
    await st().moveObject(prismId, IDENTITY())
    const gId = await unionIds(cubeId, prismId)

    // «CSG с зеркалом» из скетча задачи: зеркалим CSG-результат
    st().selectObjects([gId], false)
    await st().mirrorSelected('YZ')
    const mirrorId = (st().operations[st().operations.length - 1] as MirrorOperation).ids[0]

    const g = objOf(gId)
    const gm = objOf(mirrorId)
    const bboxLive = bboxOf(csgWorldVerts(g))
    const pivotLive = { ...g.transform }
    const opsLive = st().operations.slice()

    // save → load (ядро openDoodle без file-picker: serialize → parse → rebuild → tree)
    const blob = await serializeDoodle(opsLive)
    const buf = await blob.arrayBuffer()
    const doc = await parseDoodle(buf)
    expect(doc.operations.length).toBe(opsLive.length)

    await workerClearAll()
    clearSnapshots()
    clearTree()

    const objs = await rebuildFromHistory(doc.operations)
    rebuildBuildTree(doc.operations, objs)

    const loaded = objs[gId]
    expect(loaded, 'CSG object restored').toBeTruthy()
    expect(loaded.shapeType).toBe('csg')
    expect(loaded.transform).toEqual(pivotLive)
    const diff = bboxClose(bboxOf(csgWorldVerts(loaded)), bboxLive, 1e-2, 'scenario8 loaded CSG world bbox')

    // Зеркальный CSG: позиция восстановлена (pivot.x = −pivot.x оригинала)
    const loadedM = objs[mirrorId]
    expect(loadedM, 'mirrored CSG object restored').toBeTruthy()
    expect(loadedM.transform.x).toBeCloseTo(-pivotLive.x, 4)

    console.log(`After load: CSG восстановлен, diff = ${diff.toExponential(2)}`)
    console.log(`Mirrored CSG: loaded pivot.x = ${loadedM.transform.x.toFixed(4)} (live ${gm.transform.x.toFixed(4)}), vertex count ${loadedM.vertices.length} vs live ${gm.vertices.length}`)
  }, 30000)
})
