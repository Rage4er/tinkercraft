// ============================================================
// edit-step-extrude.test.ts — Фаза 9.5.4: правка глубины шага extrude с каскадом
// ============================================================
// Эталон — «свежий» сценарий, сразу выполненный с новой глубиной. Реальный WASM.

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
import { projectHistory } from '../store/project-history'
import { isStepEditable } from '../store/edit-step'
import { useNotifications } from '../store/notifications'
import { computeRSMatrix } from '../csg/worker-matrix'
import type {
  SceneObject, TransformNR, ShapeParams, ShapeType, EditStepOperation, GroupOperation, AddShapeOperation, StepPatch, Vec3,
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

/**
 * Тот же меш, что у «свежего» сценария: pivot (diff < 1e-6), вершины (diff < 1e-5):
 * плита строится по рамке базы — у живого extrude по живым вершинам, у каскада по
 * воспроизведённым (COM-центрированным, float32) — расхождение в последних битах.
 */
function expectSameMesh(a: SceneObject, b: SceneObject): void {
  expect(maxDiff(a.transform, b.transform)).toBeLessThan(1e-6)
  expect(a.vertices.length).toBe(b.vertices.length)
  let d = 0
  for (let i = 0; i < a.vertices.length; i++) d = Math.max(d, Math.abs(a.vertices[i] - b.vertices[i]))
  expect(d).toBeLessThan(1e-5)
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
const lastEdit = () => st().operations[st().operations.length - 1] as EditStepOperation

const E = (depth: number): StepPatch => ({ kind: 'extrude', depth })
const groupIdx = () => st().operations.findIndex((o) => o.type === 'group' && !!o.source)
/** Эффективная плита extrude (по проекции истории). */
const slabOf = (g: GroupOperation) =>
  projectHistory(st().operations.slice(0, st().historyIndex)).find((o) => o.type === 'add_shape' && o.id === g.source!.slabId) as AddShapeOperation

/** Выдавить выделенный `id`; возвращает id результата. */
async function extrude(id: string, axis: 'X' | 'Y' | 'Z', depth: number): Promise<string> {
  st().selectObjects([id], false)
  await st().extrudeSelected(axis, depth)
  return st().selectedIds[0]
}

/** второй объект (spawn x = 25, без сдвига) — куб A → extrude Z depth → ∪ сфера C */
async function scene(depth: number) {
  await shape('sphere', { radius: 4, segments: 16 }, at(-40, 0, 0))   // первый объект — чтобы A появился в x = 25
  const before = new Set(Object.keys(st().objects))
  await st().addShape('cube', { width: 10, height: 10, depth: 10 })
  const a = Object.keys(st().objects).find((k) => !before.has(k))!
  const ext = await extrude(a, 'Z', depth)
  const c = await shape('sphere', { radius: 6, segments: 32 }, at(25, 0, 8))
  return { a, ext, c, root: await csg(ext, c) }
}

describe('9.5.4 — extrudeSelected пишет source; EXTRUDE-AABB', () => {
  it('source { extrude, baseId, slabId, axis, depth }; плита у реальной грани объекта, не у начала координат', async () => {
    const s = await scene(5)
    const g = st().operations[groupIdx()] as GroupOperation
    expect(g.source).toEqual({ kind: 'extrude', baseId: s.a, slabId: expect.any(String), axis: 'Z', depth: 5 })
    const slab = st().operations.find((o) => o.type === 'add_shape' && o.id === g.source!.slabId) as AddShapeOperation
    expect(slab.transform).toMatchObject({ x: 25, y: 0, z: 7.5 })               // A в x = 25, грань z = 5
    expect(slab.params).toEqual({ width: 10, height: 10, depth: 5 })
    reset()
    const t = await scene(5)
    const ext = (await rebuildFromHistory(st().operations.slice(0, groupIdx() + 1)))[t.ext]
    const b = worldBox(ext)
    expect(b.min.x).toBeCloseTo(20, 4); expect(b.max.x).toBeCloseTo(30, 4)       // раньше: [−5, 30]
    expect(b.max.z).toBeCloseTo(10, 4)
    expect(isStepEditable(st().operations[groupIdx()])).toBe(true)
  })
})

describe('9.5.4 — editStepParams (extrude)', () => {
  it('A → extrude 5 → ∪ C → правка на 10: CSG = свежий сценарий, плита выше, без уведомлений', async () => {
    const f = await scene(10)
    const fresh = st().objects[f.root]
    reset()
    const s = await scene(5)
    const orig = st().objects[s.root]
    expect(Math.abs(volume(orig) - volume(fresh)) / volume(orig)).toBeGreaterThan(1e-2)

    const idx = groupIdx()
    const g = st().operations[idx] as GroupOperation
    const n = st().operations.length
    expect(await st().editStepParams(idx, E(10))).toBe(true)
    expect(warnings()).toHaveLength(0)
    expect(st().operations).toHaveLength(n + 1)
    const e = lastEdit()
    expect(e.stepFingerprint).toEqual({ type: 'group', targetId: g.source!.slabId })
    expect(e.patch).toEqual(E(10))
    expect(e.before).toEqual(E(5))
    // плита (add_shape, до группы) + сама группа extrude + union с C
    expect(e.replacements.map((r) => r.kind)).toEqual(['add_shape', 'group', 'group'])
    expect((st().operations[idx] as GroupOperation).source!.depth).toBe(5)        // сырой шаг не тронут

    // плита выше: толщина 10, центр на 5 выше грани
    const slab = slabOf(g)
    expect(slab.params).toMatchObject({ width: 10, height: 10, depth: 10 })
    expect(slab.transform.z).toBeCloseTo(10, 5)
    expect(slab.transform.x).toBeCloseTo(25, 5)
    expectSameMesh(st().objects[s.root], fresh)
    expect(worldBox(st().objects[s.root]).max.z).toBeCloseTo(worldBox(fresh).max.z, 4)
  })

  it('смена стороны: глубина 5 → −4 выдавливает от грани min (как свежий extrude −4)', async () => {
    const f = await scene(-4)
    const fresh = st().objects[f.root]
    reset()
    const s = await scene(5)
    expect(await st().editStepParams(groupIdx(), E(-4))).toBe(true)
    expectSameMesh(st().objects[s.root], fresh)
    expect(worldBox(st().objects[s.root]).min.z).toBeCloseTo(-9, 4)
  })

  it('align (re-solve) после extrude: цель остаётся выровненной по новой рамке', async () => {
    const build = async (depth: number) => {
      const s = await scene(depth)
      const k = await shape('cube', { width: 4, height: 4, depth: 4 }, at(60, 0, 0))
      st().selectObjects([k, s.root], false)                       // якорь — CSG
      await st().alignSelected('Z', 'max')
      return { ...s, k }
    }
    const f = await build(10)
    const freshK = st().objects[f.k]
    reset()
    const s = await build(5)
    expect(await st().editStepParams(groupIdx(), E(10))).toBe(true)
    expect(lastEdit().replacements.map((r) => r.kind)).toEqual(['add_shape', 'group', 'group', 'align'])
    const k = st().objects[s.k]
    expect(worldBox(k).max.z).toBeCloseTo(worldBox(st().objects[s.root]).max.z, 4)
    expect(maxDiff(k.transform, freshK.transform)).toBeLessThan(1e-4)
  })

  it('undo → исходная глубина (снимок и пересборка), redo → новая', async () => {
    const f = await scene(10)
    const fresh = st().objects[f.root]
    reset()
    const s = await scene(5)
    const orig = st().objects[s.root]
    const g = st().operations[groupIdx()] as GroupOperation
    await st().editStepParams(groupIdx(), E(10))

    await st().undo()
    expect(Array.from(st().objects[s.root].vertices)).toEqual(Array.from(orig.vertices))
    expect(slabOf(g).params.depth).toBe(5)
    await st().redo()
    expectSameMesh(st().objects[s.root], fresh)
    clearSnapshots()
    await st().undo()
    expect(Array.from(st().objects[s.root].vertices)).toEqual(Array.from(orig.vertices))
    clearSnapshots()
    await st().redo()
    expectSameMesh(st().objects[s.root], fresh)
    expect(slabOf(g).params.depth).toBe(10)
  })

  it('K>1: extrude ∪ C ∪ D — оба CSG пересчитаны; повторная правка — от эффективной глубины', async () => {
    const chain = async (depth: number) => {
      const s = await scene(depth)
      const d = await shape('cylinder', { radius: 3, height: 30, segments: 32 }, at(20, 0, 0))
      return { ...s, top: await csg(s.root, d) }
    }
    const f = await chain(12)
    const fresh = st().objects[f.top]
    reset()
    const s = await chain(5)
    await st().editStepParams(groupIdx(), E(8))
    expect(lastEdit().replacements.map((r) => r.kind)).toEqual(['add_shape', 'group', 'group', 'group'])
    expect(await st().editStepParams(groupIdx(), E(12))).toBe(true)
    expect(lastEdit().before).toEqual(E(8))
    expectSameMesh(st().objects[s.top], fresh)
  })

  it('правка move базы ДО extrude: плита следует за базой (не отрывается)', async () => {
    const build = async (x: number) => {
      const a = await shape('cube', { width: 10, height: 10, depth: 10 }, at(x, 0, 0))
      const ext = await extrude(a, 'X', 6)
      const c = await shape('sphere', { radius: 5, segments: 32 }, at(24, 0, 0))   // одна точка в обоих сценариях
      return { a, ext, root: await csg(ext, c) }
    }
    const f = await build(9)
    const fresh = st().objects[f.root]
    reset()
    const s = await build(3)
    const mIdx = st().operations.findIndex((o) => o.type === 'move' && o.ids[0] === s.a)
    const m = st().operations[mIdx] as { delta: Vec3 }
    expect(await st().editStepParams(mIdx, { kind: 'move', delta: { ...m.delta, x: m.delta.x + 6 } })).toBe(true)
    expect(lastEdit().replacements.map((r) => r.kind)).toEqual(['add_shape', 'group', 'group'])
    expectSameMesh(st().objects[s.root], fresh)
  })

  it('старый extrude без source: как extrude не редактируется (✎ нет), история не меняется', async () => {
    const s = await scene(5)
    // как в документах до 9.5.4: группа extrude без source
    const ops = st().operations.map((o) => (o.type === 'group' && o.source ? (({ source: _s, ...rest }) => rest)(o) : o))
    useDocumentStore.setState({ operations: ops })
    const idx = ops.findIndex((o) => o.type === 'group' && o.ids.includes(s.a))
    expect(isStepEditable(ops[idx])).toBe(false)
    expect(await st().editStepParams(idx, E(10))).toBe(false)
    expect(st().operations).toBe(ops)
    // прочие шаги (move) по-прежнему правятся
    expect(isStepEditable(ops.find((o) => o.type === 'move')!)).toBe(true)
  })

  it('отказы без изменения истории: та же глубина (молча), 0, NaN', async () => {
    await scene(5)
    const ops = st().operations
    expect(await st().editStepParams(groupIdx(), E(5))).toBe(false)
    expect(warnings()).toHaveLength(0)
    expect(await st().editStepParams(groupIdx(), E(0))).toBe(false)
    expect(await st().editStepParams(groupIdx(), E(NaN))).toBe(false)
    expect(st().operations).toBe(ops)
    expect(st().busy).toBe(false)
  })

  it('.3dtc round-trip: source, правка и замена плиты сохраняются; сцена воспроизводится', async () => {
    const s = await scene(5)
    await st().editStepParams(groupIdx(), E(10))
    const edited = st().objects[s.root]
    const parsed = await parse3dtc(await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false }))
    const g = parsed.operations.find((o) => o.type === 'group' && o.source) as GroupOperation
    expect(g.source).toMatchObject({ kind: 'extrude', axis: 'Z', depth: 5 })
    const last = parsed.operations[parsed.operations.length - 1] as EditStepOperation
    expect(last.patch).toEqual(E(10))
    expect(last.replacements[0]).toMatchObject({ kind: 'add_shape', params: { depth: 10 } })
    const objs = await rebuildFromHistory(parsed.operations)
    expectSameMesh(objs[s.root], edited)
  })
})
