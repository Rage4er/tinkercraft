// ============================================================
// nested-moved-edit.test.ts — NESTED-MOVED-EDIT: правка ребёнка вложенного CSG,
// сдвинутого / повёрнутого / отмасштабированного ДО объединения
// ============================================================
// Реальный WASM (worker-bridge). Сценарий: куб A ∪ сфера B → G → трансформ G → G ∪ цилиндр C
// → H → правка B в дереве H. Эталон — «свежий» сценарий с новым параметром B с самого
// начала: мировой меш H обязан совпасть (габарит, объём, число треугольников).
// Поправка — Mat(TRS_cur)·Mat(TRS₀)⁻¹ в воркере для вложенного boolean (originTransform).

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
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, getNode, setNode, invalidateCache } from '../csg/history-tree'
import { computeRSMatrix } from '../csg/worker-matrix'
import { meshVolume, checkChildEditable, checkRootConsistency } from '../store/edit-child'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import type { SceneObject, ShapeParams, ShapeType, TransformNR, TinkerCraftOperation } from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })
const warnings = () => useNotifications.getState().notifications.filter((n) => n.type === 'warning' || n.type === 'error')

function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
}
beforeEach(reset)

/** world = pos + R·S·v */
function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
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
function box(v: Float32Array): number[] {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) }
  return [...mn, ...mx]
}
/** Площадь поверхности (не зависит от триангуляции, но ловит любое отличие формы). */
function meshArea(v: Float32Array, idx: Uint32Array): number {
  let s = 0
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    s += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2
  }
  return s
}
/**
 * Тот же мировой меш: габарит (1e-4), объём и площадь (1e-5 отн.). Число треугольников
 * не сравнивается: manifold триангулирует одну геометрию по-разному в зависимости от
 * пути вычисления (живой CSG из меша G vs дерево) — у вычитания 702 vs 714 при равных
 * объёме, площади и габарите.
 */
function expectSameWorld(a: SceneObject, b: SceneObject): void {
  const wa = worldVerts(a), wb = worldVerts(b)
  const ba = box(wa), bb = box(wb)
  for (let i = 0; i < 6; i++) expect(Math.abs(ba[i] - bb[i])).toBeLessThan(1e-4)
  const va = meshVolume(wa, a.indices), vb = meshVolume(wb, b.indices)
  expect(Math.abs(va - vb) / vb).toBeLessThan(1e-5)
  const sa = meshArea(wa, a.indices), sb = meshArea(wb, b.indices)
  expect(Math.abs(sa - sb) / sb).toBeLessThan(1e-5)
}

async function shape(type: ShapeType, params: ShapeParams, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape(type, params)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}
async function csg(a: string, b: string, op: 'union' | 'subtract' = 'union'): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean(op)
  return st().selectedIds[0]
}
const args = (rootId: string, nodeId: string) => ({
  rootId, nodeId, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
})

/** A ∪ B → G → трансформ G (поверх текущего) → G ∪ C (или C − G) → H */
async function scene(radiusB: number, move: Partial<TransformNR>, opts: { outerOp?: 'union' | 'subtract'; gSecond?: boolean; aT?: TransformNR } = {}) {
  const a = await shape('cube', { width: 20, height: 20, depth: 20 }, opts.aT ?? at(0))
  const b = await shape('sphere', { radius: radiusB, segments: 32 }, at(14))
  const g = await csg(a, b)
  await st().moveObject(g, { ...st().objects[g].transform, ...move })
  const c = await shape('cylinder', { radius: 6, height: 24, segments: 32 }, at(52, 0, 4))
  const h = opts.gSecond ? await csg(c, g, opts.outerOp) : await csg(g, c, opts.outerOp)
  return { a, b, g, c, h }
}

