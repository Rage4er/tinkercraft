// @vitest-environment node
// ============================================================
// fillet-brep.test.ts — FILLET-CHAMFER-BREP: OCCT, fillet/chamfer, история
// ============================================================
// B-Rep (OpenCascade WASM): рёбра примитива, скругление и фаска ребра,
// запись шага `fillet_brep`, undo/redo, правка размера через edit_step, .3dtc.
// Воркер OCCT заменён прямыми вызовами ядра (тест без Web Worker).

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Node-окружение: OCCT WASM грузится из FS; localStorage нужен i18n/настройкам.
vi.hoisted(() => {
  const map = new Map<string, string>()
  const ls = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)) },
    removeItem: (k: string) => { map.delete(k) },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() { return map.size },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
  // i18n при импорте пишет document.title
  Object.defineProperty(globalThis, 'document', { value: { title: 'TC', documentElement: {} }, configurable: true })
  Object.defineProperty(globalThis, 'self', { value: globalThis, configurable: true })
})

vi.mock('../brep/brep-client', async () => {
  const kernel = await import('../brep/brep-kernel')
  return {
    brepWorkerEdges: kernel.brepEdges,
    brepWorkerFillet: kernel.brepFillet,
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

import { brepEdges, brepFillet, meshAabb, type BrepBase } from '../brep/brep-kernel'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { initWasm } from '../csg/worker-handlers'
import { parse3dtc, serialize3dtc } from '../io/3dtc-io'
import type { TinkerCraftOperation } from '../csg/types'

// OCCT WASM при холодном старте в полном прогоне может инициализироваться дольше 15 с
vi.setConfig({ testTimeout: 120_000 })

const st = () => useDocumentStore.getState()
const BASE: BrepBase = { shapeType: 'cube', params: { width: 20, height: 20, depth: 20 } }

beforeAll(async () => {
  vi.stubGlobal('postMessage', vi.fn())
  await initWasm()
}, 120_000)

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
})

describe('OCCT B-Rep: рёбра и меш', () => {
  it('куб 20 мм — 12 рёбер с конечными точками и индексами 0…11', async () => {
    const edges = await brepEdges(BASE)
    expect(edges.length).toBe(12)
    expect(edges.map((e) => e.index).sort((a, b) => a - b)).toEqual([...Array(12).keys()])
    for (const e of edges) {
      expect(e.points.length).toBeGreaterThanOrEqual(6)
      expect(e.points.every((v) => Number.isFinite(v))).toBe(true)
    }
  })

  it('fillet r=2 одного ребра — замкнутый меш, габарит 20×20×20, рёбер результата больше', async () => {
    const mesh = await brepFillet(BASE, 'fillet', 2, [0])
    expect(mesh.indices.length % 3).toBe(0)
    expect(mesh.indices.length).toBeGreaterThan(0)
    expect(mesh.normals.length).toBe(mesh.vertices.length)
    const a = meshAabb(mesh.vertices)
    expect(a.max.x - a.min.x).toBeCloseTo(20, 2)
    expect(a.max.y - a.min.y).toBeCloseTo(20, 2)
    expect(a.max.z - a.min.z).toBeCloseTo(20, 2)
    const plain = await brepFillet(BASE, 'fillet', 0.0001, [0])
    expect(mesh.vertices.length).not.toBe(plain.vertices.length)
  })

  it('призма (6 сторон) — 18 рёбер, fillet по двум рёбрам сразу', async () => {
    const base: BrepBase = { shapeType: 'prism', params: { radius: 12, height: 20, sides: 6 } }
    const edges = await brepEdges(base)
    expect(edges.length).toBe(18)
    const mesh = await brepFillet(base, 'fillet', 2, [0, 1])
    expect(mesh.indices.length).toBeGreaterThan(0)
    const a = meshAabb(mesh.vertices)
    expect(a.max.z - a.min.z).toBeCloseTo(20, 2)
  })

  it('chamfer d=2 одного ребра — меш отличается от fillet (фасок меньше рёбер)', async () => {
    const fil = await brepFillet(BASE, 'fillet', 2, [0])
    const cha = await brepFillet(BASE, 'chamfer', 2, [0])
    expect(cha.indices.length % 3).toBe(0)
    expect(cha.vertices.length).not.toBe(fil.vertices.length)
  })

  it('размер больше половины меньшей стороны — ошибка B-Rep', async () => {
    await expect(brepFillet(BASE, 'fillet', 50, [0])).rejects.toThrow(/limit/)
  })
})

describe('История: шаг fillet_brep, undo/redo, edit_step, .3dtc', () => {
  async function cubeWithFillet(): Promise<{ id: string; mesh: Awaited<ReturnType<typeof brepFillet>> }> {
    await st().addShape('cube', { width: 20, height: 20, depth: 20 })
    const id = Object.keys(st().objects)[0]
    const obj = st().objects[id]
    const mesh = await brepFillet({ shapeType: 'cube', params: { ...obj.params } }, 'fillet', 2, [0, 2])
    const ok = await st().applyBrepFillet({
      targetId: id, kind: 'fillet', size: 2, edgeIndexes: [0, 2],
      base: { shapeType: 'cube', params: { ...obj.params } },
      transform: { ...obj.transform }, mesh, name: 'Скругление: Куб',
    })
    expect(ok).toBe(true)
    return { id, mesh }
  }

  it('шаг fillet_brep и объект import_mesh; undo/redo', async () => {
    const { id } = await cubeWithFillet()
    expect(st().operations.map((o) => o.type)).toEqual(['add_shape', 'fillet_brep'])
    const step = st().operations[1]
    expect(step.type === 'fillet_brep' ? step.edgeIndexes : []).toEqual([0, 2])
    expect(st().objects[id].shapeType).toBe('import_mesh')
    expect(st().objects[id].vertices.length).toBeGreaterThan(0)
    await st().undo()
    expect(st().historyIndex).toBe(1)
    expect(st().objects[id].shapeType).toBe('cube')
    await st().redo()
    expect(st().historyIndex).toBe(2)
    expect(st().objects[id].shapeType).toBe('import_mesh')
  })

  it('правка размера (edit_step fillet_brep) → пересчёт OCCT, undo/redo', async () => {
    const { id } = await cubeWithFillet()
    const hash = (v: Float32Array) => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * (i % 7 + 1); return s }
    const before = hash(st().objects[id].vertices)
    expect(await st().editStepParams(1, { kind: 'fillet_brep', size: 5 })).toBe(true)
    expect(st().operations.map((o) => o.type)).toEqual(['add_shape', 'fillet_brep', 'edit_step'])
    const edited = hash(st().objects[id].vertices)
    expect(edited).not.toBe(before)
    const last = st().operations[st().operations.length - 1]
    expect(last.type === 'edit_step' ? last.patch : null).toMatchObject({ kind: 'fillet_brep', size: 5 })
    await st().undo()
    expect(hash(st().objects[id].vertices)).toBe(before)
    await st().redo()
    expect(hash(st().objects[id].vertices)).toBe(edited)
  })

  it('.3dtc: fillet_brep с результатом и правкой восстанавливается', async () => {
    const { id } = await cubeWithFillet()
    const blob = await serialize3dtc({ fileName: 'test', objects: st().objects, operations: st().operations, operationsTrimmed: false })
    const parsed = await parse3dtc(await blob.arrayBuffer())
    const types = parsed.operations.map((o: TinkerCraftOperation) => o.type)
    expect(types).toEqual(['add_shape', 'fillet_brep'])
    const op = parsed.operations[1]
    expect(op.type === 'fillet_brep' ? op.size : null).toBe(2)
    expect(op.type === 'fillet_brep' ? op.resultVertices.length : 0).toBeGreaterThan(0)
    const objs = await import('../store/rebuild').then((m) => m.rebuildFromHistory(parsed.operations))
    expect(objs[id].shapeType).toBe('import_mesh')
  })
})

