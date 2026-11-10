// ============================================================
// csg-group-fix.test.tsx — вычитание / пересечение: A → B → Enter (CSG-GROUP-FIX)
// ============================================================
// Кнопок «Группа A» / «Группа B» нет. «Объединение» — сразу (N → один CSG).
// «Вычитание» / «Пересечение»: выделение — группа A (фиксируется) → выбрал B → Enter / «ОК»
// (статус-бар) / та же кнопка ещё раз → union(A) op union(B) — ОДИН CSG, `groupA` = |A|.
// Esc / «Отмена» — без изменений, выделение снова A. Настоящий WASM через worker-bridge.

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
    workerCsgBooleanMulti: bridge.workerCsgBooleanMulti,
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
import StatusBar from '../components/StatusBar'
import PropertiesPanel from '../components/PropertiesPanel'
import ComponentTree from '../components/ComponentTree'
import { useCsgGroupMode } from '../hooks/useCsgGroupMode'
import { useCsgGroupModeStore, csgButtonStates } from '../store/csg-group-mode'
import { useAlignModeStore } from '../store/align-mode'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, getNode } from '../csg/history-tree'
import { computeRSMatrix } from '../csg/worker-matrix'
import { meshVolume, checkRootConsistency } from '../store/edit-child'
import type { GroupOperation, SceneObject, TransformNR } from '../csg/types'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const st = () => useDocumentStore.getState()
const mode = () => useCsgGroupModeStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number): TransformNR => ({ ...ID, x, y: 5 })
const count = () => Object.keys(st().objects).length

function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
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

async function cube(size: number, h: number, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape('cube', { width: size, height: size, depth: h })
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}
/** A — `nA` кубов 20³ по X (шаг 30); B — `nB` столбиков 10×10×30 по центрам первых A. */
async function scene(nA: number, nB: number): Promise<{ a: string[]; b: string[] }> {
  const a: string[] = [], b: string[] = []
  for (let i = 0; i < nA; i++) a.push(await cube(20, 20, at(i * 30)))
  for (let i = 0; i < nB; i++) b.push(await cube(10, 30, at(i * 30)))
  return { a, b }
}
const lastGroup = () => st().operations[st().historyIndex - 1] as GroupOperation

let host: HTMLDivElement
let root: Root

beforeEach(async () => {
  await i18n.changeLanguage('ru')
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useUiStore.setState({ expandedTreeIds: {}, selectedChild: null })
  useCsgGroupModeStore.setState({ csgGroupMode: null })
  useAlignModeStore.setState({ alignMode: null })
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

/** Режим (клавиши, согласованность) + статус-бар — как в App. */
function Harness({ modal = false }: { modal?: boolean }): React.ReactElement {
  useCsgGroupMode(modal)
  return (
    <StatusBar workerOk objectCount={0} totalTris={0} historyIndex={0} operationsLength={0} modified={false}
      currentProjectId={null} lastCsgMs={null} rulerActive={false} fps={60} />
  )
}
function renderHarness(modal = false): void {
  act(() => { root.render(<Harness modal={modal} />) })
}
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T & HTMLElement>(sel)
const hint = () => q('[data-testid=csg-mode-hint]')?.textContent ?? null
const okBtn = () => q<HTMLButtonElement>('[data-testid=csg-mode-ok]')
function key(k: 'Enter' | 'Escape', target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true })
  act(() => { target.dispatchEvent(e) })
  return e
}
async function untilCsgDone(n: number): Promise<void> {
  await act(async () => {
    await vi.waitFor(() => { expect(count()).toBe(n); expect(st().busy).toBe(false) }, { timeout: 20000, interval: 20 })
  })
}

function panel(selected: string[], opStates = csgButtonStates(selected, st().objects, mode().csgGroupMode)): void {
  const noop = (): void => {}
  const objs = selected.map((id) => st().objects[id])
  act(() => {
    root.render(
      <PropertiesPanel
        firstSelected={objs[0] ?? null} busy={false} selectedIds={selected} canResize={false} canCsg csgOpStates={opStates}
        objectList={Object.values(st().objects)} operationsLength={st().operations.length} fileName={null} currentProjectId={null}
        currentProjectName={null} modified={false}
        onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop} onResizeDim={noop} onResizeObject={noop}
        onCsg={noop} onSetColor={noop} onToggleVisible={noop} onShowProjects={noop} onSaveToProject={noop}
      />,
    )
  })
}
const csgButtons = () => {
  const section = Array.from(host.querySelectorAll('.csg-group')).find((g) => g.querySelector('.csg-group-title')?.textContent === i18n.t('csg.operations'))
  return Array.from(section?.querySelectorAll<HTMLButtonElement>('button') ?? [])
}

