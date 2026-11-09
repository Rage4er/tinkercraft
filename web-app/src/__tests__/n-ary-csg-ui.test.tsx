// ============================================================
// n-ary-csg-ui.test.tsx — N-ARY-CSG в интерфейсе
// ============================================================
// Дерево компонентов: N детей одного CSG — плоский список; у вычитания A vs B — заголовки
// «Группа A» / «Группа B»; бинарный CSG — без заголовков (как раньше). Кнопок групп нет —
// режим «A → B → Enter» (CSG-GROUP-FIX) — в `csg-group-fix.test.tsx`.
// Настоящий WASM через worker-bridge.

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
import ComponentTree from '../components/ComponentTree'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import type { TransformNR } from '../csg/types'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 5): TransformNR => ({ ...ID, x, y })

async function cube(size: number, h: number, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape('cube', { width: size, height: size, depth: h })
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}

let host: HTMLDivElement
let root: Root

beforeEach(async () => {
  await i18n.changeLanguage('ru')
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useUiStore.setState({ expandedTreeIds: {}, selectedChild: null })
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

function renderTree(): void {
  const { objects, selectedIds } = st()
  act(() => {
    root.render(
      <ComponentTree
        objects={Object.values(objects)}
        selectedIds={new Set(selectedIds)}
        onSelect={() => {}}
        onRename={() => {}}
        onToggleVis={() => {}}
        onDelete={() => {}}
      />,
    )
  })
}
const texts = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel)).map((e) => e.textContent ?? '')

describe('N-ARY-CSG — дерево компонентов', () => {
  it('union 10 → один корень, 10 детей плоским списком (без вложенных CSG и заголовков групп)', async () => {
    const ids: string[] = []
    for (let i = 0; i < 10; i++) ids.push(await cube(10, 10, at(i * 15)))
    st().selectObjects(ids, false)
    await st().csgBoolean('union')
    const rootId = st().selectedIds[0]
    useUiStore.setState({ expandedTreeIds: { [rootId]: true } })
    renderTree()
    expect(host.querySelectorAll('[data-object-id]')).toHaveLength(1)
    const children = Array.from(host.querySelectorAll<HTMLElement>('.ct-child'))
    expect(children.map((c) => c.dataset.nodeId)).toEqual(ids)
    expect(children.every((c) => c.querySelector('.ct-chevron') === null)).toBe(true)   // нечего раскрывать
    expect(host.querySelectorAll('.ct-group-header')).toHaveLength(0)
  })

  it('subtract A(5) vs B(5) → «Группа A» перед 1-м ребёнком, «Группа B» перед 6-м', async () => {
    const a: string[] = [], b: string[] = []
    for (let i = 0; i < 5; i++) a.push(await cube(20, 20, at(i * 30)))
    for (let i = 0; i < 5; i++) b.push(await cube(10, 30, at(i * 30)))
    st().selectObjects([...a, ...b], false)
    await st().csgBoolean('subtract', { a, b })
    const rootId = st().selectedIds[0]
    useUiStore.setState({ expandedTreeIds: { [rootId]: true } })
    renderTree()
    expect(texts('.ct-group-header')).toEqual(['Группа A', 'Группа B'])
    const rows = Array.from(host.querySelectorAll<HTMLElement>('.ct-group-header, .ct-child'))
    const order = rows.map((r) => r.dataset.group ?? r.dataset.nodeId)
    expect(order).toEqual(['a', ...a, 'b', ...b])
  })

  it('бинарное вычитание — без заголовков групп (как раньше)', async () => {
    const a = await cube(20, 20, at(0))
    const b = await cube(10, 30, at(0))
    st().selectObjects([a, b], false)
    await st().csgBoolean('subtract')
    useUiStore.setState({ expandedTreeIds: { [st().selectedIds[0]]: true } })
    renderTree()
    expect(host.querySelectorAll('.ct-child')).toHaveLength(2)
    expect(host.querySelectorAll('.ct-group-header')).toHaveLength(0)
  })
})
