// ============================================================
// THREAD-POLISH — параметрическое зеркало резьбы
// ============================================================
// Отражённая резьба — не baked import_mesh: шаг mirror хранит собственные ThreadParams
// (правая → левая), правка копии независима от оригинала и идёт через edit_step.

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { addThreadObject } from '../store/add-thread'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { initWasm } from '../csg/worker-handlers'
import { rebuildFromHistory } from '../store/rebuild'
import { parse3dtc, serialize3dtc } from '../io/3dtc-io'
import { meshVolume } from '../store/edit-child'

const st = () => useDocumentStore.getState()

beforeAll(async () => {
  vi.stubGlobal('postMessage', vi.fn())
  await initWasm()
})
beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
})

function volume(id: string): number {
  const obj = st().objects[id]
  return meshVolume(obj.vertices, obj.indices)
}

async function mirroredThread(): Promise<{ source: string; copy: string }> {
  expect(await addThreadObject({ series: 'metric', sizeId: 'M8', length: 20, kind: 'bolt', starts: 2 })).toBe(true)
  const source = Object.keys(st().objects)[0]
  await st().moveObject(source, { ...st().objects[source].transform, x: 20 })
  st().selectObjects([source], false)
  await st().mirrorSelected('YZ')
  const copy = Object.keys(st().objects).find((id) => id !== source)!
  return { source, copy }
}

describe('THREAD-MIRROR-PARAMETRIC', () => {
  it('зеркало создаёт параметрическую копию: thread, hand left, шаг mirror хранит params', async () => {
    const { source, copy } = await mirroredThread()
    const op = st().operations.at(-1)!
    expect(op.type).toBe('mirror')
    if (op.type !== 'mirror') throw new Error('mirror expected')
    expect(op.threadParams?.[copy]).toMatchObject({ hand: 'left', starts: 2, length: 20, sizeId: 'M8' })
    expect(st().objects[copy].thread).toMatchObject({ hand: 'left', starts: 2 })
    expect(st().objects[copy].name).toContain('LH')
    expect(st().objects[source].shapeType).toBe('import_mesh')
    expect(st().objects[copy].vertices.length).toBeGreaterThan(0)
    expect(volume(copy)).toBeCloseTo(volume(source), 4)
    expect(st().operations.some((o) => o.type === 'import_mesh')).toBe(false)
  })

  it('направление: повторное зеркало левой копии снова даёт правую', async () => {
    const { copy } = await mirroredThread()
    const before = new Set(Object.keys(st().objects))
    st().selectObjects([copy], false)
    await st().mirrorSelected('YZ')
    const second = Object.keys(st().objects).find((id) => !before.has(id))!
    expect(st().objects[second].thread?.hand).toBe('right')
    expect(st().objects[second].name).not.toContain('LH')
  })

  it('правка зеркальной копии (шаг/заходы) → edit_step, undo/redo, .3dtc', async () => {
    const { source, copy } = await mirroredThread()
    const changed = await st().editThreadParams(copy, {
      series: 'metric', sizeId: 'M8', length: 24, kind: 'bolt', hand: 'left', starts: 4,
    })
    expect(changed).toBe(true)
    expect(st().objects[copy].thread).toMatchObject({ hand: 'left', starts: 4, length: 24 })
    const last = st().operations.at(-1)!
    expect(last.type).toBe('edit_step')
    if (last.type === 'edit_step') {
      expect(last.patch).toMatchObject({ kind: 'thread_mirror', id: copy, params: { starts: 4 } })
    }

    await st().undo()
    expect(st().objects[copy].thread).toMatchObject({ starts: 2, length: 20 })
    await st().redo()
    expect(st().objects[copy].thread).toMatchObject({ starts: 4, length: 24 })

    // Правка оригинала не меняет независимую копию.
    await st().editThreadParams(source, {
      series: 'metric', sizeId: 'M8', length: 20, kind: 'bolt', hand: 'right', starts: 6,
    })
    expect(st().objects[copy].thread).toMatchObject({ starts: 4, length: 24 })

    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    const parsed = await parse3dtc(blob)
    const rebuilt = await rebuildFromHistory(parsed.operations)
    expect(rebuilt[copy].thread).toMatchObject({ hand: 'left', starts: 4, length: 24 })
    expect(rebuilt[source].thread).toMatchObject({ hand: 'right', starts: 6 })
  })
})