/** Правка радиуса B в дереве H = свежий сценарий с этим радиусом. */
async function editEqualsFresh(move: Partial<TransformNR>, opts: { outerOp?: 'union' | 'subtract'; gSecond?: boolean; aT?: TransformNR } = {}) {
  const f = await scene(11, move, opts)
  const fresh = st().objects[f.h]
  reset()
  const s = await scene(8, move, opts)
  expect(await checkChildEditable(args(s.h, s.b))).toBeNull()                  // калибровка 9.3 проходит
  const n = st().operations.length
  await st().editChildParams(s.h, s.b, { radius: 11 })
  expect(warnings()).toEqual([])
  expect(st().operations).toHaveLength(n + 1)
  expect(st().operations[n].type).toBe('edit_child_params')
  expectSameWorld(st().objects[s.h], fresh)
  expect(st().objects[s.h].transform).toEqual(fresh.transform)                 // pivot корня не меняется
  return s
}

describe('NESTED-MOVED-EDIT — правка ребёнка вложенного CSG после трансформа до объединения', () => {
  it('сдвиг G → ∪ C → правка радиуса B = свежий сценарий; без отказа', async () => {
    await editEqualsFresh({ x: 30, z: 10 })
  })

  it('поворот G (rotZ 35, rotX 20) + сдвиг → правка = свежий сценарий', async () => {
    await editEqualsFresh({ x: 30, rotZ: 35, rotX: 20 })
  })

  it('неравномерный масштаб G (1.5 × 0.7) + поворот + сдвиг → правка = свежий сценарий', async () => {
    await editEqualsFresh({ x: 28, y: 3, scaleX: 1.5, scaleZ: 0.7, rotY: 25 })
  })

  it('TRS₀ не тождественный (A сдвинут и повёрнут) + поворот и масштаб G → правка = свежий сценарий', async () => {
    await editEqualsFresh({ x: 34, y: -4, rotX: -15, rotZ: 40, scaleY: 1.4 }, { aT: at(4, 3, -2, { rotZ: 15, rotX: 10, scaleX: 1.2 }) })
  })

  it('G — второй операнд (C ∪ G) и вычитание (C − G): правка = свежий сценарий', async () => {
    await editEqualsFresh({ x: 40, y: 2, rotZ: 15 }, { gSecond: true })
    reset()
    await editEqualsFresh({ x: 45, z: 2 }, { gSecond: true, outerOp: 'subtract' })
  })

  it('правка куба A (другой ребёнок G) тоже проходит', async () => {
    const s = await scene(8, { x: 30, rotZ: 20 })
    await st().editChildParams(s.h, s.a, { width: 26 })
    expect(warnings()).toEqual([])
    expect(st().operations.at(-1)!.type).toBe('edit_child_params')
    expect(getNode(s.a)?.params?.width).toBe(26)
  })

  it('два уровня: G сдвинут → G ∪ D = K → K повёрнут → K ∪ E = H → правка листа G = свежий сценарий', async () => {
    const build = async (r: number) => {
      const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
      const b = await shape('sphere', { radius: r, segments: 32 }, at(14))
      const g = await csg(a, b)
      await st().moveObject(g, { ...st().objects[g].transform, x: 20, z: 6 })
      const d = await shape('cube', { width: 8, height: 30, depth: 8 }, at(36))
      const k = await csg(g, d)
      await st().moveObject(k, { ...st().objects[k].transform, y: 15, rotZ: 30, scaleX: 1.2 })
      const e = await shape('sphere', { radius: 7, segments: 24 }, at(10, 40))
      return { b, h: await csg(k, e) }
    }
    const fb = await build(11)
    const fresh = st().objects[fb.h]
    reset()
    const s = await build(8)
    expect(await checkChildEditable(args(s.h, s.b))).toBeNull()
    await st().editChildParams(s.h, s.b, { radius: 11 })
    expect(warnings()).toEqual([])
    expectSameWorld(st().objects[s.h], fresh)
  })

  it('обычный CSG (без трансформа до объединения): поправка — identity, правка как раньше', async () => {
    await editEqualsFresh({})
  })
})