describe('CSG-GROUP-FIX — кнопок групп нет', () => {
  it('панель (2 выбранных): только «Объединение» / «Вычитание» / «Пересечение» — без «Группа A/B», счётчиков, «×»', async () => {
    const { a, b } = await scene(1, 1)
    panel([a[0], b[0]])
    expect(csgButtons().map((x) => x.getAttribute('aria-label'))).toEqual(['Объединение', 'Вычитание', 'Пересечение'])
    expect(host.querySelectorAll('[data-testid^=csg-group], [data-testid=csg-groups], [data-testid=csg-groups-clear]')).toHaveLength(0)
    expect(Array.from(host.querySelectorAll('button')).some((x) => /Группа|×/.test(x.textContent ?? ''))).toBe(false)
    expect(csgButtons().every((x) => !x.disabled)).toBe(true)
  })

  it('в режиме: кнопка операции нажата (подтверждает), «Объединение» недоступно; в панели — ни одной кнопки групп', async () => {
    const { a, b } = await scene(2, 1)
    st().selectObjects(a, false)
    expect(mode().startCsgGroup('subtract')).toBe(true)
    st().selectObjects(b, false)
    panel(b)
    const [union, subtract, intersect] = csgButtons()
    expect(union.disabled).toBe(true)
    expect(subtract.classList.contains('active')).toBe(true)
    expect(subtract.disabled).toBe(false)
    expect(intersect.classList.contains('active')).toBe(false)
    expect(intersect.disabled).toBe(false)
    expect(host.querySelectorAll('[data-testid^=csg-group]')).toHaveLength(0)
  })
})

