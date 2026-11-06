// ============================================================
// edit-step-move.test.ts — Фаза 9.5.2: правка шага move с каскадом CSG и align
// ============================================================
// Эталон — «свежий» сценарий, сразу выполненный с новой дельтой. Реальный WASM.

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
import { meshVolume, checkRootConsistency } from '../store/edit-child'
import { rebuildFromHistory } from '../store/rebuild'
import { worldVerticesAABB } from '../store/helpers'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { useNotifications } from '../store/notifications'
import { computeRSMatrix } from '../csg/worker-matrix'
import type {
  SceneObject, TransformNR, ShapeParams, ShapeType, EditStepOperation, MoveOperation, StepPatch, Vec3,
} from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })

function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
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
const volume = (o: SceneObject) => meshVolume(worldVerts(o), o.indices)
const worldBox = (o: SceneObject) => worldVerticesAABB(o.vertices, o.transform)
const maxDiff = (a: TransformNR, b: TransformNR) =>
  Math.max(...(Object.keys(a) as Array<keyof TransformNR>).map((k) => Math.abs(a[k] - b[k])))

/** Тот же меш, что у «свежего» сценария: pivot (diff < 1e-6) и вершины (diff < 1e-6). */
function expectSameMesh(a: SceneObject, b: SceneObject): void {
  expect(maxDiff(a.transform, b.transform)).toBeLessThan(1e-6)
  expect(a.vertices.length).toBe(b.vertices.length)
  let d = 0
  for (let i = 0; i < a.vertices.length; i++) d = Math.max(d, Math.abs(a.vertices[i] - b.vertices[i]))
  expect(d).toBeLessThan(1e-6)
  expect(Array.from(a.indices)).toEqual(Array.from(b.indices))
}
const warnings = () => useNotifications.getState().notifications.filter((n) => n.type === 'warning' || n.type === 'error')

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
/** Индекс первого шага move объекта `id` (тот, что ставит его на место после создания). */
const moveIdxOf = (id: string) =>
  st().operations.findIndex((o) => o.type === 'move' && o.ids.length === 1 && o.ids[0] === id)
/** Патч: дельта шага + `dx` (и, если заданы, новые rot/scale-дельты). */
function shifted(idx: number, d: Partial<Vec3>, rot?: Vec3): StepPatch {
  const m = st().operations[idx] as MoveOperation
  return {
    kind: 'move',
    delta: { x: m.delta.x + (d.x ?? 0), y: m.delta.y + (d.y ?? 0), z: m.delta.z + (d.z ?? 0) },
    ...(rot ?? m.rotDelta ? { rotDelta: { ...(rot ?? m.rotDelta)! } } : {}),
    ...(m.scaleDelta ? { scaleDelta: { ...m.scaleDelta } } : {}),
  }
}
const lastEdit = () => st().operations[st().operations.length - 1] as EditStepOperation

const CUBE = { width: 10, height: 10, depth: 10 }
const SPHERE = { radius: 6, segments: 32 }

/** куб A (повёрнут) в ax → ∪ сфера B */
async function scene(ax: number, rotY = 20) {
  const a = await shape('cube', CUBE, at(ax, 0, 0, { rotY }))
  const b = await shape('sphere', SPHERE, at(7, 0, 0))
  const root = await csg(a, b)
  return { a, b, root }
}

