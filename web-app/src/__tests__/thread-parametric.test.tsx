// ============================================================
// THREAD-PARAMETRIC — многозаходность и правка резьбы
// ============================================================
// Многозаходная: starts спиралей со сдвигом 360°/starts, ход = P·starts;
// параметричность: операция `thread` + `edit_step`, undo/redo и каскад CSG.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildThread, extractMesh, initWasm } from '../csg/worker-handlers'
import { threadSizeOf } from '../csg/thread-table'
import { addThreadObject } from '../store/add-thread'
import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { useNotifications } from '../store/notifications'
import { meshVolume } from '../store/edit-child'
import { rebuildFromHistory } from '../store/rebuild'
import { parse3dtc, serialize3dtc } from '../io/3dtc-io'

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

const st = () => useDocumentStore.getState()
const errors = () => useNotifications.getState().notifications.filter((n) => n.type === 'error')

beforeAll(async () => {
  vi.stubGlobal('postMessage', vi.fn())
  await initWasm()
})
beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots()
  clearTree()
})

function volume(sizeId: string, starts: number, length = 20): number {
  const thread = buildThread(threadSizeOf('metric', sizeId)!, length, 'bolt', 'right', starts)
  const mesh = extractMesh(thread)
  thread.delete()
  return meshVolume(mesh.vertices, mesh.indices)
}

function sizeOf(id: string): number[] {
  const obj = st().objects[id]
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < obj.vertices.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], obj.vertices[i + k])
      max[k] = Math.max(max[k], obj.vertices[i + k])
    }
  }
  return max.map((v, k) => v - min[k])
}

describe('THREAD-PARAMETRIC — многозаходная геометрия (WASM)', () => {
  it('2, 3 и 4 захода: объём стабилен, диаметр и длина табличные', () => {
    const volumes = [1, 2, 3, 4].map((n) => volume('M10', n))
    // Для одной длины суммарная длина витков не зависит от числа заходов:
    // ход P·n и n спиралей дают то же количество материала (P — шаг профиля).
    for (let i = 1; i < volumes.length; i++) expect(Math.abs(volumes[i] - volumes[0]) / volumes[0]).toBeLessThan(0.01)
    for (const starts of [2, 3, 4]) {
      const thread = buildThread(threadSizeOf('metric', 'M10')!, 20, 'bolt', 'right', starts)
      const mesh = extractMesh(thread)
      thread.delete()
      const xs = mesh.vertices.filter((_, i) => i % 3 === 0)
      const zs = mesh.vertices.filter((_, i) => i % 3 === 2)
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 1)
      expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(20, 3)
    }
  })

  it('на одном торце видны все заходы: 2, 3 и 4 отдельные группы гребней', () => {
    for (const starts of [2, 3, 4]) {
      const thread = buildThread(threadSizeOf('metric', 'M10')!, 20, 'bolt', 'right', starts)
      const mesh = extractMesh(thread)
      thread.delete()
      const rMajor = 5
      const rMinor = rMajor - 0.5412659 * 1.5
      const angles: number[] = []
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        const z = mesh.vertices[i + 2]
        const r = Math.hypot(mesh.vertices[i], mesh.vertices[i + 1])
        if (z > -10 && z < -9.8 && r > rMinor + (rMajor - rMinor) * 0.8) {
          angles.push(Math.atan2(mesh.vertices[i + 1], mesh.vertices[i]))
        }
      }
      const sectors = new Set(angles.map((a) => Math.floor(((a + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 12))))
      expect(sectors.size).toBeGreaterThanOrEqual(starts)
    }
  })

  it('многозаходный болт ∪ куб → CSG без ошибок', async () => {
    expect(await addThreadObject({ series: 'metric', sizeId: 'M10', length: 20, kind: 'bolt', starts: 3 })).toBe(true)
    const threadId = Object.keys(st().objects)[0]
    expect(st().objects[threadId].thread?.starts).toBe(3)
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const cube = Object.keys(st().objects).find((id) => id !== threadId)!
    await st().moveObject(cube, { ...st().objects[cube].transform, x: 40 })
    st().selectObjects([threadId, cube], false)
    await st().csgBoolean('union')
    expect(errors()).toEqual([])
    expect(st().objects[st().selectedIds[0]].shapeType).toBe('csg')
  })
})

