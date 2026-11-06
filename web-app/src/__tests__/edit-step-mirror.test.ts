// ============================================================
// edit-step-mirror.test.ts — Фаза 9.5.3: правка плоскости шага mirror с каскадом
// ============================================================
// Эталон — «свежий» сценарий, сразу выполненный с новой плоскостью. Реальный WASM.

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
  SceneObject, TransformNR, ShapeParams, ShapeType, EditStepOperation, MirrorPlane, MirrorOperation,
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
 * Тот же меш, что у «свежего» сценария: pivot (diff < 1e-6), вершины (diff < 1e-5 —
 * 1–2 ULP float32 при |v| ≈ 30: копия строится живым mirrorSelected и воспроизведением
 * разным порядком операций; у move-теста 9.5.2 такого расхождения нет).
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

const SPHERE = { radius: 9, segments: 32 }
const PRISM = { radius: 10, height: 20, sides: 5 }

/** Зеркало выделенного `id` по плоскости; возвращает id копии. */
async function mirror(id: string, plane: MirrorPlane): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  st().selectObjects([id], false)
  await st().mirrorSelected(plane)
  return Object.keys(st().objects).find((k) => !before.has(k))!
}
/** Индекс шага mirror, создавшего копию `copyId`. */
const mirrorIdxOf = (copyId: string) =>
  st().operations.findIndex((o) => o.type === 'mirror' && o.ids.includes(copyId))
const M = (plane: MirrorPlane) => ({ kind: 'mirror' as const, plane })

/** призма A (повёрнута) → mirror(plane) → копия ∪ сфера C */
async function scene(plane: MirrorPlane) {
  const a = await shape('prism', PRISM, at(30, 2, 0, { rotY: 25 }))
  const copy = await mirror(a, plane)
  const c = await shape('sphere', SPHERE, at(-24, 0, 0))
  const root = await csg(copy, c)
  return { a, copy, c, root }
}

