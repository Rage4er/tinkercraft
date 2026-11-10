// ============================================================
// independent-copy-paste.test.ts — CSG-INDEPENDENT-COPY: копировать/вставить CSG
// ============================================================
// Ctrl+C / Ctrl+V CSG-результата даёт НЕЗАВИСИМУЮ параметрическую копию: буфер
// хранит снимок дерева (ClipEntry.csgTree), операция вставки — его же (copyTree),
// дерево копии — свои узлы `${id}:${idИсточника}` с params. Правка копии не трогает
// оригинал и наоборот. Старый буфер без дерева — вставка мешем (baked), как раньше.
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
import { getTreeView } from '../csg/tree-view'
import { computeRSMatrix } from '../csg/worker-matrix'
import { meshVolume, checkChildEditable } from '../store/edit-child'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import { useNotifications } from '../store/notifications'
import type { SceneObject, TransformNR, MirrorOperation, GroupOperation, TinkerCraftOperation } from '../csg/types'

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

function expectSameWorld(a: SceneObject, b: SceneObject): void {
  const ba = bbox(worldVerts(a)), bb = bbox(worldVerts(b))
  for (let i = 0; i < 6; i++) expect(ba[i]).toBeCloseTo(bb[i], 2)
  const va = meshVolume(worldVerts(a), a.indices), vb = meshVolume(worldVerts(b), b.indices)
  expect(Math.abs(va - vb) / Math.max(va, vb)).toBeLessThan(1e-3)
}

function expectSameMesh(a: SceneObject, b: SceneObject): void {
  expect(a.transform).toEqual(b.transform)
  expect(Array.from(a.vertices)).toEqual(Array.from(b.vertices))
}

async function shape(type: 'cube' | 'sphere', params: Record<string, number>, t: TransformNR): Promise<string> {
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

async function copyPaste(id: string): Promise<string> {
  st().selectObjects([id], false)
  st().copySelected()
  await st().pasteClipboard()
  return st().selectedIds[0]
}

/** куб (A, повёрнут) ∪ сфера(r), корень повёрнут после объединения. */
async function base(radius = 8) {
  const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(10, 3, 0, { rotZ: 30 }))
  const s = await shape('sphere', { radius, segments: 32 }, at(24, 3))
  const root = await csg(c, s, 'union')
  await st().moveObject(root, { ...st().objects[root].transform, rotZ: 50 })
  return { c, s, root }
}

async function scene(radius = 8) {
  const b = await base(radius)
  const copy = await copyPaste(b.root)
  return { ...b, copy }
}

async function freshPasted(radius: number): Promise<SceneObject> {
  reset()
  const { copy } = await scene(radius)
  return st().objects[copy]
}

const errors = () => useNotifications.getState().notifications.filter(n => n.type === 'error' || n.type === 'warning')

