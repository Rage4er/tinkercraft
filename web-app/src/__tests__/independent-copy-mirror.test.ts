// ============================================================
// independent-copy-mirror.test.ts — CSG-INDEPENDENT-COPY: зеркало CSG
// ============================================================
// Зеркало CSG-результата даёт НЕЗАВИСИМУЮ параметрическую копию: своё дерево
// (примитивы с params + mirrored[]), а не запечённый меш. Правка ребёнка копии
// пересчитывает только копию; правка оригинала копию не трогает.
// Эталон правки — «свежий» CSG с новыми params, отражённый той же плоскостью.
// Настоящий manifold-WASM через worker-bridge.

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
import { getTreeView, isChildEditable } from '../csg/tree-view'
import { computeRSMatrix } from '../csg/worker-matrix'
import { meshVolume, checkChildEditable, findCreationTransform } from '../store/edit-child'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import { useNotifications } from '../store/notifications'
import type { SceneObject, TransformNR, MirrorOperation, TinkerCraftOperation, MirrorPlane } from '../csg/types'

const st = () => useDocumentStore.getState()

const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })

function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, clipboard: [] })
  clearSnapshots()
  clearTree()
  useNotifications.setState({ notifications: [] })
}

beforeEach(reset)

/** world = pos + R·S·v */
function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < out.length; i += 3) {
    const x = obj.vertices[i], y = obj.vertices[i + 1], z = obj.vertices[i + 2]
    out[i] = r00 * x + r01 * y + r02 * z + t.x
    out[i + 1] = r10 * x + r11 * y + r12 * z + t.y
    out[i + 2] = r20 * x + r21 * y + r22 * z + t.z
  }
  return out
}

function bbox(v: Float32Array): number[] {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) {
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) }
  }
  return [...mn, ...mx]
}

/** Совпадение в мире: bbox (0.01) + объём (1e-3). */
function expectSameWorld(a: SceneObject, b: SceneObject): void {
  const ba = bbox(worldVerts(a)), bb = bbox(worldVerts(b))
  for (let i = 0; i < 6; i++) expect(ba[i]).toBeCloseTo(bb[i], 2)
  const va = meshVolume(worldVerts(a), a.indices), vb = meshVolume(worldVerts(b), b.indices)
  expect(Math.abs(va - vb) / Math.max(va, vb)).toBeLessThan(1e-3)
}

function expectSameMesh(a: SceneObject, b: SceneObject): void {
  expect(a.transform).toEqual(b.transform)
  expect(a.vertices.length).toBe(b.vertices.length)
  expect(Array.from(a.vertices)).toEqual(Array.from(b.vertices))
}

async function shape(type: 'cube' | 'sphere' | 'cylinder', params: Record<string, number>, t: TransformNR): Promise<string> {
  await st().addShape(type, params)
  const ids = Object.keys(st().objects)
  const id = ids[ids.length - 1]
  await st().moveObject(id, t)
  return id
}

async function csg(a: string, b: string, op: 'union' | 'subtract' | 'intersect'): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean(op)
  return st().selectedIds[0]
}

async function mirror(id: string, plane: MirrorPlane): Promise<string> {
  st().selectObjects([id], false)
  await st().mirrorSelected(plane)
  const op = st().operations[st().operations.length - 1] as MirrorOperation
  expect(op.type).toBe('mirror')
  return op.ids[0]
}

const CUBE_T = at(10, 3, 0, { rotZ: 30 }) // операнд A повёрнут — система создания с поворотом
const SPHERE_T = at(24, 3)

/** куб (A, повёрнут) ∪ сфера(r) → зеркало `plane`. */
async function scene(radius = 8, plane: MirrorPlane = 'YZ') {
  const c = await shape('cube', { width: 20, height: 20, depth: 20 }, CUBE_T)
  const s = await shape('sphere', { radius, segments: 32 }, SPHERE_T)
  const root = await csg(c, s, 'union')
  const copy = await mirror(root, plane)
  return { c, s, root, copy }
}

/** Эталон: свежая сцена с теми же операндами и сферой `radius`, отражённая. */
async function freshMirrored(radius: number, plane: MirrorPlane = 'YZ'): Promise<SceneObject> {
  reset()
  const { copy } = await scene(radius, plane)
  return st().objects[copy]
}

const errors = () => useNotifications.getState().notifications.filter(n => n.type === 'error' || n.type === 'warning')

