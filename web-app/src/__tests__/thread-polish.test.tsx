// ============================================================
// THREAD-POLISH — правка шага thread из Timeline и параметрическое зеркало
// ============================================================
// Часть 1: ✎ у шага thread → панель «Шаг N» → edit_step → пересборка, undo/redo,
// .3dtc. Часть 2 (ниже): зеркало резьбы остаётся параметрическим.

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
import StepPanel from '../components/StepPanel'
import Timeline from '../components/Timeline'
import { useTimelineEdit } from '../hooks/useTimelineEdit'
import { useSelectedStepGuard } from '../hooks/useSelectedStepGuard'
import { addThreadObject } from '../store/add-thread'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { initWasm } from '../csg/worker-handlers'
import { rebuildFromHistory } from '../store/rebuild'
import { parse3dtc, serialize3dtc } from '../io/3dtc-io'
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
  useUiStore.setState({ selectedChild: null, selectedStep: null })
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

function Harness() {
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

describe('THREAD-POLISH — ✎ у шага thread', () => {
  it('✎ открывает панель шага; правка заходов → edit_step, undo/redo, .3dtc', async () => {
    await i18n.changeLanguage('ru')
    await addThreadObject({ series: 'metric', sizeId: 'M10', length: 20, kind: 'bolt', starts: 3 })
    const id = Object.keys(st().objects)[0]
    useDocumentStore.setState({ selectedIds: [] })
    act(() => root.render(<Harness />))

    const row = host.querySelector<HTMLElement>('.tl-item')!
    const pencil = row.querySelector<HTMLButtonElement>('.tl-edit')
    expect(pencil).not.toBeNull()
    expect(pencil!.getAttribute('title')).toBe(i18n.t('timeline.editThreadStep'))
    act(() => pencil!.click())
    expect(useUiStore.getState().selectedStep).toBe(0)

    const panel = host.querySelector<HTMLElement>('[data-testid=step-panel]')
    expect(panel).not.toBeNull()
    expect(host.querySelector('[data-testid=step-thread]')).not.toBeNull()
    expect(host.querySelector('[data-testid=step-original]')?.textContent).toContain('3')
    const starts = host.querySelector<HTMLSelectElement>('[data-testid=props-thread-starts]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    act(() => {
      setter.call(starts, '4')
      starts.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await until(() => st().objects[id].thread?.starts === 4)
    const last = st().operations.at(-1)!
    expect(last.type).toBe('edit_step')
    if (last.type === 'edit_step') {
      expect(last.patch).toMatchObject({ kind: 'thread', params: { starts: 4 } })
    }

    await act(async () => { await st().undo() })
    expect(st().objects[id].thread?.starts).toBe(3)
    await act(async () => { await st().redo() })
    expect(st().objects[id].thread?.starts).toBe(4)

    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    const parsed = await parse3dtc(blob)
    expect(parsed.operations.at(-1)?.type).toBe('edit_step')
    const rebuilt = await rebuildFromHistory(parsed.operations)
    expect(rebuilt[id].thread?.starts).toBe(4)
  })
})
