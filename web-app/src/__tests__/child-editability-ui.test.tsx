// ============================================================
// child-editability-ui.test.tsx — Фаза 9.9: индикатор «правка недоступна»
// ============================================================
// Дерево компонентов (замок + подсказка) и панель ребёнка (сообщение вместо формы).
// Настоящий WASM через worker-bridge: согласованность корня считается по-настоящему.

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
import ComponentTree from '../components/ComponentTree'
import ChildPropertiesPanel from '../components/ChildPropertiesPanel'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, createBakedNode, createPrimitiveNode, createBooleanNode } from '../csg/history-tree'
import { getTreeView } from '../csg/tree-view'
import type { SceneObject, TransformNR } from '../csg/types'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, z = 0): TransformNR => ({ ...ID, x, z })

async function shape(type: 'cube' | 'sphere' | 'cylinder' | 'prism', params: Record<string, number>, t: TransformNR): Promise<string> {
  await st().addShape(type, params)
  const ids = Object.keys(st().objects)
  const id = ids[ids.length - 1]
  await st().moveObject(id, t)
  return id
}
async function csg(a: string, b: string): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean('union')
  return st().selectedIds[0]
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useUiStore.setState({ expandedTreeIds: {}, selectedChild: null })
  clearSnapshots(); clearTree()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

/** Дождаться условия, пока React и воркер-мост доделывают асинхронные эффекты. */
async function until(cond: () => boolean, ms = 4000): Promise<void> {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('until: timeout')
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  }
}

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

async function healthyCsg(): Promise<{ rootId: string; cube: string }> {
  const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
  const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
  return { rootId: await csg(c, s), cube: c }
}

/** Вложенный CSG, сдвинутый до объединения: дерево не воспроизводит меш внешнего корня. */
async function movedNestedCsg(): Promise<{ outer: string; cube: string }> {
  const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
  const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
  const inner = await csg(c, s)
  await st().moveObject(inner, { ...st().objects[inner].transform, x: 60, z: 10 })
  const cyl = await shape('cylinder', { radius: 6, height: 24 }, at(40))
  return { outer: await csg(inner, cyl), cube: c }
}

const locks = () => Array.from(host.querySelectorAll<HTMLElement>('[data-testid=ct-lock]'))

describe('ComponentTree — замок у нередактируемых детей (9.9)', () => {
  it('здоровый CSG: замков нет', async () => {
    const { rootId } = await healthyCsg()
    useUiStore.setState({ expandedTreeIds: { [rootId]: true } })
    renderTree()
    await until(() => host.querySelectorAll('.ct-child').length === 2)
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) }) // проверка согласованности отработала
    expect(locks()).toHaveLength(0)
    expect(host.querySelectorAll('.ct-child.ct-readonly')).toHaveLength(0)
  })

  it('вложенный CSG, сдвинутый до объединения: замок + подсказка с причиной', async () => {
    const { outer } = await movedNestedCsg()
    useUiStore.setState({ expandedTreeIds: { [outer]: true } })
    renderTree()
    await until(() => locks().length > 0)

    const lock = locks()[0]
    expect(lock.dataset.reason).toBe('nested_moved')
    const expected = `${i18n.t('tree.child_not_editable')}: ${i18n.t('tree.reason.nested_moved')}`
    expect(lock.title).toBe(expected)
    // строка ребёнка тоже несёт подсказку и класс «только чтение»
    const row = lock.closest('.ct-child') as HTMLElement
    expect(row.title).toBe(expected)
    expect(row.classList.contains('ct-readonly')).toBe(true)
    // вложенная операция (контейнер) замка не получает
    const nestedRow = Array.from(host.querySelectorAll('.ct-child')).find((r) => r.querySelector('.ct-chevron'))
    expect(nestedRow?.querySelector('[data-testid=ct-lock]')).toBeNull()
  })

  it('запечённый ребёнок: замок с причиной baked (статическая причина приоритетнее проверки корня)', async () => {
    createBakedNode('b1', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2]), null, ID)
    createPrimitiveNode('p1', 'cube', { width: 5, height: 5, depth: 5 }, ID)
    createBooleanNode('r1', 'union', 'p1', 'b1', ID)
    const fake: SceneObject = {
      id: 'r1', shapeType: 'csg', params: {}, color: '#fff', transform: ID, visible: true, locked: false,
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]),
    }
    useDocumentStore.setState({ objects: { r1: fake }, selectedIds: ['r1'] })
    useUiStore.setState({ expandedTreeIds: { r1: true } })
    renderTree()
    await until(() => host.querySelectorAll('.ct-child').length === 2)
    const bakedRow = host.querySelector('[data-node-id=b1]') as HTMLElement
    const lock = bakedRow.querySelector<HTMLElement>('[data-testid=ct-lock]')
    expect(lock?.dataset.reason).toBe('baked')
    expect(lock?.title).toContain(i18n.t('tree.reason.baked'))
  })
})