describe('CSG-INDEPENDENT-COPY: зеркало CSG → копия дерева', () => {
  it('копия — своё дерево (не baked): дети-примитивы с params и mirrored[], правятся', async () => {
    const { c, s, root, copy } = await scene()
    const node = getNode(copy)
    expect(node?.type).toBe('boolean')
    expect(st().objects[copy].shapeType).toBe('csg')

    const view = getTreeView(copy)!
    expect(view.children.map(ch => ch.id)).toEqual([`${copy}:${c}`, `${copy}:${s}`])
    for (const ch of view.children) {
      expect(ch.type).toBe('primitive')
      expect(ch.editable).toBe(true)
      expect(ch.notEditableReason).toBeNull()
      expect(ch.mirrored).toBe(true)
    }
    expect(getNode(`${copy}:${c}`)?.params).toEqual({ width: 20, height: 20, depth: 20 })
    expect(getNode(`${copy}:${s}`)?.params).toMatchObject({ radius: 8 })
    expect(getNode(`${copy}:${s}`)?.mirrored).toEqual(['YZ'])
    // дерево оригинала не тронуто
    expect(getTreeView(root)!.children.map(ch => ch.id)).toEqual([c, s])
    expect(getNode(c)?.mirrored).toBeUndefined()
    // система создания копии найдена, дерево воспроизводит меш (калибровка 9.3)
    expect(findCreationTransform(st().operations, copy)).not.toBeNull()
    for (const ch of view.children) {
      expect(await checkChildEditable({ rootId: copy, nodeId: ch.id, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex })).toBeNull()
    }
  })

  it('правка C (радиус сферы +1) → C пересчитана = свежее зеркало; A не тронут', async () => {
    const { s, root, copy } = await scene()
    const rootBefore = st().objects[root]
    const copyBefore = st().objects[copy]

    await st().editChildParams(copy, `${copy}:${s}`, { radius: 9 })

    expect(errors()).toEqual([])
    const after = st().objects[copy]
    expect(after.vertices).not.toEqual(copyBefore.vertices)
    expect(after.transform).toEqual(copyBefore.transform)
    expectSameMesh(st().objects[root], rootBefore)
    expect(getNode(s)?.params?.radius).toBe(8)
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(9)

    const fresh = await freshMirrored(9)
    expectSameWorld(after, fresh)
  })

  it('правка A → C не тронута (независимая копия, не связанная)', async () => {
    const { s, root, copy } = await scene()
    const copyBefore = st().objects[copy]
    const rootBefore = st().objects[root]

    await st().editChildParams(root, s, { radius: 10 })

    expect(errors()).toEqual([])
    expect(st().objects[root].vertices).not.toEqual(rootBefore.vertices)
    expectSameMesh(st().objects[copy], copyBefore)
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(8)
  })

  it('плоскости XZ и XY: правка копии = свежее зеркало', async () => {
    for (const plane of ['XZ', 'XY'] as const) {
      reset()
      const { s, copy } = await scene(8, plane)
      await st().editChildParams(copy, `${copy}:${s}`, { radius: 9 })
      expect(errors()).toEqual([])
      const edited = st().objects[copy]
      const fresh = await freshMirrored(9, plane)
      expectSameWorld(edited, fresh)
    }
  })

  it('копия перемещена после зеркала — правка ребёнка работает, pivot не меняется', async () => {
    const { s, copy } = await scene()
    await st().moveObject(copy, at(-40, 12, 5, { rotZ: -30 }))
    const moved = st().objects[copy]
    await st().editChildParams(copy, `${copy}:${s}`, { radius: 9 })
    expect(errors()).toEqual([])
    expect(st().objects[copy].transform).toEqual(moved.transform)
    expect(st().objects[copy].vertices).not.toEqual(moved.vertices)
  })

  it('зеркало зеркальной копии: правка ребёнка второй копии = свежее (двойное зеркало)', async () => {
    const { s, copy } = await scene()
    const copy2 = await mirror(copy, 'XZ')
    const child = `${copy2}:${copy}:${s}`
    expect(getNode(child)?.mirrored).toEqual(['YZ', 'XZ'])
    await st().editChildParams(copy2, child, { radius: 9 })
    expect(errors()).toEqual([])
    const edited = st().objects[copy2]

    reset()
    const fresh = await scene(9)
    const fresh2 = await mirror(fresh.copy, 'XZ')
    expectSameWorld(edited, st().objects[fresh2])
  })

  it('baked-ребёнок (старая вставка CSG без дерева) остаётся 🔒 baked; примитив рядом правится', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const root = await csg(c, s, 'union')
    // старый буфер обмена: CSG без снимка дерева → вставка запечённым мешем
    st().selectObjects([root], false)
    st().copySelected()
    useDocumentStore.setState({ clipboard: st().clipboard.map(e => ({ ...e, csgTree: undefined })) })
    await st().pasteClipboard()
    const pasted = st().selectedIds[0]
    expect(getNode(pasted)?.type).toBe('baked')
    const ball = await shape('sphere', { radius: 6, segments: 32 }, at(30, 0, 20))
    const u = await csg(pasted, ball, 'union')
    const copy = await mirror(u, 'YZ')

    const view = getTreeView(copy)!
    const bakedChild = view.children.find(ch => ch.id === `${copy}:${pasted}`)!
    expect(bakedChild.type).toBe('baked')
    expect(bakedChild.editable).toBe(false)
    expect(bakedChild.notEditableReason).toBe('baked')
    expect(isChildEditable(`${copy}:${pasted}`)).toEqual({ editable: false, reason: 'baked' })
    const ballChild = view.children.find(ch => ch.id === `${copy}:${ball}`)!
    expect(ballChild.editable).toBe(true)

    const before = st().objects[copy]
    await st().editChildParams(copy, `${copy}:${ball}`, { radius: 7 })
    expect(errors()).toEqual([])
    expect(st().objects[copy].vertices).not.toEqual(before.vertices)
  })

  it('undo/redo: копия исчезает/появляется; правка ребёнка копии переживает перемотку без снимков', async () => {
    const { s, copy } = await scene()
    const mirrorIdx = st().historyIndex
    await st().editChildParams(copy, `${copy}:${s}`, { radius: 9 })
    const edited = st().objects[copy]

    clearSnapshots() // WASM-путь: дерево и меш — по истории
    await st().undo() // правка
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(8)
    await st().undo() // зеркало
    expect(st().historyIndex).toBe(mirrorIdx - 1)
    expect(st().objects[copy]).toBeUndefined()
    await st().redo()
    expect(st().objects[copy]).toBeDefined()
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(8)
    await st().redo()
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(9)
    const o = st().objects[copy]
    expect(o.vertices.length).toBe(edited.vertices.length)
    for (let i = 0; i < o.vertices.length; i += 97) expect(o.vertices[i]).toBeCloseTo(edited.vertices[i], 4)

    // после перемотки копия по-прежнему правится
    await st().editChildParams(copy, `${copy}:${s}`, { radius: 10 })
    expect(errors()).toEqual([])
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(10)
  })

  it('правка шага зеркала (9.5.3) YZ → XZ: каскад пересчитывает правку ребёнка копии = свежее XZ', async () => {
    const { s, copy } = await scene()
    const mirrorStep = st().operations.findIndex(o => o.type === 'mirror')
    await st().editChildParams(copy, `${copy}:${s}`, { radius: 9 })
    expect(errors()).toEqual([])

    const ok = await st().editStepParams(mirrorStep, { kind: 'mirror', plane: 'XZ' })
    expect(ok).toBe(true)
    expect(errors()).toEqual([])
    expect(getNode(`${copy}:${s}`)?.mirrored).toEqual(['XZ'])
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(9)
    const edited = st().objects[copy]

    const fresh = await freshMirrored(9, 'XZ')
    expectSameWorld(edited, fresh)
  })

  it('.3dtc round-trip: дерево копии восстановлено, правка ребёнка после загрузки работает', async () => {
    const { s, copy } = await scene()
    await st().editChildParams(copy, `${copy}:${s}`, { radius: 9 })
    const edited = st().objects[copy]
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })

    reset()
    const parsed = await parse3dtc(blob)
    const ops = parsed.operations as TinkerCraftOperation[]
    const objects = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, objects)
    useDocumentStore.setState({ operations: ops, historyIndex: ops.length, objects })

    expect(getNode(copy)?.type).toBe('boolean')
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(9)
    expect(getNode(`${copy}:${s}`)?.mirrored).toEqual(['YZ'])
    for (let i = 0; i < edited.vertices.length; i += 97) expect(objects[copy].vertices[i]).toBeCloseTo(edited.vertices[i], 4)

    await st().editChildParams(copy, `${copy}:${s}`, { radius: 10 })
    expect(errors()).toEqual([])
    const after = st().objects[copy]
    const fresh = await freshMirrored(10)
    expectSameWorld(after, fresh)
  })
})

// Регресс давнего бага: дерево зеркального CSG жило только в сессии
// (MIRROR-TREE-PRESERVE), а после загрузки rebuildBuildTree ставил заглушку-куб.
describe('MIRROR-CSG-TREE-RELOAD: дерево зеркального CSG после загрузки', () => {
  it('после .3dtc — boolean-корень с детьми источника, а не заглушка-куб; дерево воспроизводит меш', async () => {
    const { c, s, copy } = await scene()
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })

    reset()
    const ops = (await parse3dtc(blob)).operations as TinkerCraftOperation[]
    const objects = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, objects) // чистое дерево — как после перезапуска приложения
    useDocumentStore.setState({ operations: ops, historyIndex: ops.length, objects })

    const node = getNode(copy)
    expect(node?.type).toBe('boolean')
    expect(node?.shapeType).toBeUndefined()
    expect(node?.children).toEqual([`${copy}:${c}`, `${copy}:${s}`])
    expect(getNode(`${copy}:${c}`)).toMatchObject({ type: 'primitive', shapeType: 'cube', mirrored: ['YZ'] })
    expect(await checkChildEditable({ rootId: copy, nodeId: `${copy}:${c}`, objects, operations: ops, historyIndex: ops.length })).toBeNull()
  })
})
