// @vitest-environment node
// ============================================================
// fillet-chain.test.ts — FILLET-CHAIN-BREP: цепочка на примитивах (OCCT B-Rep)
// ============================================================
// Куб → fillet ребра 1 → этот же объект (с цепочкой) → fillet ребра 2 →
// B-Rep цепочка сохраняется в SceneObject.brepChain и восстанавливается из
// истории; правка радиуса пересобирает цепочку; undo/redo и .3dtc.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Node-окружение: OCCT WASM грузится из FS; i18n/настройкам нужны localStorage/document.
vi.hoisted(() => {
  const map = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, String(v)) },
      removeItem: (k: string) => { map.delete(k) },
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() { return map.size },
    },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'document', { value: { title: 'TC', documentElement: {} }, configurable: true })
  Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true })
})

vi.setConfig({ testTimeout: 120_000 })

vi.mock('../brep/brep-client', async () => {
  const kernel = await import('../brep/brep-kernel')
  return {
    brepWorkerEdges: kernel.brepEdgesForChain,
    brepWorkerFillet: kernel.brepFilletChain,
    isBrepWorkerStarted: () => false,
  }
})

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerBuildImportedMesh: bridge.workerBuildImportedMesh,
    workerBuildThread: bridge.workerBuildThread,
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

import {
  brepCacheSize, brepEdgesForChain, brepFilletChain, resetBrepCache,
  type BrepBase, type BrepStep,
} from '../brep/brep-kernel'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { initWasm } from '../csg/worker-handlers'
import { parse3dtc, serialize3dtc } from '../io/3dtc-io'
import { rebuildFromHistory } from '../store/rebuild'
import { projectHistory } from '../store/project-history'
import type { SceneObject, TinkerCraftOperation } from '../csg/types'

const st = () => useDocumentStore.getState()
const BASE: BrepBase = { shapeType: 'cube', params: { width: 20, height: 20, depth: 20 } }
const hash = (v: Float32Array): number => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * (i % 7 + 1); return s }

beforeAll(async () => {
  vi.stubGlobal('postMessage', vi.fn())
  await initWasm()
}, 120_000)

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree(); resetBrepCache()
})

/** Куб в сцене + первый fillet (ребро 0). */
async function cubeFirstFillet(size = 2): Promise<{ id: string; base: BrepBase; steps: BrepStep[]; meshHash: number }> {
  await st().addShape('cube', { width: 20, height: 20, depth: 20 })
  const id = Object.keys(st().objects)[0]
  const obj = st().objects[id]
  const base: BrepBase = { shapeType: 'cube', params: { ...obj.params } }
  const mesh = await brepFilletChain(base, [], 'fillet', size, [0])
  const ok = await st().applyBrepFillet({
    targetId: id, kind: 'fillet', size, edgeIndexes: [0], base, steps: [],
    transform: { ...obj.transform }, mesh, name: 'Скругление: Куб',
  })
  expect(ok).toBe(true)
  return { id, base, steps: [{ kind: 'fillet', size, edgeIndexes: [0] }], meshHash: hash(mesh.vertices) }
}