describe('9.5.3 — editStepParams (mirror)', () => {
  it('A → mirror YZ → ∪ C → правка на XZ: CSG = свежий сценарий, без уведомлений', async () => {
    const f = await scene('XZ')
    const fresh = st().objects[f.root]
    reset()
    const s = await scene('YZ')
    const orig = st().objects[s.root]
    expect(Math.abs(worldBox(orig).min.y - worldBox(fresh).min.y) + Math.abs(worldBox(orig).min.x - worldBox(fresh).min.x)).toBeGreaterThan(1e-2)

    const idx = mirrorIdxOf(s.copy)
    const n = st().operations.length
    expect(await st().editStepParams(idx, M('XZ'))).toBe(true)
    expect(warnings()).toHaveLength(0)
    expect(st().operations).toHaveLength(n + 1)
    const e = lastEdit()
    expect(e.stepFingerprint).toEqual({ type: 'mirror', targetId: s.copy })
    expect(e.patch).toEqual(M('XZ'))
    expect(e.before).toEqual(M('YZ'))
    expect(e.replacements.map((r) => r.kind)).toEqual(['group'])
    expect((st().operations[idx] as MirrorOperation).plane).toBe('YZ')      // append-only

    expectSameMesh(st().objects[s.root], fresh)
    // зеркальная копия в дереве — с новой плоскостью (замена вклада шага, не [YZ, XZ])
    expect(getNode(s.copy)?.mirrored).toEqual(['XZ'])
    expect(await checkRootConsistency({
      rootId: s.root, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
    })).toBeNull()
  })

  it('R12: двойное зеркало (YZ, затем YZ копии = исходник) → правка первого на XZ → [XZ, YZ], не наслоение', async () => {
    const build = async (p1: MirrorPlane) => {
      const a = await shape('prism', PRISM, at(30, 2, 0, { rotY: 25 }))
      const m1 = await mirror(a, p1)
      const m2 = await mirror(m1, 'YZ')
      const c = await shape('sphere', SPHERE, at(10, 0, 0))
      return { a, m1, m2, root: await csg(m2, c) }
    }
    const f = await build('XZ')
    const fresh = st().objects[f.root]
    expect(getNode(f.m2)?.mirrored).toEqual(['XZ', 'YZ'])
    reset()
    const s = await build('YZ')
    expect(st().objects[s.m1].mirrored).toEqual(['YZ'])
    expect(getNode(s.m2)?.mirrored ?? undefined).toBeUndefined()            // YZ∘YZ = тождество
    expect(await st().editStepParams(mirrorIdxOf(s.m1), M('XZ'))).toBe(true)
    expect(st().objects[s.m1].mirrored).toEqual(['XZ'])                     // копия шага: замена
    expect(getNode(s.m2)?.mirrored).toEqual(['XZ', 'YZ'])                   // ниже: перекомпозиция
    expectSameMesh(st().objects[s.root], fresh)
  })

  it('зеркало CSG-объекта: копия CSG и объединение с ней пересчитаны', async () => {
    const build = async (plane: MirrorPlane) => {
      const a = await shape('cube', { width: 10, height: 10, depth: 10 }, at(20, 5, 0, { rotZ: 15 }))
      const b = await shape('sphere', { radius: 6, segments: 32 }, at(26, 5, 0))
      const ab = await csg(a, b)
      const copy = await mirror(ab, plane)
      const c = await shape('cylinder', { radius: 4, height: 30, segments: 32 }, at(-20, -5, 0))
      return { ab, copy, root: await csg(copy, c) }
    }
    const f = await build('XY')
    const fresh = st().objects[f.root]
    reset()
    const s = await build('YZ')
    expect(await st().editStepParams(mirrorIdxOf(s.copy), M('XY'))).toBe(true)
    expect(warnings()).toHaveLength(0)
    const edited = st().objects[s.root]
    expect(maxDiff(edited.transform, fresh.transform)).toBeLessThan(1e-6)
    expect(Math.abs(volume(edited) - volume(fresh)) / volume(fresh)).toBeLessThan(1e-5)
    const eb = worldBox(edited), fb = worldBox(fresh)
    for (const k of ['x', 'y', 'z'] as const) {
      expect(eb.min[k]).toBeCloseTo(fb.min[k], 4)
      expect(eb.max[k]).toBeCloseTo(fb.max[k], 4)
    }
  })

  it('edit_child_params ниже по течению: зеркальный ребёнок пересчитан с новой плоскостью, калибровка 9.9', async () => {
    const withChild = async (plane: MirrorPlane) => {
      const s = await scene(plane)
      await st().editChildParams(s.root, s.copy, { radius: 13 })
      return s
    }
    const f = await withChild('XZ')
    const fresh = st().objects[f.root]
    reset()
    const s = await withChild('YZ')
    expect(await st().editStepParams(mirrorIdxOf(s.copy), M('XZ'))).toBe(true)
    expect(lastEdit().replacements.map((r) => r.kind)).toEqual(['group', 'edit_child_params'])
    expect(getNode(s.copy)?.mirrored).toEqual(['XZ'])
    expect(getNode(s.copy)?.params?.radius).toBe(13)
    const edited = st().objects[s.root]
    expect(maxDiff(edited.transform, fresh.transform)).toBeLessThan(1e-6)
    expect(Math.abs(volume(edited) - volume(fresh)) / volume(fresh)).toBeLessThan(1e-5)
    const eb = worldBox(edited), fb = worldBox(fresh)
    expect(eb.min.y).toBeCloseTo(fb.min.y, 4)
    expect(eb.max.x).toBeCloseTo(fb.max.x, 4)
    expect(await checkRootConsistency({
      rootId: s.root, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
    })).toBeNull()
  })

  it('align (re-solve) после mirror: копия-цель остаётся выровненной с якорем', async () => {
    const build = async (plane: MirrorPlane) => {
      // куб без поворота: рамка по params точная (призма — как сфера, ALIGN-PRIMITIVE-AABB)
      const a = await shape('cube', { width: 8, height: 8, depth: 8 }, at(30, 12, 0))
      const copy = await mirror(a, plane)
      const k = await shape('cube', { width: 6, height: 6, depth: 6 }, at(0, 40, 0))
      st().selectObjects([copy, k], false)                    // якорь — k
      await st().alignSelected('Y', 'min')
      return { copy, k }
    }
    const f = await build('XZ')
    const freshCopy = st().objects[f.copy]
    reset()
    const s = await build('YZ')
    expect(await st().editStepParams(mirrorIdxOf(s.copy), M('XZ'))).toBe(true)
    expect(lastEdit().replacements.map((r) => r.kind)).toEqual(['align'])
    const copy = st().objects[s.copy]
    expect(worldBox(copy).min.y).toBeCloseTo(worldBox(st().objects[s.k]).min.y, 5)
    expect(maxDiff(copy.transform, freshCopy.transform)).toBeLessThan(1e-5)
  })

  it('undo → исходная плоскость (снимок и пересборка), redo → новая', async () => {
    const f = await scene('XZ')
    const fresh = st().objects[f.root]
    reset()
    const s = await scene('YZ')
    const orig = st().objects[s.root]
    await st().editStepParams(mirrorIdxOf(s.copy), M('XZ'))

    await st().undo()
    expect(Array.from(st().objects[s.root].vertices)).toEqual(Array.from(orig.vertices))
    expect(getNode(s.copy)?.mirrored).toEqual(['YZ'])
    await st().redo()
    expectSameMesh(st().objects[s.root], fresh)

    clearSnapshots()
    await st().undo()
    expect(Array.from(st().objects[s.root].vertices)).toEqual(Array.from(orig.vertices))
    clearSnapshots()
    await st().redo()
    expectSameMesh(st().objects[s.root], fresh)
    expect(getNode(s.copy)?.mirrored).toEqual(['XZ'])
  })

  it('K>1: (копия ∪ C) ∪ D — оба CSG пересчитаны; повторная правка — от эффективной плоскости', async () => {
    const chain = async (plane: MirrorPlane) => {
      const s = await scene(plane)
      const d = await shape('cylinder', { radius: 3, height: 30, segments: 32 }, at(-10, 0, 0))
      return { ...s, top: await csg(s.root, d) }
    }
    const f = await chain('XY')
    const fresh = st().objects[f.top]
    reset()
    const s = await chain('YZ')
    const idx = mirrorIdxOf(s.copy)
    await st().editStepParams(idx, M('XZ'))
    expect(lastEdit().replacements.map((r) => r.kind)).toEqual(['group', 'group'])
    expect(await st().editStepParams(idx, M('XY'))).toBe(true)
    expect(lastEdit().before).toEqual(M('XZ'))
    expectSameMesh(st().objects[s.top], fresh)
  })

  it('отказы без изменения истории: та же плоскость (молча), неверная плоскость', async () => {
    const s = await scene('YZ')
    const ops = st().operations
    const idx = mirrorIdxOf(s.copy)
    expect(await st().editStepParams(idx, M('YZ'))).toBe(false)
    expect(warnings()).toHaveLength(0)
    expect(await st().editStepParams(idx, { kind: 'mirror', plane: 'QQ' as MirrorPlane })).toBe(false)
    expect(st().operations).toBe(ops)
    expect(st().busy).toBe(false)
  })

  it('.3dtc round-trip: правленая сцена воспроизводится из файла', async () => {
    const s = await scene('YZ')
    await st().editStepParams(mirrorIdxOf(s.copy), M('XZ'))
    const edited = st().objects[s.root]
    const parsed = await parse3dtc(await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false }))
    const last = parsed.operations[parsed.operations.length - 1]
    expect(last.type === 'edit_step' && last.patch).toEqual(M('XZ'))
    const objs = await rebuildFromHistory(parsed.operations)
    expectSameMesh(objs[s.root], edited)
  })
})