describe('NESTED-MOVED-EDIT — история, загрузка, копии', () => {
  it('undo/redo правки: со снимками и без (перестройка дерева из истории), калибровка после', async () => {
    const s = await scene(8, { x: 30, rotZ: 35, scaleX: 1.3 })
    const before = st().objects[s.h]
    await st().editChildParams(s.h, s.b, { radius: 11 })
    const edited = st().objects[s.h]
    await st().undo()
    expectSameWorld(st().objects[s.h], before)
    expect(getNode(s.b)?.params?.radius).toBe(8)
    await st().redo()
    expectSameWorld(st().objects[s.h], edited)
    clearSnapshots()                                     // без снимков — дерево по истории
    await st().undo()
    expectSameWorld(st().objects[s.h], before)
    expect(await checkChildEditable(args(s.h, s.b))).toBeNull()
    await st().redo()
    expectSameWorld(st().objects[s.h], edited)
    expect(await checkChildEditable(args(s.h, s.b))).toBeNull()
  })

  it('.3dtc round-trip: после загрузки (чистое дерево) ребёнок правится, правка сохранена', async () => {
    const s = await scene(8, { x: 30, z: 10, rotY: 20 })
    await st().editChildParams(s.h, s.b, { radius: 11 })
    const edited = st().objects[s.h]
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    reset()
    const ops = (await parse3dtc(blob)).operations as TinkerCraftOperation[]
    const objects = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, objects)
    useDocumentStore.setState({ operations: ops, historyIndex: ops.length, objects })
    expectSameWorld(objects[s.h], edited)
    expect(getNode(s.b)?.params?.radius).toBe(11)
    expect(getNode(s.g)?.originTransform).toBeDefined()
    expect(await checkRootConsistency({ rootId: s.h, objects, operations: ops, historyIndex: ops.length })).toBeNull()
    await st().editChildParams(s.h, s.b, { radius: 9 })
    expect(warnings()).toEqual([])
    expect(st().operations).toHaveLength(ops.length + 1)
  })

  it('ALIGN-TREE-REPLAY: G выровнен до объединения → после перестройки дерева из истории ребёнок правится', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const b = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const g = await csg(a, b)
    const anchor = await shape('cube', { width: 6, height: 6, depth: 6 }, at(60, 0, 30))
    st().selectObjects([g, anchor], false)
    await st().alignSelected('Z', 'max')                 // сдвиг G шагом align, не move
    const c = await shape('cylinder', { radius: 6, height: 24, segments: 32 }, at(20, 0, 30))
    const h = await csg(g, c)
    expect(await checkChildEditable(args(h, b))).toBeNull()     // живой путь
    clearTree()
    rebuildBuildTree(st().operations, st().objects)             // как после загрузки
    expect(await checkChildEditable(args(h, b))).toBeNull()
  })

  it('зеркальная копия H и вставленная копия H: ребёнок вложенного (сдвинутого) CSG правится', async () => {
    // TRS₀ узла G (= трансформ A) не тождественный: иначе он коммутирует с отражением
    // и ошибка в отражении TRS₀ копии была бы незаметна
    const s = await scene(8, { x: 30, rotZ: 25 }, { aT: at(4, 3, -2, { rotZ: 15, rotX: 10 }) })
    const before = new Set(Object.keys(st().objects))
    st().selectObjects([s.h], false)
    await st().mirrorSelected('YZ')
    const mir = Object.keys(st().objects).find((k) => !before.has(k))!
    expect(await checkRootConsistency({ rootId: mir, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex })).toBeNull()
    await st().editChildParams(mir, `${mir}:${s.b}`, { radius: 10 })
    expect(warnings()).toEqual([])

    const before2 = new Set(Object.keys(st().objects))
    st().selectObjects([s.h], false)
    st().copySelected()
    await st().pasteClipboard()
    const pasted = Object.keys(st().objects).find((k) => !before2.has(k))!
    expect(await checkRootConsistency({ rootId: pasted, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex })).toBeNull()
    await st().editChildParams(pasted, `${pasted}:${s.b}`, { radius: 10 })
    expect(warnings()).toEqual([])
  })

  it('предохранитель остаётся: дерево без TRS₀ (старое) не воспроизводит меш → tree_mismatch, правка отклонена', async () => {
    const s = await scene(8, { x: 30, z: 10 })
    const g = getNode(s.g)!
    const { originTransform: _drop, ...legacy } = g
    void _drop
    setNode(s.g, legacy)
    invalidateCache(s.g)
    expect(await checkChildEditable(args(s.h, s.b))).toBe('tree_mismatch')
    const n = st().operations.length
    await st().editChildParams(s.h, s.b, { radius: 11 })
    expect(st().operations).toHaveLength(n)
  })
})