describe('FILLET-CHAIN-BREP: B-Rep между операциями', () => {
  it('куб → fillet ребра 1 → fillet ребра 2: цепочка из двух шагов', async () => {
    const { id, base, steps, meshHash } = await cubeFirstFillet()
    expect(st().objects[id].brepChain?.steps.length).toBe(1)
    // Второй шаг — рёбра уже скруглённого тела (B-Rep цепочки, не меша)
    const edges2 = await brepEdgesForChain(base, steps)
    expect(edges2.length).toBeGreaterThan(12)
    const edge2 = edges2[0].index
    const mesh2 = await brepFilletChain(base, steps, 'fillet', 1.5, [edge2])
    const ok = await st().applyBrepFillet({
      targetId: id, kind: 'fillet', size: 1.5, edgeIndexes: [edge2], base, steps,
      transform: { ...st().objects[id].transform }, mesh: mesh2, name: 'Скругление: Куб',
    })
    expect(ok).toBe(true)
    const chain = st().objects[id].brepChain!
    expect(chain.steps.map((s) => s.size)).toEqual([2, 1.5])
    expect(chain.steps[1].edgeIndexes).toEqual([edge2])
    expect(hash(mesh2.vertices)).not.toBe(meshHash)
  })

  it('B-Rep кэш: повторный запрос цепочки не пересобирает тело', async () => {
    const { base, steps } = await cubeFirstFillet()
    const before = brepCacheSize()
    const a = await brepEdgesForChain(base, steps)
    const afterFirst = brepCacheSize()
    const b = await brepEdgesForChain(base, steps)
    expect(brepCacheSize()).toBe(afterFirst)
    expect(b.length).toBe(a.length)
    expect(afterFirst).toBeGreaterThanOrEqual(before)
  })

  it('правка радиуса первого шага пересобирает всю цепочку (второй шаг — тоже)', async () => {
    const { id, base, steps } = await cubeFirstFillet()
    const edges2 = await brepEdgesForChain(base, steps)
    const mesh2 = await brepFilletChain(base, steps, 'fillet', 1.5, [edges2[0].index])
    await st().applyBrepFillet({
      targetId: id, kind: 'fillet', size: 1.5, edgeIndexes: [edges2[0].index], base, steps,
      transform: { ...st().objects[id].transform }, mesh: mesh2, name: 'Скругление: Куб',
    })
    const before = hash(st().objects[id].vertices)
    expect(await st().editStepParams(1, { kind: 'fillet_brep', size: 3 })).toBe(true)
    const eff = projectHistory(st().operations)
    expect(eff.map((o) => o.type)).toEqual(['add_shape', 'fillet_brep', 'fillet_brep'])
    expect((eff[1] as { size: number }).size).toBe(3)
    expect((eff[2] as { resultVertices: Float32Array }).resultVertices).toBeDefined()
    expect(hash(st().objects[id].vertices)).not.toBe(before)
    expect(st().objects[id].brepChain!.steps[0].size).toBe(3)
  })

  it('undo/redo цепочки: два шага → один → два', async () => {
    const { id, base, steps } = await cubeFirstFillet()
    const edges2 = await brepEdgesForChain(base, steps)
    const mesh2 = await brepFilletChain(base, steps, 'fillet', 1.5, [edges2[0].index])
    await st().applyBrepFillet({
      targetId: id, kind: 'fillet', size: 1.5, edgeIndexes: [edges2[0].index], base, steps,
      transform: { ...st().objects[id].transform }, mesh: mesh2, name: 'Скругление: Куб',
    })
    const twoHash = hash(st().objects[id].vertices)
    await st().undo()
    expect(st().objects[id].brepChain?.steps.length).toBe(1)
    await st().redo()
    expect(st().objects[id].brepChain?.steps.length).toBe(2)
    expect(hash(st().objects[id].vertices)).toBe(twoHash)
  })

  it('.3dtc: цепочка из истории восстанавливается с brepChain', async () => {
    const { id, base, steps } = await cubeFirstFillet()
    const edges2 = await brepEdgesForChain(base, steps)
    const mesh2 = await brepFilletChain(base, steps, 'fillet', 1.5, [edges2[0].index])
    await st().applyBrepFillet({
      targetId: id, kind: 'fillet', size: 1.5, edgeIndexes: [edges2[0].index], base, steps,
      transform: { ...st().objects[id].transform }, mesh: mesh2, name: 'Скругление: Куб',
    })
    const blob = await serialize3dtc({
      fileName: 'chain', objects: st().objects as Record<string, SceneObject>,
      operations: st().operations, operationsTrimmed: false,
    })
    const parsed = await parse3dtc(await blob.arrayBuffer())
    expect(parsed.operations.map((o: TinkerCraftOperation) => o.type)).toEqual(['add_shape', 'fillet_brep', 'fillet_brep'])
    const objects = await rebuildFromHistory(parsed.operations)
    expect(objects[id].brepChain?.steps.length).toBe(2)
    expect(objects[id].brepChain?.steps.map((s) => s.size)).toEqual([2, 1.5])
  })
})