describe('THREAD-PARAMETRIC — правка и undo/redo', () => {
  it('правка размера, шага, заходов и длины пересобирает меш через edit_step', async () => {
    await addThreadObject({ series: 'metric', sizeId: 'M6', length: 20, kind: 'bolt', starts: 1 })
    const id = Object.keys(st().objects)[0]
    const changed = await st().editThreadParams(id, {
      series: 'metric', sizeId: 'M10x1.25', length: 30, kind: 'bolt', hand: 'right', starts: 4,
    })
    expect(changed).toBe(true)
    const obj = st().objects[id]
    expect(obj.thread).toMatchObject({ sizeId: 'M10x1.25', length: 30, starts: 4 })
    expect(sizeOf(id)[0]).toBeCloseTo(10, 1)
    expect(sizeOf(id)[2]).toBeCloseTo(30, 3)
    const last = st().operations.at(-1)!
    expect(last.type).toBe('edit_step')
    expect(last.type === 'edit_step' ? last.patch : null).toMatchObject({ kind: 'thread', params: { starts: 4 } })
    expect(obj.name).toContain('M10x1.25')
  })

  it('undo/redo возвращает прежнюю и новую резьбу; rebuild читает параметры', async () => {
    await addThreadObject({ series: 'metric', sizeId: 'M8', length: 20, kind: 'bolt', starts: 1 })
    const id = Object.keys(st().objects)[0]
    await st().editThreadParams(id, {
      series: 'metric', sizeId: 'M8', length: 20, kind: 'bolt', hand: 'left', starts: 3,
    })
    expect(st().objects[id].thread).toMatchObject({ hand: 'left', starts: 3 })
    await st().undo()
    expect(st().objects[id].thread).toMatchObject({ hand: 'right', starts: 1 })
    await st().redo()
    expect(st().objects[id].thread).toMatchObject({ hand: 'left', starts: 3 })
    expect(st().objects[id].name).toContain('LH')
  })

  it('правка резьбы, уже поглощённой CSG, пересчитывает группу каскадом', async () => {
    await addThreadObject({ series: 'metric', sizeId: 'M6', length: 20, kind: 'bolt', starts: 1 })
    const threadId = Object.keys(st().objects)[0]
    await st().addShape('cube', { width: 10, height: 10, depth: 10 })
    const cubeId = Object.keys(st().objects).find((id) => id !== threadId)!
    await st().moveObject(cubeId, { ...st().objects[cubeId].transform, x: 30 })
    st().selectObjects([threadId, cubeId], false)
    await st().csgBoolean('union')
    const csgId = st().selectedIds[0]
    const before = new Float32Array(st().objects[csgId].vertices)
    const changed = await st().editStepParams(0, {
      kind: 'thread',
      params: { series: 'metric', sizeId: 'M10', length: 20, kind: 'bolt', hand: 'right', starts: 3 },
    })
    expect(changed).toBe(true)
    const last = st().operations.at(-1)!
    expect(last.type).toBe('edit_step')
    if (last.type === 'edit_step') expect(last.replacements.length).toBeGreaterThan(0)
    expect(st().objects[csgId]).toBeDefined()
    expect(st().objects[csgId].vertices.length).not.toBe(before.length)
    expect(errors()).toEqual([])
  })

  it('.3dtc сохраняет операцию thread и edit_step; rebuild восстанавливает параметры', async () => {
    await addThreadObject({ series: 'metric', sizeId: 'M8', length: 20, kind: 'bolt', starts: 1 })
    const id = Object.keys(st().objects)[0]
    await st().editThreadParams(id, {
      series: 'metric', sizeId: 'M8', length: 24, kind: 'bolt', hand: 'right', starts: 2,
    })
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    const parsed = await parse3dtc(blob)
    expect(parsed.operations.map((op) => op.type)).toEqual(['thread', 'edit_step'])
    const rebuilt = await rebuildFromHistory(parsed.operations)
    expect(rebuilt[id].thread).toMatchObject({ length: 24, starts: 2 })
    expect(rebuilt[id].name).toContain('M8×24')
  })
})