describe('CSG-INDEPENDENT-COPY: вставка CSG → копия дерева', () => {
  it('буфер хранит снимок дерева; вставка — своё дерево с params, дети правятся', async () => {
    const { c, s, root } = await base()
    st().selectObjects([root], false)
    st().copySelected()
    const clip = st().clipboard[0]
    expect(clip.csgTree?.sourceRootId).toBe(root)
    expect(clip.csgTree?.nodes.map(n => n.id)).toEqual([root, c, s])
    expect(clip.csgTree?.origin).toMatchObject({ x: 10, y: 3, rotZ: 30 })

    await st().pasteClipboard()
    const copy = st().selectedIds[0]
    const op = st().operations[st().operations.length - 1] as GroupOperation
    expect(op.type).toBe('group')
    expect(op.ids).toEqual([])
    expect(op.copyTree?.sourceRootId).toBe(root)

    expect(getNode(copy)?.type).toBe('boolean')
    const view = getTreeView(copy)!
    expect(view.children.map(ch => ch.id)).toEqual([`${copy}:${c}`, `${copy}:${s}`])
    for (const ch of view.children) {
      expect(ch.editable).toBe(true)
      expect(await checkChildEditable({ rootId: copy, nodeId: ch.id, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex })).toBeNull()
    }
    expect(getNode(`${copy}:${c}`)?.parentId).toBe(copy)
    expect(getNode(c)?.parentId).toBe(root) // оригинал не тронут
  })

  it('правка C (радиус +1) → C пересчитана = свежая вставка; A не тронут', async () => {
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

    const fresh = await freshPasted(9)
    expectSameWorld(after, fresh)
  })

  it('правка A → C не тронута', async () => {
    const { s, root, copy } = await scene()
    const copyBefore = st().objects[copy]
    await st().editChildParams(root, s, { radius: 10 })
    expect(errors()).toEqual([])
    expectSameMesh(st().objects[copy], copyBefore)
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(8)
  })

  it('буфер — снимок на момент копирования: правка A после Ctrl+C не попадает во вставку', async () => {
    const { s, root } = await base()
    st().selectObjects([root], false)
    st().copySelected()
    await st().editChildParams(root, s, { radius: 10 })
    await st().pasteClipboard()
    const copy = st().selectedIds[0]
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(8)
    // и вставленная копия по-прежнему правится (дерево ↔ меш согласованы)
    await st().editChildParams(copy, `${copy}:${s}`, { radius: 9 })
    expect(errors()).toEqual([])
  })

  it('две вставки — две независимые копии', async () => {
    const { s, root } = await base()
    const p1 = await copyPaste(root)
    await st().pasteClipboard()
    const p2 = st().selectedIds[0]
    expect(p2).not.toBe(p1)
    const p2Before = st().objects[p2]
    await st().editChildParams(p1, `${p1}:${s}`, { radius: 9 })
    expect(errors()).toEqual([])
    expectSameMesh(st().objects[p2], p2Before)
  })

  it('вставка зеркальной копии — правка ребёнка работает', async () => {
    const { s, root } = await base()
    st().selectObjects([root], false)
    await st().mirrorSelected('YZ')
    const mirrored = (st().operations[st().operations.length - 1] as MirrorOperation).ids[0]
    const copy = await copyPaste(mirrored)
    const child = `${copy}:${mirrored}:${s}`
    expect(getNode(child)?.mirrored).toEqual(['YZ'])
    const before = st().objects[copy]
    await st().editChildParams(copy, child, { radius: 9 })
    expect(errors()).toEqual([])
    expect(st().objects[copy].vertices).not.toEqual(before.vertices)
  })

  it('старый буфер без дерева — вставка мешем (baked, как раньше)', async () => {
    const { root } = await base()
    st().selectObjects([root], false)
    st().copySelected()
    useDocumentStore.setState({ clipboard: st().clipboard.map(e => ({ ...e, csgTree: undefined })) })
    await st().pasteClipboard()
    const copy = st().selectedIds[0]
    expect(getNode(copy)?.type).toBe('baked')
    expect((st().operations[st().operations.length - 1] as GroupOperation).copyTree).toBeUndefined()
  })

  it('undo/redo: вставка исчезает/появляется; правка ребёнка переживает перемотку без снимков', async () => {
    const { s, copy } = await scene()
    const pasteIdx = st().historyIndex
    await st().editChildParams(copy, `${copy}:${s}`, { radius: 9 })
    const edited = st().objects[copy]

    clearSnapshots()
    await st().undo()
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(8)
    await st().undo()
    expect(st().historyIndex).toBe(pasteIdx - 1)
    expect(st().objects[copy]).toBeUndefined()
    await st().redo()
    expect(st().objects[copy]).toBeDefined()
    expect(getNode(copy)?.type).toBe('boolean')
    await st().redo()
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(9)
    expect(st().objects[copy].transform).toEqual(edited.transform)
    for (let i = 0; i < edited.vertices.length; i += 97) expect(st().objects[copy].vertices[i]).toBeCloseTo(edited.vertices[i], 4)

    await st().editChildParams(copy, `${copy}:${s}`, { radius: 10 })
    expect(errors()).toEqual([])
  })

  it('.3dtc round-trip: снимок дерева в операции сохранён, правка после загрузки работает', async () => {
    const { s, copy } = await scene()
    await st().editChildParams(copy, `${copy}:${s}`, { radius: 9 })
    const edited = st().objects[copy]
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })

    reset()
    const parsed = await parse3dtc(blob)
    const ops = parsed.operations as TinkerCraftOperation[]
    const paste = ops.find((o): o is GroupOperation => o.type === 'group' && o.resultId === copy)!
    expect(paste.copyTree?.nodes.length).toBe(3)
    const objects = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, objects)
    useDocumentStore.setState({ operations: ops, historyIndex: ops.length, objects })

    expect(objects[copy].transform).toEqual(edited.transform)
    expect(getNode(`${copy}:${s}`)?.params?.radius).toBe(9)
    await st().editChildParams(copy, `${copy}:${s}`, { radius: 10 })
    expect(errors()).toEqual([])
    const after = st().objects[copy]
    const fresh = await freshPasted(10)
    expectSameWorld(after, fresh)
  })
})

// Регресс давнего бага (до CSG-INDEPENDENT-COPY): операция вставки писала только
// resultCenter — повёрнутый/масштабированный вставленный CSG после перемотки и
// загрузки терял поворот и масштаб. Касается и новой вставки (с деревом), и старой (мешем).
describe('PASTE-CSG-RS: вставленный CSG сохраняет полный TRS после перемотки/загрузки', () => {
  const RS: Partial<TransformNR> = { rotX: 10, rotY: 20, rotZ: 50, scaleX: 1.5, scaleY: 1, scaleZ: 2 }

  for (const legacy of [false, true]) {
    it(legacy ? 'старая вставка мешем (без дерева)' : 'вставка с деревом', async () => {
      const { root } = await base()
      await st().moveObject(root, { ...st().objects[root].transform, ...RS })
      st().selectObjects([root], false)
      st().copySelected()
      if (legacy) useDocumentStore.setState({ clipboard: st().clipboard.map(e => ({ ...e, csgTree: undefined })) })
      await st().pasteClipboard()
      const copy = st().selectedIds[0]
      const live = st().objects[copy]
      expect(live.transform).toMatchObject(RS)
      expect(getNode(copy)?.type).toBe(legacy ? 'baked' : 'boolean')

      // перемотка без снимков: undo вставки → redo
      clearSnapshots()
      await st().undo()
      expect(st().objects[copy]).toBeUndefined()
      await st().redo()
      expect(st().objects[copy].transform).toEqual(live.transform)
      expectSameWorld(st().objects[copy], live)

      // загрузка .3dtc
      const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
      const ops = (await parse3dtc(blob)).operations as TinkerCraftOperation[]
      const objects = await rebuildFromHistory(ops)
      expect(objects[copy].transform).toEqual(live.transform)
      expectSameWorld(objects[copy], live)
    })
  }
})