describe('CSG-GROUP-FIX — режим A → B → Enter', () => {
  it('вычитание: A (3) → «Вычитание» → режим (A зафиксирована, выделение снято) → B (2) → Enter → A − B одним CSG', async () => {
    const { a, b } = await scene(3, 2)
    renderHarness()
    st().selectObjects(a, false)
    await act(async () => { await mode().pressCsgOperation('subtract') })
    expect(mode().csgGroupMode).toEqual({ active: true, operation: 'subtract', groupA: a })
    expect(st().selectedIds).toEqual([])
    expect(hint()).toBe('Вычитание: выберите вторую группу (A: 3, B: 0). Enter — ОК, Esc — отмена')
    expect(okBtn()?.disabled).toBe(true)
    act(() => { st().selectObjects(b, false) })
    expect(hint()).toBe('Вычитание: выберите вторую группу (A: 3, B: 2). Enter — ОК, Esc — отмена')
    expect(okBtn()?.disabled).toBe(false)
    const e = key('Enter')
    expect(e.defaultPrevented).toBe(true)                 // кнопка в фокусе не «нажимается» второй раз
    await untilCsgDone(1)
    expect(mode().csgGroupMode).toBeNull()
    expect(q('[data-testid=csg-mode]')).toBeNull()
    const rootId = st().selectedIds[0]
    const g = lastGroup()
    expect(g.ids).toEqual([...a, ...b])
    expect(g.groupA).toBe(3)
    expect(g.treeOperation).toBe('subtract')
    expect(getNode(rootId)?.children).toEqual([...a, ...b])
    expect(getNode(rootId)?.groupA).toBe(3)
    // 3·20³ − 2·(10·10·20) = 20000
    expect(volume(st().objects[rootId])).toBeCloseTo(20000, 0)
    expect(await checkRootConsistency({ rootId, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex })).toBeNull()
    expect(useNotifications.getState().notifications).toEqual([])
  })

  it('пересечение: A (2) → «Пересечение» → B (2) → «ОК» в статус-баре → union(A) ∩ union(B)', async () => {
    const { a, b } = await scene(2, 2)
    renderHarness()
    st().selectObjects(a, false)
    await act(async () => { await mode().pressCsgOperation('intersect') })
    expect(hint()).toBe('Пересечение: выберите вторую группу (A: 2, B: 0). Enter — ОК, Esc — отмена')
    act(() => { st().selectObjects(b, false) })
    act(() => { okBtn()!.click() })
    await untilCsgDone(1)
    const g = lastGroup()
    expect(g.ids).toEqual([...a, ...b])
    expect(g.groupA).toBe(2)
    expect(g.treeOperation).toBe('intersect')
    // 2·(10·10·20) = 4000
    expect(volume(st().objects[st().selectedIds[0]])).toBeCloseTo(4000, 0)
    expect(useNotifications.getState().notifications).toEqual([])
  })

  it('объединение: N (4) → «Объединение» → один CSG сразу, без режима', async () => {
    const ids: string[] = []
    for (let i = 0; i < 4; i++) ids.push(await cube(10, 10, at(i * 15)))
    renderHarness()
    st().selectObjects(ids, false)
    await act(async () => { await mode().pressCsgOperation('union') })
    expect(mode().csgGroupMode).toBeNull()
    expect(q('[data-testid=csg-mode]')).toBeNull()
    expect(count()).toBe(1)
    expect(getNode(st().selectedIds[0])?.children).toEqual(ids)
    expect(lastGroup().groupA).toBeUndefined()
  })

  it('Esc → отмена: объекты и история не тронуты, выделение снова A; «Отмена» — то же', async () => {
    const { a, b } = await scene(2, 2)
    renderHarness()
    const ops = st().operations.length
    st().selectObjects(a, false)
    await act(async () => { await mode().pressCsgOperation('subtract') })
    act(() => { st().selectObjects(b, false) })
    const e = key('Escape')
    expect(e.defaultPrevented).toBe(true)
    expect(mode().csgGroupMode).toBeNull()
    expect(count()).toBe(4)
    expect(st().operations.length).toBe(ops)
    expect(st().selectedIds).toEqual(a)
    // «Отмена» в статус-баре
    await act(async () => { await mode().pressCsgOperation('intersect') })
    act(() => { q<HTMLButtonElement>('[data-testid=csg-mode-cancel]')!.click() })
    expect(mode().csgGroupMode).toBeNull()
    expect(st().selectedIds).toEqual(a)
    expect(count()).toBe(4)
  })

  it('Enter без B — режим остаётся, уведомлений нет; Esc без режима не перехватывается', async () => {
    const { a } = await scene(2, 0)
    renderHarness()
    expect(key('Escape').defaultPrevented).toBe(false)     // режима нет — общий обработчик App
    st().selectObjects(a, false)
    await act(async () => { await mode().pressCsgOperation('subtract') })
    act(() => { st().selectObjects([a[0]], false) })       // выбран только объект из A — B пуста
    expect(okBtn()?.disabled).toBe(true)
    key('Enter')
    await act(async () => { await Promise.resolve() })
    expect(mode().csgGroupMode?.groupA).toEqual(a)
    expect(count()).toBe(2)
    expect(useNotifications.getState().notifications).toEqual([])
  })

  it('та же кнопка ещё раз = «ОК»; другая — смена операции (A остаётся); «Объединение» в режиме — ничего', async () => {
    const { a, b } = await scene(2, 2)
    renderHarness()
    st().selectObjects(a, false)
    await act(async () => { await mode().pressCsgOperation('subtract') })
    act(() => { st().selectObjects(b, false) })
    await act(async () => { await mode().pressCsgOperation('union') })
    expect(count()).toBe(4)
    await act(async () => { await mode().pressCsgOperation('intersect') })
    expect(mode().csgGroupMode).toEqual({ active: true, operation: 'intersect', groupA: a })
    expect(hint()).toContain('Пересечение')
    await act(async () => { await mode().pressCsgOperation('intersect') })
    await untilCsgDone(1)
    expect(lastGroup().treeOperation).toBe('intersect')
    expect(volume(st().objects[st().selectedIds[0]])).toBeCloseTo(4000, 0)
  })

  it('та же кнопка без B — выход из режима (как «Выровнять»): объекты не тронуты, выделение A', async () => {
    const { a } = await scene(2, 1)
    renderHarness()
    st().selectObjects(a, false)
    await act(async () => { await mode().pressCsgOperation('subtract') })
    await act(async () => { await mode().pressCsgOperation('subtract') })
    expect(mode().csgGroupMode).toBeNull()
    expect(st().selectedIds).toEqual(a)
    expect(count()).toBe(3)
    expect(useNotifications.getState().notifications).toEqual([])
  })

  it('A из одного объекта → B из одного → Enter: бинарный a − b, как раньше (без groupA)', async () => {
    const { a, b } = await scene(1, 1)
    renderHarness()
    st().selectObjects(a, false)
    await act(async () => { await mode().pressCsgOperation('subtract') })
    act(() => { st().selectObjects(b, false) })
    key('Enter')
    await untilCsgDone(1)
    const g = lastGroup()
    expect(g.ids).toEqual([a[0], b[0]])
    expect(g.groupA).toBeUndefined()
    expect(getNode(st().selectedIds[0])?.groupA).toBeUndefined()
    expect(volume(st().objects[st().selectedIds[0]])).toBeCloseTo(8000 - 2000, 0)
  })

  it('Enter в поле ввода и под модалкой — не подтверждает', async () => {
    const { a, b } = await scene(1, 1)
    renderHarness()
    st().selectObjects(a, false)
    await act(async () => { await mode().pressCsgOperation('subtract') })
    act(() => { st().selectObjects(b, false) })
    const input = document.createElement('input')
    document.body.appendChild(input)
    expect(key('Enter', input).defaultPrevented).toBe(false)
    input.remove()
    renderHarness(true)
    expect(key('Enter').defaultPrevented).toBe(false)
    expect(key('Escape').defaultPrevented).toBe(false)
    expect(mode().csgGroupMode).not.toBeNull()
    expect(count()).toBe(2)
  })

  it('объекты A исчезли (undo) — отбрасываются; A пуста — выход из режима', async () => {
    const a1 = await cube(20, 20, at(0))
    const a2 = await cube(20, 20, at(30))
    renderHarness()
    st().selectObjects([a1, a2], false)
    await act(async () => { await mode().pressCsgOperation('subtract') })
    await act(async () => { await st().undo(); await st().undo() })   // move + создание a2
    expect(st().objects[a2]).toBeUndefined()
    expect(mode().csgGroupMode?.groupA).toEqual([a1])
    await act(async () => { await st().undo(); await st().undo() })
    expect(count()).toBe(0)
    expect(mode().csgGroupMode).toBeNull()
  })

  it('«Выровнять» и режим CSG не совмещаются: вход в один выходит из другого', async () => {
    const { a } = await scene(1, 0)
    renderHarness()
    st().selectObjects(a, false)
    act(() => { useAlignModeStore.getState().startAlignMode() })
    await act(async () => { await mode().pressCsgOperation('subtract') })
    expect(mode().csgGroupMode).not.toBeNull()
    expect(useAlignModeStore.getState().alignMode).toBeNull()
    act(() => { useAlignModeStore.getState().startAlignMode() })
    expect(mode().csgGroupMode).toBeNull()
  })

  it('список объектов: «A» у группы A, «B» у выбранных; вне режима меток нет', async () => {
    const { a, b } = await scene(2, 1)
    const renderTree = () => act(() => {
      root.render(
        <ComponentTree objects={Object.values(st().objects)} selectedIds={new Set(st().selectedIds)}
          onSelect={() => {}} onRename={() => {}} onToggleVis={() => {}} onDelete={() => {}} />,
      )
    })
    renderTree()
    expect(host.querySelectorAll('[data-testid=ct-csg-group]')).toHaveLength(0)
    st().selectObjects(a, false)
    mode().startCsgGroup('subtract')
    st().selectObjects(b, false)
    renderTree()
    const badges = Array.from(host.querySelectorAll<HTMLElement>('[data-testid=ct-csg-group]'))
    const byId = Object.fromEntries(badges.map((x) => [x.closest<HTMLElement>('[data-object-id]')!.dataset.objectId, x.dataset.group]))
    expect(byId).toEqual({ [a[0]]: 'a', [a[1]]: 'a', [b[0]]: 'b' })
  })
})

