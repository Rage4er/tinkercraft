// ============================================================
// THREAD-IN-CSG — резьба как параметрический ребёнок CSG
// ============================================================
// Build Tree: thread — не baked; edit_child_params несёт ThreadParams,
// калибровка дерева проходит, undo/redo и .3dtc восстанавливают дерево.

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
import { clearTree, getNode } from '../csg/history-tree'
import { getTreeView, findViewNode, isChildEditable } from '../csg/tree-view'
import { checkChildEditable } from '../store/edit-child'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import { parse3dtc, serialize3dtc } from '../io/3dtc-io'
import { initWasm } from '../csg/worker-handlers'
import type { ThreadParams } from '../csg/thread-table'

const st = () => useDocumentStore.getState()
const errors = () => useNotifications.getState().notifications.filter((n) => n.type === 'error')

beforeAll(async () => {
  vi.stubGlobal('postMessage', vi.fn())
  await initWasm()
})
beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
})

async function threadInCsg(starts = 2): Promise<{ rootId: string; threadId: string; cubeId: string }> {
  expect(await addThreadObject({ series: 'metric', sizeId: 'M8', length: 20, kind: 'bolt', starts })).toBe(true)
  const threadId = Object.keys(st().objects)[0]
  await st().addShape('cube', { width: 8, height: 8, depth: 8 })
  const cubeId = Object.keys(st().objects).find((id) => id !== threadId)!
  await st().moveObject(cubeId, { ...st().objects[cubeId].transform, x: 30 })
  st().selectObjects([threadId, cubeId], false)
  await st().csgBoolean('union')
  return { rootId: st().selectedIds[0], threadId, cubeId }
}

const edited: ThreadParams = {
  series: 'metric', sizeId: 'M10', length: 30, kind: 'bolt', hand: 'right', starts: 4,
}

describe('THREAD-IN-CSG — параметрический узел в дереве', () => {
  it('thread в CSG — TreeNode thread (не baked), редактируемый', async () => {
    const { rootId, threadId } = await threadInCsg()
    expect(getNode(threadId)?.type).toBe('thread')
    expect(getNode(threadId)?.threadParams).toMatchObject({ starts: 2, sizeId: 'M8' })
    expect(getNode(threadId)?.vertices).toBeUndefined()
    expect(isChildEditable(threadId)).toEqual({ editable: true, reason: null })

    const view = getTreeView(rootId)!
    const child = findViewNode(view, threadId)!
    expect(child.type).toBe('thread')
    expect(child.editable).toBe(true)
    expect(child.threadParams).toMatchObject({ starts: 2 })
    expect(errors()).toEqual([])
  })

  it('edit_child_params для thread → generateThread → пересборка CSG', async () => {
    const { rootId, threadId } = await threadInCsg()
    const before = new Float32Array(st().objects[rootId].vertices)
    await st().editThreadChildParams(rootId, threadId, edited)

    const op = st().operations.at(-1)!
    expect(op.type).toBe('edit_child_params')
    if (op.type === 'edit_child_params') {
      expect(op.threadParams).toMatchObject({ starts: 4, sizeId: 'M10', length: 30 })
      expect(op.params).toEqual({})
    }
    expect(getNode(threadId)?.type).toBe('thread')
    expect(getNode(threadId)?.threadParams).toMatchObject({ starts: 4 })
    expect(st().objects[rootId].vertices.length).not.toBe(before.length)
    expect(await checkChildEditable({ rootId, nodeId: threadId, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex })).toBeNull()
    expect(errors()).toEqual([])
  })

  it('undo/redo восстанавливает параметры thread внутри CSG', async () => {
    const { rootId, threadId } = await threadInCsg()
    await st().editThreadChildParams(rootId, threadId, edited)
    await st().undo()
    expect(st().objects[rootId]).toBeDefined()
    expect(getNode(threadId)?.threadParams).toMatchObject({ starts: 2, sizeId: 'M8' })
    await st().redo()
    expect(getNode(threadId)?.threadParams).toMatchObject({ starts: 4, sizeId: 'M10' })
  })

  it('.3dtc: thread остаётся параметрическим узлом после reload', async () => {
    const { rootId, threadId } = await threadInCsg()
    await st().editThreadChildParams(rootId, threadId, edited)
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    const parsed = await parse3dtc(blob)
    const rebuilt = await rebuildFromHistory(parsed.operations)
    rebuildBuildTree(parsed.operations, rebuilt)
    expect(getNode(threadId)?.type).toBe('thread')
    expect(getNode(threadId)?.threadParams).toMatchObject({ starts: 4, sizeId: 'M10' })
    expect(rebuilt[rootId].shapeType).toBe('csg')
    expect(rebuilt[rootId].vertices.length).toBeGreaterThan(0)
  })
})