async function mirroredCsg(): Promise<{ rootId: string; mirrored: string }> {
  await st().addShape('prism', { radius: 10, height: 20, sides: 5 })
  const prism = Object.keys(st().objects)[0]
  await st().moveObject(prism, at(30))
  useDocumentStore.setState({ selectedIds: [prism] })
  await st().mirrorSelected('YZ')
  const mirrored = Object.keys(st().objects).find((k) => k !== prism)!
  const s = await shape('sphere', { radius: 9, segments: 32 }, at(-24))
  return { rootId: await csg(mirrored, s), mirrored }
}

describe('9.8 — зеркальный примитив редактируем: ни замка, ни сообщения', () => {
  it('дерево: зеркальный ребёнок без замка, помечен «зеркало»', async () => {
    const { rootId, mirrored } = await mirroredCsg()
    useUiStore.setState({ expandedTreeIds: { [rootId]: true } })
    renderTree()
    await until(() => host.querySelectorAll('.ct-child').length === 2)
    await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
    expect(locks()).toHaveLength(0)
    const row = host.querySelector(`[data-node-id=${mirrored}]`) as HTMLElement
    expect(row.textContent).toContain(i18n.t('componentTree.mirroredShort'))
    expect(row.classList.contains('ct-readonly')).toBe(false)
  })

  it('панель: форма параметров (R/H/грани), сообщения нет', async () => {
    const { rootId, mirrored } = await mirroredCsg()
    useDocumentStore.setState({ selectedIds: [rootId] })
    useUiStore.setState({ selectedChild: { rootId, nodeId: mirrored } })
    act(() => { root.render(<ChildPropertiesPanel />) })
    await until(() => host.querySelector('[data-testid=child-check]') === null)
    expect(host.querySelector('[data-testid=child-not-editable]')).toBeNull()
    expect(host.querySelector('[data-testid=child-form]')).not.toBeNull()
    expect(host.querySelectorAll('input.props-input')).toHaveLength(3)
  })
})

describe('ChildPropertiesPanel — сообщение вместо формы (9.9)', () => {
  function renderPanel(rootId: string, nodeId: string): void {
    useDocumentStore.setState({ selectedIds: [rootId] })
    useUiStore.setState({ selectedChild: { rootId, nodeId } })
    act(() => { root.render(<ChildPropertiesPanel />) })
  }

  it('редактируемый ребёнок: форма, сообщения нет', async () => {
    const { rootId, cube } = await healthyCsg()
    renderPanel(rootId, cube)
    await until(() => host.querySelector('[data-testid=child-check]') === null)
    expect(host.querySelector('[data-testid=child-form]')).not.toBeNull()
    expect(host.querySelector('[data-testid=child-not-editable]')).toBeNull()
    expect(host.querySelectorAll('input.props-input')).toHaveLength(3)
  })

  it('вложенный сдвинутый: сообщение с причиной, формы нет', async () => {
    const { outer, cube } = await movedNestedCsg()
    renderPanel(outer, cube)
    await until(() => host.querySelector('[data-testid=child-not-editable]') !== null)
    const box = host.querySelector<HTMLElement>('[data-testid=child-not-editable]')!
    expect(box.dataset.reason).toBe('nested_moved')
    expect(box.textContent).toContain(i18n.t('properties.not_editable_title'))
    expect(box.textContent).toContain(i18n.t('tree.reason.nested_moved'))
    expect(host.querySelector('[data-testid=child-form]')).toBeNull()
    expect(host.querySelectorAll('input.props-input')).toHaveLength(0)
  })

  it('запечённый ребёнок: сообщение baked сразу (без ожидания проверки), формы нет', async () => {
    createBakedNode('b1', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), new Uint32Array([0, 1, 2]), null, ID)
    createPrimitiveNode('p1', 'cube', { width: 5, height: 5, depth: 5 }, ID)
    createBooleanNode('r1', 'union', 'p1', 'b1', ID)
    const fake: SceneObject = {
      id: 'r1', shapeType: 'csg', params: {}, color: '#fff', transform: ID, visible: true, locked: false,
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]),
    }
    useDocumentStore.setState({ objects: { r1: fake } })
    expect(getTreeView('r1')).not.toBeNull()
    renderPanel('r1', 'b1')
    const box = host.querySelector<HTMLElement>('[data-testid=child-not-editable]')
    expect(box?.dataset.reason).toBe('baked')
    expect(host.querySelector('[data-testid=child-form]')).toBeNull()
  })
})
