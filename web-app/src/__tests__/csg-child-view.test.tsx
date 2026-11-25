// ============================================================
// csg-child-view.test.tsx — CSG-CHILD-VIEW: окно ребёнка CSG
// ============================================================
// Открывается при выбранном ребёнке; показывает меш ребёнка и каркас всего CSG;
// правка CSG (новые вершины корня) пересобирает ребёнка; × закрывает окно.
// WebGL не нужен: сцена заменена заглушкой, история — моком.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import ChildView from '../components/ChildView'
import { useUiStore } from '../store/ui-store'
import { useDocumentStore } from '../store/document-store'
import type { SceneObject } from '../csg/types'

const hoisted = vi.hoisted(() => ({
  sceneProps: [] as Array<{ child: { vertices: Float32Array; indices: Uint32Array } | null; root: { vertices: Float32Array; indices: Uint32Array } | null }>,
  rebuild: vi.fn(),
}))

vi.mock('../components/ChildViewScene', () => ({
  default: (p: { child: unknown; root: unknown }) => {
    hoisted.sceneProps.push(p as never)
    return null
  },
}))

vi.mock('../csg/history-tree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../csg/history-tree')>()
  return {
    ...actual,
    getNode: () => ({
      id: 'node_1', type: 'primitive', shapeType: 'cylinder',
      params: { radius: 5, height: 10 }, relativeToParent: null,
    }),
    rebuildNodeForView: (...args: unknown[]) => hoisted.rebuild(...args),
  }
})

beforeAll(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await i18n.changeLanguage('ru')
})

let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null; host?.remove(); host = null
})

const csgObject = (verts: number[]): SceneObject => ({
  id: 'root_1',
  shapeType: 'csg',
  params: {},
  color: '#89b4fa',
  transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  visible: true,
  locked: false,
  vertices: new Float32Array(verts),
  indices: new Uint32Array([0, 1, 2]),
})

const render = async (): Promise<void> => {
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => {
    root!.render(<ChildView />)
  })
  await act(async () => { await Promise.resolve() })
}

beforeEach(() => {
  hoisted.sceneProps.length = 0
  hoisted.rebuild.mockReset()
  hoisted.rebuild.mockResolvedValue({
    vertices: new Float32Array([0, 0, 0, 5, 0, 0, 0, 5, 0]),
    indices: new Uint32Array([0, 1, 2]),
    normals: null,
  })
  useUiStore.setState({ selectedChild: null, childViewOpen: true })
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
})

describe('CSG-CHILD-VIEW', () => {
  it('открывается при выбранном ребёнке и показывает тип/параметры', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: { root_1: csgObject([0, 0, 0, 10, 0, 0, 0, 10, 0]) } })
    await render()
    const view = host!.querySelector('[data-testid=child-view]')
    expect(view).toBeTruthy()
    expect(view!.getAttribute('data-node-id')).toBe('node_1')
    expect(view!.textContent).toContain('Ребёнок CSG')
    expect(view!.textContent).toContain('Цилиндр')
  })

  it('показывает только ребёнка (сцена) + каркас всего CSG', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: { root_1: csgObject([0, 0, 0, 10, 0, 0, 0, 10, 0]) } })
    await render()
    expect(hoisted.sceneProps.length).toBe(1)
    const p = hoisted.sceneProps[0]
    expect(p.child!.vertices.length).toBe(9)                 // меш ребёнка из Build Tree
    expect(p.root!.vertices.length).toBe(9)                  // каркас всего CSG
  })

  it('правка CSG (новые вершины корня) → ребёнок пересобран', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: { root_1: csgObject([0, 0, 0, 10, 0, 0, 0, 10, 0]) } })
    await render()
    expect(hoisted.rebuild).toHaveBeenCalledTimes(1)
    await act(async () => {
      useDocumentStore.setState({ objects: { root_1: csgObject([0, 0, 0, 20, 0, 0, 0, 20, 0]) } })
    })
    await act(async () => { await Promise.resolve() })
    expect(hoisted.rebuild).toHaveBeenCalledTimes(2)
  })

  it('× закрывает окно (выбор ребёнка остаётся)', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: { root_1: csgObject([0, 0, 0, 10, 0, 0, 0, 10, 0]) } })
    await render()
    const close = host!.querySelector<HTMLButtonElement>('[data-testid=child-view-close]')!
    await act(async () => { close.click() })
    expect(useUiStore.getState().childViewOpen).toBe(false)
    expect(useUiStore.getState().selectedChild).toEqual({ rootId: 'root_1', nodeId: 'node_1' })
    expect(host!.querySelector('[data-testid=child-view]')).toBeNull()
  })
})