describe('9.5.2 — editStepParams (move)', () => {
  it('A сдвинут → ∪ B → правка ΔX: CSG = свежий сценарий, без уведомлений', async () => {
    const f = await scene(3)
    const fresh = st().objects[f.root]
    reset()
    const s = await scene(0)
    const orig = st().objects[s.root]
    expect(Math.abs(volume(orig) - volume(fresh)) / volume(orig)).toBeGreaterThan(1e-3)

    const idx = moveIdxOf(s.a)
    const n = st().operations.length
    expect(await st().editStepParams(idx, shifted(idx, { x: 3 }))).toBe(true)
    expect(warnings()).toHaveLength(0)
    expect(st().operations).toHaveLength(n + 1)
    const e = lastEdit()
    expect(e.type).toBe('edit_step')
    expect(e.stepFingerprint).toEqual({ type: 'move', targetId: s.a })
    expect(e.before).toMatchObject({ kind: 'move', delta: (st().operations[idx] as MoveOperation).delta })
    expect(e.replacements.map((r) => r.kind)).toEqual(['group'])
    // сырой шаг move не тронут (append-only)
    expect((st().operations[idx] as MoveOperation).delta).toEqual((e.before as { delta: Vec3 }).delta)

    expectSameMesh(st().objects[s.root], fresh)
    expect(await checkRootConsistency({
      rootId: s.root, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
    })).toBeNull()
  })

  it('R8: pivot CSG (resultCenter/Rotation/Scale) = TRS операнда A свежего сценария', async () => {
    const f = await scene(-2, 35)
    const fresh = st().objects[f.root]
    reset()
    const s = await scene(4, 20)
    const idx = moveIdxOf(s.a)
    expect(await st().editStepParams(idx, shifted(idx, { x: -6 }, { x: 0, y: 35, z: 0 }))).toBe(true)
    const r = lastEdit().replacements[0]
    expect(r.resultCenter!.x).toBeCloseTo(-2, 6)
    expect(r.resultRotation).toEqual({ x: 0, y: 35, z: 0 })
    expect(r.resultScale).toEqual({ x: 1, y: 1, z: 1 })
    const edited = st().objects[s.root]
    expect(maxDiff(edited.transform, fresh.transform)).toBeLessThan(1e-6)
    expect(maxDiff(edited.transform, at(-2, 0, 0, { rotY: 35 }))).toBeLessThan(1e-6)
    expectSameMesh(edited, fresh)
  })

  it('align (re-solve, В2): якорь — CSG; после правки move A цель остаётся выровненной', async () => {
    const withAlign = async (ax: number) => {
      const s = await scene(ax, 0)
      const c = await shape('cube', { width: 4, height: 4, depth: 4 }, at(30, 0, 0))
      st().selectObjects([c, s.root], false)            // якорь — последний выбранный (CSG)
      await st().alignSelected('X', 'min')
      return { ...s, c }
    }
    const f = await withAlign(4)
    const freshC = st().objects[f.c]
    // живой align с CSG: рамка цели = мировая рамка CSG (ALIGN-CSG-AABB)
    expect(worldBox(freshC).min.x).toBeCloseTo(worldBox(st().objects[f.root]).min.x, 5)
    reset()
    const s = await withAlign(1)
    const alignIdx = st().operations.findIndex((o) => o.type === 'align')
    const oldDelta = (st().operations[alignIdx] as { deltas: Record<string, number> }).deltas[s.c]

    const idx = moveIdxOf(s.a)
    expect(await st().editStepParams(idx, shifted(idx, { x: 3 }))).toBe(true)
    expect(warnings()).toHaveLength(0)
    const e = lastEdit()
    expect(e.replacements.map((r) => r.kind)).toEqual(['group', 'align'])
    const newDelta = e.replacements[1].deltas![s.c]
    expect(newDelta - oldDelta).toBeCloseTo(3, 5)          // literal-дельта сломала бы выравнивание на 3
    const root = st().objects[s.root], c = st().objects[s.c]
    expect(worldBox(c).min.x).toBeCloseTo(worldBox(root).min.x, 5)
    expect(maxDiff(c.transform, freshC.transform)).toBeLessThan(1e-5)
  })

  it('align: якорь не в S, цель — CSG из S → re-solve только цели, прочие deltas прежние', async () => {
    const build = async (ax: number) => {
      const s = await scene(ax, 0)
      const c = await shape('cube', { width: 4, height: 4, depth: 4 }, at(30, 10, 0))
      const d = await shape('cube', { width: 2, height: 2, depth: 2 }, at(-30, 20, 0))
      const anchor = await shape('cube', { width: 6, height: 6, depth: 6 }, at(50, 0, 0))
      st().selectObjects([s.root, c, d, anchor], false)
      await st().alignSelected('X', 'min')
      return { ...s, c, d, anchor }
    }
    const s = await build(1)
    const alignIdx = st().operations.findIndex((o) => o.type === 'align')
    const old = { ...(st().operations[alignIdx] as { deltas: Record<string, number> }).deltas }
    const idx = moveIdxOf(s.a)
    // min.x объединения задаёт куб A (сфера — от x = 1): сдвиг A на −5 сдвигает рамку CSG
    expect(await st().editStepParams(idx, shifted(idx, { x: -5 }))).toBe(true)
    const deltas = lastEdit().replacements.find((r) => r.kind === 'align')!.deltas!
    expect(deltas[s.c]).toBe(old[s.c])
    expect(deltas[s.d]).toBe(old[s.d])
    expect(deltas[s.root] - old[s.root]).toBeCloseTo(5, 5)
    const anchorMin = worldBox(st().objects[s.anchor]).min.x
    expect(worldBox(st().objects[s.root]).min.x).toBeCloseTo(anchorMin, 5)
    expect(worldBox(st().objects[s.c]).min.x).toBeCloseTo(anchorMin, 5)
  })

  it('undo → исходный move (снимок и пересборка), redo → правленый', async () => {
    const f = await scene(3)
    const fresh = st().objects[f.root]
    reset()
    const s = await scene(0)
    const orig = st().objects[s.root]
    const idx = moveIdxOf(s.a)
    await st().editStepParams(idx, shifted(idx, { x: 3 }))

    await st().undo()
    expect(Array.from(st().objects[s.root].vertices)).toEqual(Array.from(orig.vertices))
    expect(st().objects[s.root].transform).toEqual(orig.transform)
    await st().redo()
    expectSameMesh(st().objects[s.root], fresh)

    clearSnapshots()
    await st().undo()
    expect(Array.from(st().objects[s.root].vertices)).toEqual(Array.from(orig.vertices))
    clearSnapshots()
    await st().redo()
    expectSameMesh(st().objects[s.root], fresh)
  })

  it('K>1: (A ∪ B) ∪ C — оба CSG пересчитаны; повторная правка шага — от эффективного значения', async () => {
    const chain = async (ax: number) => {
      const s = await scene(ax)
      const c = await shape('cylinder', { radius: 3, height: 20, segments: 32 }, at(-4, 0, 0))
      return { ...s, top: await csg(s.root, c) }
    }
    const f = await chain(5)
    const fresh = st().objects[f.top]
    reset()
    const s = await chain(0)
    const idx = moveIdxOf(s.a)
    await st().editStepParams(idx, shifted(idx, { x: 2 }))
    expect(lastEdit().replacements.map((r) => r.kind)).toEqual(['group', 'group'])
    // вторая правка того же шага: before = значение после первой
    const m = st().operations[idx] as MoveOperation
    const p2: StepPatch = { kind: 'move', delta: { ...m.delta, x: m.delta.x + 5 }, rotDelta: m.rotDelta }
    expect(await st().editStepParams(idx, p2)).toBe(true)
    expect((lastEdit().before as { delta: Vec3 }).delta.x).toBe(m.delta.x + 2)
    expectSameMesh(st().objects[s.top], fresh)
  })

  it('mirror ниже по течению: копия A сдвигается, CSG с копией пересчитан', async () => {
    const build = async (ax: number) => {
      const a = await shape('cube', CUBE, at(ax, 0, 0))
      st().selectObjects([a], false)
      await st().mirrorSelected('YZ')
      const copy = st().selectedIds[0]
      const b = await shape('sphere', SPHERE, at(-6, 0, 0))
      return { a, copy, root: await csg(copy, b) }
    }
    const f = await build(4)
    const fresh = st().objects[f.root]
    reset()
    const s = await build(1)
    const idx = moveIdxOf(s.a)
    expect(await st().editStepParams(idx, shifted(idx, { x: 3 }))).toBe(true)
    expect(lastEdit().replacements.map((r) => r.kind)).toEqual(['group'])
    expect(volume(st().objects[s.root])).toBeCloseTo(volume(fresh), 3)
    expect(maxDiff(st().objects[s.root].transform, fresh.transform)).toBeLessThan(1e-6)
  })

  it('edit_child_params ниже по течению пересчитан и проходит калибровку 9.9', async () => {
    const withChild = async (ax: number) => {
      const s = await scene(ax)
      await st().editChildParams(s.root, s.b, { radius: 8 })
      return s
    }
    const f = await withChild(3)
    const fresh = st().objects[f.root]
    reset()
    const s = await withChild(0)
    const idx = moveIdxOf(s.a)
    expect(await st().editStepParams(idx, shifted(idx, { x: 3 }))).toBe(true)
    expect(lastEdit().replacements.map((r) => r.kind)).toEqual(['group', 'edit_child_params'])
    expect(getNode(s.b)?.params?.radius).toBe(8)
    const edited = st().objects[s.root]
    expect(maxDiff(edited.transform, fresh.transform)).toBeLessThan(1e-6)
    expect(Math.abs(volume(edited) - volume(fresh)) / volume(fresh)).toBeLessThan(1e-5)
    expect(await checkRootConsistency({
      rootId: s.root, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
    })).toBeNull()
  })

  it('extrude (legacy-конвенция group) пересчитывается в своей конвенции', async () => {
    const ext = async (ax: number) => {
      const cube = await shape('cube', CUBE, at(ax, 0, 0, { rotY: 30 }))
      st().selectObjects([cube], false)
      await st().extrudeSelected('Z', 6)
      return { cube, id: st().selectedIds[0] }
    }
    const f = await ext(6)
    const fresh = st().objects[f.id]
    reset()
    const s = await ext(3)
    const idx = moveIdxOf(s.cube)
    expect(await st().editStepParams(idx, shifted(idx, { x: 3 }))).toBe(true)
    const edited = st().objects[s.id]
    expect(edited.transform).toMatchObject({ rotY: 0, scaleX: 1 })
    expect(maxDiff(edited.transform, fresh.transform)).toBeLessThan(1e-6)
    expect(Math.abs(volume(edited) - volume(fresh)) / volume(fresh)).toBeLessThan(1e-5)
    expect(lastEdit().replacements[0]).not.toHaveProperty('resultRotation')
  })

  it('отказ: правка, обнуляющая subtract ниже — история и объекты не изменились, уведомление с шагом', async () => {
    const b = await shape('sphere', { radius: 3, segments: 16 }, at(20, 0, 0))
    const a = await shape('cube', { width: 12, height: 12, depth: 12 }, at(0, 0, 0))
    const root = await csg(b, a, 'subtract')                 // B − A: сфера целиком
    const ops = st().operations, objects = st().objects
    const groupIdx = ops.findIndex((o) => o.type === 'group')
    const idx = moveIdxOf(a)
    expect(await st().editStepParams(idx, shifted(idx, { x: 20 }))).toBe(false)   // A накрыл B → пусто
    expect(st().operations).toBe(ops)
    expect(st().historyIndex).toBe(ops.length)
    expect(st().objects).toBe(objects)
    expect(st().busy).toBe(false)
    const w = warnings()
    expect(w).toHaveLength(1)
    expect(w[0].message).toContain(String(groupIdx + 1))
    // после отказа сцена рабочая: следующая операция видит прежнее состояние
    await st().jumpToHistory(ops.length - 1)
    await st().jumpToHistory(ops.length)
    expect(Array.from(st().objects[root].vertices)).toEqual(Array.from(objects[root].vertices))
  })

  it('живой объект без CSG: замен нет, положение — с новой дельтой', async () => {
    const a = await shape('cube', CUBE, at(5))
    const idx = moveIdxOf(a)
    expect(await st().editStepParams(idx, shifted(idx, { x: 2, z: -1 }))).toBe(true)
    expect(lastEdit().replacements).toEqual([])
    expect(st().objects[a].transform).toMatchObject({ x: 7, z: -1 })
  })

  it('отказы без изменения истории: то же значение (молча), NaN, неподдержанный вид, не тот шаг', async () => {
    const s = await scene(0)
    const ops = st().operations
    const idx = moveIdxOf(s.a)
    const m = ops[idx] as MoveOperation
    expect(await st().editStepParams(idx, { kind: 'move', delta: { ...m.delta }, rotDelta: m.rotDelta })).toBe(false)
    expect(warnings()).toHaveLength(0)                       // «не изменилось» — без уведомления
    expect(await st().editStepParams(idx, { kind: 'move', delta: { x: NaN, y: 0, z: 0 } })).toBe(false)
    expect(await st().editStepParams(idx, { kind: 'mirror', plane: 'XZ' })).toBe(false)
    expect(await st().editStepParams(0, { kind: 'move', delta: { x: 1, y: 0, z: 0 } })).toBe(false)  // add_shape
    expect(st().operations).toBe(ops)
    expect(st().busy).toBe(false)
  })

  it('.3dtc round-trip: правленая сцена воспроизводится из файла', async () => {
    const s = await scene(0)
    const idx = moveIdxOf(s.a)
    await st().editStepParams(idx, shifted(idx, { x: 3 }))
    const edited = st().objects[s.root]
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    const parsed = await parse3dtc(blob)
    const last = parsed.operations[parsed.operations.length - 1]
    expect(last.type).toBe('edit_step')
    if (last.type === 'edit_step') expect(last.patch.kind).toBe('move')
    const objs = await rebuildFromHistory(parsed.operations)
    expectSameMesh(objs[s.root], edited)
  })

  it('производительность: 10 CSG после шага — каскад < 3 с', async () => {
    const a = await shape('cube', CUBE, at(1))
    let root = a
    for (let i = 0; i < 10; i++) {
      const sp = await shape('sphere', { radius: 3, segments: 16 }, at(5 + i * 2, 0, 0))
      root = await csg(root, sp)
    }
    const idx = moveIdxOf(a)
    const t0 = performance.now()
    expect(await st().editStepParams(idx, shifted(idx, { y: 2 }))).toBe(true)
    const ms = performance.now() - t0
    console.log(`[9.5.2] каскад 10 CSG: ${ms.toFixed(0)} мс`)
    expect(lastEdit().replacements).toHaveLength(10)
    expect(ms).toBeLessThan(3000)
  })
})