describe('воспроизведение зеркал = живое действие (без правки шага)', () => {
  /** rebuildFromHistory (undo без снимков, загрузка файла) даёт то же, что живая сцена. */
  async function expectReplayMatchesLive(ids: string[]): Promise<void> {
    const live = st().objects
    const replay = await rebuildFromHistory(st().operations)
    for (const id of ids) {
      expect(maxDiff(replay[id].transform, live[id].transform)).toBeLessThan(1e-6)
      expect(replay[id].mirrored).toEqual(live[id].mirrored)
      const a = worldBox(replay[id]), b = worldBox(live[id])
      for (const k of ['x', 'y', 'z'] as const) {
        expect(a.min[k]).toBeCloseTo(b.min[k], 4)
        expect(a.max[k]).toBeCloseTo(b.max[k], 4)
      }
      expect(Math.abs(volume(replay[id]) - volume(live[id])) / volume(live[id])).toBeLessThan(1e-5)
    }
  }

  it('MIRROR-CHAIN-REPLAY: зеркало зеркальной копии повёрнутого примитива ([XZ, YZ])', async () => {
    const a = await shape('prism', PRISM, at(30, 2, 0, { rotY: 25 }))
    const m1 = await mirror(a, 'XZ')
    const m2 = await mirror(m1, 'YZ')
    const m3 = await mirror(m2, 'YZ')                       // YZ∘YZ — снова [XZ]
    expect(st().objects[m2].mirrored).toEqual(['XZ', 'YZ'])
    expect(st().objects[m3].mirrored).toEqual(['XZ'])
    await expectReplayMatchesLive([m1, m2, m3])
  })

  it('MIRROR-CSG-REPLAY: зеркало CSG-объекта с поворотом операнда (и зеркало зеркала)', async () => {
    const a = await shape('cube', { width: 10, height: 10, depth: 10 }, at(20, 5, 0, { rotZ: 15 }))
    const b = await shape('sphere', { radius: 6, segments: 32 }, at(26, 5, 3))
    const ab = await csg(a, b)
    const c1 = await mirror(ab, 'YZ')
    const c2 = await mirror(c1, 'XY')
    await expectReplayMatchesLive([ab, c1, c2])
  })
})