describe('csgButtonStates', () => {
  const objs = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { id } as SceneObject]))
  const all = objs(['a', 'b', 'c'])
  it('вне режима: объединение — от 2, вычитание / пересечение — от 1 выбранного', () => {
    expect(csgButtonStates([], all, null)).toEqual({
      union: { disabled: true, active: false }, subtract: { disabled: true, active: false }, intersect: { disabled: true, active: false },
    })
    expect(csgButtonStates(['a'], all, null).subtract.disabled).toBe(false)
    expect(csgButtonStates(['a'], all, null).union.disabled).toBe(true)
    expect(csgButtonStates(['a', 'gone'], all, null).union.disabled).toBe(true)
    expect(csgButtonStates(['a', 'b'], all, null).union.disabled).toBe(false)
  })
  it('в режиме: операция нажата и доступна (с B — ОК, без B — выход); другая — смена; объединение недоступно', () => {
    const m = { active: true as const, operation: 'subtract' as const, groupA: ['a'] }
    expect(csgButtonStates(['a'], all, m)).toEqual({
      union: { disabled: true, active: false }, subtract: { disabled: false, active: true }, intersect: { disabled: false, active: false },
    })
    expect(csgButtonStates(['b', 'c'], all, m).subtract).toEqual({ disabled: false, active: true })
  })
})
