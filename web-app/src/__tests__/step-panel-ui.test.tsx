// ============================================================
// step-panel-ui.test.tsx — Фаза 9.5.2/9.5.3: Timeline ✎ у move/mirror → панель «Шаг N»
// ============================================================
// Настоящий WASM через worker-bridge: коммит поля запускает реальный каскад CSG.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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

import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import StepPanel, { movePatchWith, fmtVec } from '../components/StepPanel'
import Timeline from '../components/Timeline'
import { useTimelineEdit } from '../hooks/useTimelineEdit'
import { useSelectedStepGuard } from '../hooks/useSelectedStepGuard'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import type { TransformNR, MoveOperation } from '../csg/types'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
// jsdom не реализует scrollIntoView (Timeline прокручивает к текущему шагу)
Element.prototype.scrollIntoView = function scrollIntoView() { /* no-op */ }

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }

let host: HTMLDivElement
let root: Root
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

async function until(cond: () => boolean, ms = 4000): Promise<void> {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('until: timeout')
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  }
}
function typeInto(el: HTMLInputElement, v: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  act(() => { el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
}

/** куб → сдвиг X=2 → сфера → ∪. Возвращает сырой индекс шага move куба и id результата. */
async function movedCsg(): Promise<{ idx: number; rootId: string }> {
  await st().addShape('cube', { width: 10, height: 10, depth: 10 })
  const cube = Object.keys(st().objects)[0]
  await st().moveObject(cube, { ...ID, x: 2 })
  await st().addShape('sphere', { radius: 6, segments: 32 })
  const sphere = Object.keys(st().objects).find((k) => k !== cube)!
  await st().moveObject(sphere, { ...ID, x: 7 })
  st().selectObjects([cube, sphere], false)
  await st().csgBoolean('union')
  const rootId = st().selectedIds[0]
  useDocumentStore.setState({ selectedIds: [] })
  const idx = st().operations.findIndex((o) => o.type === 'move' && o.ids[0] === cube)
  return { idx, rootId }
}

/** Timeline + панель + сторож — как в App (правая панель вместо свойств). */
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

describe('movePatchWith / fmtVec', () => {
  const op: MoveOperation = { type: 'move', ids: ['a'], delta: { x: 2, y: 0.04, z: 0 }, rotDelta: { x: 0, y: 20, z: 0 } }
  it('значение с точностью показа поля не изменилось → null (уход из поля не пишет шаг)', () => {
    expect(movePatchWith(op, 'delta', 'x', 2)).toBeNull()
    expect(movePatchWith(op, 'delta', 'y', 0)).toBeNull()      // показано «0.0»
    expect(movePatchWith(op, 'rotDelta', 'y', 20)).toBeNull()
  })
  it('меняется одно поле, прочие дельты — прежние (полный набор)', () => {
    expect(movePatchWith(op, 'delta', 'x', 5)).toEqual({
      kind: 'move', delta: { x: 5, y: 0.04, z: 0 }, rotDelta: { x: 0, y: 20, z: 0 },
    })
    expect(movePatchWith(op, 'rotDelta', 'z', 15)).toEqual({
      kind: 'move', delta: { x: 2, y: 0.04, z: 0 }, rotDelta: { x: 0, y: 20, z: 15 },
    })
  })
  it('fmtVec округляет до 0.001', () => {
    expect(fmtVec({ x: 5, y: -2.5, z: 1 / 3 })).toBe('(5, -2.5, 0.333)')
  })
})

describe('StepPanel (9.5.2)', () => {
  it('✎ у шага move → панель; ΔX по Enter/blur пишет edit_step; CSG и Timeline обновлены', async () => {
    const { idx, rootId } = await movedCsg()
    act(() => root.render(<Harness />))

    const rows = Array.from(host.querySelectorAll<HTMLElement>('.tl-item'))
    // ✎ есть у move, но не у CSG (extrude-group — 9.5.4)
    const groupRow = rows.find((r) => r.textContent?.includes(i18n.t('timeline.groupUnion')))!
    expect(groupRow.querySelector('.tl-edit')).toBeNull()
    expect(rows[idx].querySelector('.tl-edit')?.getAttribute('title')).toBe(i18n.t('timeline.editMoveStep'))
    act(() => { rows[idx].querySelector<HTMLButtonElement>('.tl-edit')!.click() })
    expect(useUiStore.getState().selectedStep).toBe(idx)

    const panel = () => host.querySelector<HTMLElement>('[data-testid=step-panel]')
    expect(panel()).not.toBeNull()
    expect(panel()!.textContent).toContain(i18n.t('stepPanel.title', { step: idx + 1, name: i18n.t('stepPanel.move') }))
    expect(host.querySelector('[data-testid=step-original]')?.textContent).toBe('Δ (2, 0, 0)')
    expect(panel()!.textContent).toContain(i18n.t('shapes.cube'))   // имя объекта, а не id
    // шаг без поворота/масштаба — только поля сдвига
    expect(host.querySelector('[data-testid=step-rotDelta]')).toBeNull()
    const inputs = () => Array.from(host.querySelectorAll<HTMLInputElement>('[data-testid=step-delta] input.props-input'))
    expect(inputs().map((i) => i.value)).toEqual(['2.0', '0.0', '0.0'])

    // уход из поля без правки — истории не прибавилось
    const n = st().operations.length
    typeInto(inputs()[0], '2.0')
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(st().operations).toHaveLength(n)

    typeInto(inputs()[0], '5')
    await until(() => st().operations.length === n + 1 && !st().busy)
    expect(st().operations[n].type).toBe('edit_step')
    expect(useNotifications.getState().notifications.filter((x) => x.type !== 'info')).toHaveLength(0)
    // CSG перестроен: pivot = новая позиция операнда A
    expect(st().objects[rootId].transform.x).toBeCloseTo(5, 6)

    // панель осталась на шаге, показывает новое значение и метку правки
    expect(panel()).not.toBeNull()
    expect(inputs()[0].value).toBe('5.0')
    expect(host.querySelector('[data-testid=step-edited]')?.textContent).toBe(i18n.t('stepPanel.edited', { step: n + 1 }))
    // Timeline: шаг move с меткой правки; сама правка подписана «было → стало»
    const rows2 = Array.from(host.querySelectorAll<HTMLElement>('.tl-item'))
    expect(rows2[idx].querySelector('[data-testid=tl-edited]')).not.toBeNull()
    expect(rows2[n].textContent).toContain('(2, 0, 0) → (5, 0, 0)')
  })

  it('undo до шага move и выделение в сцене закрывают панель', async () => {
    const { idx } = await movedCsg()
    act(() => root.render(<Harness />))
    act(() => useUiStore.getState().setSelectedStep(idx))
    expect(host.querySelector('[data-testid=step-panel]')).not.toBeNull()

    // перемотка на шаг ДО move (move ещё не выполнен)
    await act(async () => { await st().jumpToHistory(idx) })
    await until(() => useUiStore.getState().selectedStep === null)
    expect(host.querySelector('[data-testid=step-panel]')).toBeNull()

    await act(async () => { await st().jumpToHistory(st().operations.length) })
    act(() => useUiStore.getState().setSelectedStep(idx))
    expect(host.querySelector('[data-testid=step-panel]')).not.toBeNull()
    act(() => st().selectObjects([Object.keys(st().objects)[0]], false))
    await until(() => useUiStore.getState().selectedStep === null)
  })
})

/** призма → зеркало YZ → копия ∪ сфера. Возвращает сырой индекс шага mirror и id копии. */
async function mirroredCsg(): Promise<{ idx: number; copy: string; rootId: string }> {
  await st().addShape('prism', { radius: 10, height: 20, sides: 5 })
  const prism = Object.keys(st().objects)[0]
  await st().moveObject(prism, { ...ID, x: 30, y: 3 })
  st().selectObjects([prism], false)
  await st().mirrorSelected('YZ')
  const copy = Object.keys(st().objects).find((k) => k !== prism)!
  await st().addShape('sphere', { radius: 9, segments: 32 })
  const sphere = Object.keys(st().objects).find((k) => k !== prism && k !== copy)!
  await st().moveObject(sphere, { ...ID, x: -24 })
  st().selectObjects([copy, sphere], false)
  await st().csgBoolean('union')
  const rootId = st().selectedIds[0]
  useDocumentStore.setState({ selectedIds: [] })
  return { idx: st().operations.findIndex((o) => o.type === 'mirror'), copy, rootId }
}

describe('StepPanel (9.5.3, mirror)', () => {
  it('✎ у шага mirror → панель с плоскостью; выбор XZ сразу пишет edit_step; та же плоскость — ничего', async () => {
    const { idx, rootId } = await mirroredCsg()
    act(() => root.render(<Harness />))
    const rows = Array.from(host.querySelectorAll<HTMLElement>('.tl-item'))
    expect(rows[idx].querySelector('.tl-edit')?.getAttribute('title')).toBe(i18n.t('timeline.editMirrorStep'))
    act(() => { rows[idx].querySelector<HTMLButtonElement>('.tl-edit')!.click() })

    const panel = () => host.querySelector<HTMLElement>('[data-testid=step-panel]')!
    expect(panel().textContent).toContain(i18n.t('stepPanel.title', { step: idx + 1, name: i18n.t('stepPanel.mirror') }))
    expect(panel().textContent).toContain(i18n.t('shapes.prism'))     // зеркалится призма
    expect(host.querySelector('[data-testid=step-original]')?.textContent).toBe('YZ')
    expect(host.querySelector('[data-testid=step-delta]')).toBeNull()  // полей сдвига нет
    const btn = (p: string) => host.querySelector<HTMLButtonElement>(`[data-testid=step-plane-${p}]`)!
    expect(btn('YZ').getAttribute('aria-checked')).toBe('true')
    expect(btn('XZ').getAttribute('aria-checked')).toBe('false')

    const n = st().operations.length
    act(() => { btn('YZ').click() })                                 // текущая — без шага истории
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(st().operations).toHaveLength(n)

    const x0 = st().objects[rootId].transform.x
    act(() => { btn('XZ').click() })
    await until(() => st().operations.length === n + 1 && !st().busy)
    expect(st().operations[n].type).toBe('edit_step')
    expect(useNotifications.getState().notifications.filter((x) => x.type !== 'info')).toHaveLength(0)
    // pivot CSG = новая копия: YZ давал x = −30, XZ даёт x = 30 (y = −3)
    expect(x0).toBeCloseTo(-30, 6)
    expect(st().objects[rootId].transform.x).toBeCloseTo(30, 6)
    expect(st().objects[rootId].transform.y).toBeCloseTo(-3, 6)

    expect(btn('XZ').getAttribute('aria-checked')).toBe('true')
    expect(host.querySelector('[data-testid=step-edited]')).not.toBeNull()
    const rows2 = Array.from(host.querySelectorAll<HTMLElement>('.tl-item'))
    expect(rows2[idx].querySelector('[data-testid=tl-edited]')).not.toBeNull()
    expect(rows2[idx].textContent).toContain('XZ')                      // эффективная плоскость в подписи шага
    expect(rows2[n].textContent).toContain(`${i18n.t('stepPanel.mirror').toLowerCase()} YZ → XZ`)
  })
})

