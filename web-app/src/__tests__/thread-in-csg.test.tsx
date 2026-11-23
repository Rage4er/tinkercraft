// ============================================================
// THREAD-IN-CSG — UI: ✎ у шага thread внутри CSG и правка в дереве
// ============================================================

import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

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

import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import Timeline from '../components/Timeline'
import StepPanel from '../components/StepPanel'
import ComponentTree from '../components/ComponentTree'
import ChildPropertiesPanel from '../components/ChildPropertiesPanel'
import { useTimelineEdit } from '../hooks/useTimelineEdit'
import { useSelectedStepGuard } from '../hooks/useSelectedStepGuard'
import { addThreadObject } from '../store/add-thread'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { initWasm } from '../csg/worker-handlers'
import i18n from '../i18n'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const st = () => useDocumentStore.getState()
let host: HTMLDivElement
let root: Root

beforeAll(async () => {
  vi.stubGlobal('postMessage', vi.fn())
  await initWasm()
})
beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useUiStore.setState({ selectedChild: null, selectedStep: null, expandedTreeIds: {} })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function until(cond: () => boolean, ms = 6000): Promise<void> {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('until: timeout')
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  }
}

async function threadCsg(): Promise<{ rootId: string; threadId: string }> {
  await addThreadObject({ series: 'metric', sizeId: 'M8', length: 20, kind: 'bolt', starts: 2 })
  const threadId = Object.keys(st().objects)[0]
  await st().addShape('cube', { width: 8, height: 8, depth: 8 })
  const cube = Object.keys(st().objects).find((id) => id !== threadId)!
  await st().moveObject(cube, { ...st().objects[cube].transform, x: 30 })
  st().selectObjects([threadId, cube], false)
  await st().csgBoolean('union')
  return { rootId: st().selectedIds[0], threadId }
}

function TimelineHarness() {
  const operations = useDocumentStore((s) => s.operations)
  const historyIndex = useDocumentStore((s) => s.historyIndex)
  const busy = useDocumentStore((s) => s.busy)
  const onEdit = useTimelineEdit()
  useSelectedStepGuard()
  return (
    <>
      <Timeline operations={operations} historyIndex={historyIndex} busy={busy} onJump={() => {}} filters={{}} onEdit={onEdit} />
      <StepPanel />
    </>
  )
}

describe('THREAD-IN-CSG — UI', () => {
  it('✎ у шага thread внутри CSG открывает панель и пересобирает CSG', async () => {
    await i18n.changeLanguage('ru')
    const { rootId } = await threadCsg()
    const before = st().objects[rootId].vertices.length
    useDocumentStore.setState({ selectedIds: [] })
    act(() => root.render(<TimelineHarness />))

    const threadRow = Array.from(host.querySelectorAll<HTMLElement>('.tl-item'))
      .find((r) => r.textContent?.includes(i18n.t('threadModal.title')))!
    const pencil = threadRow.querySelector<HTMLButtonElement>('.tl-edit')
    expect(pencil).not.toBeNull()
    expect(pencil!.getAttribute('title')).toBe(i18n.t('timeline.editThreadStep'))
    act(() => pencil!.click())
    expect(host.querySelector('[data-testid=step-thread]')).not.toBeNull()

    const starts = host.querySelector<HTMLSelectElement>('[data-testid=props-thread-starts]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    act(() => {
      setter.call(starts, '4')
      starts.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await until(() => st().operations.at(-1)?.type === 'edit_step')
    expect(st().operations.at(-1)?.type).toBe('edit_step')
    expect(st().objects[rootId].vertices.length).not.toBe(before)
  })

  it('thread в дереве CSG редактируемый (не 🔒), правка из ChildPropertiesPanel', async () => {
    await i18n.changeLanguage('ru')
    const { rootId, threadId } = await threadCsg()
    useUiStore.setState({ expandedTreeIds: { [rootId]: true } })
    act(() => root.render(
      <>
        <ComponentTree
          objects={Object.values(st().objects)}
          selectedIds={new Set([rootId])}
          onSelect={() => {}}
          onRename={() => {}}
          onToggleVis={() => {}}
          onDelete={() => {}}
        />
        <ChildPropertiesPanel />
      </>,
    ))
    const threadRow = Array.from(host.querySelectorAll<HTMLElement>('.ct-child'))
      .find((r) => r.textContent?.includes(i18n.t('threadModal.title')))!
    expect(threadRow).toBeDefined()
    expect(threadRow.querySelector('[data-testid=ct-lock]')).toBeNull()
    expect(threadRow.textContent).toContain('M8')

    act(() => threadRow.click())
    expect(useUiStore.getState().selectedChild).toEqual({ rootId, nodeId: threadId })
    await until(() => host.querySelector('[data-testid=child-thread-form]') !== null)
    const starts = host.querySelector<HTMLSelectElement>('[data-testid=props-thread-starts]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    act(() => {
      setter.call(starts, '4')
      starts.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await until(() => st().operations.at(-1)?.type === 'edit_child_params')
    const op = st().operations.at(-1)!
    expect(op.type).toBe('edit_child_params')
    if (op.type === 'edit_child_params') expect(op.threadParams).toMatchObject({ starts: 4 })
  })
})
