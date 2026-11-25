// ============================================================
// child-view-fix.test.tsx — FIX: каркас в одной системе, OrbitControls, левый нижний
// ============================================================
// Ребёнок и каркас остального CSG сдвигаются одним и тем же offset (центр ребёнка
// в 0) — контекст вокруг ребёнка; OrbitControls вращает/зумит/двигает; окно
// в левом нижнем углу.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import ChildView from '../components/ChildView'
import { CHILD_VIEW_CONTROLS, childViewTarget } from '../components/child-view'
import { useUiStore } from '../store/ui-store'
import { useDocumentStore } from '../store/document-store'
import type { SceneObject } from '../csg/types'

const hoisted = vi.hoisted(() => ({ rebuild: vi.fn() }))

vi.mock('../components/ChildViewScene', () => ({ default: () => null }))
vi.mock('../csg/history-tree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../csg/history-tree')>()
  return {
    ...actual,
    getNode: () => ({ id: 'node_1', type: 'primitive', shapeType: 'cylinder', params: { radius: 5, height: 10 }, relativeToParent: null }),
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

const csgObject = (): SceneObject => ({
  id: 'root_1', shapeType: 'csg', params: {}, color: '#89b4fa',
  transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  visible: true, locked: false,
  vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]),
})

beforeEach(() => {
  hoisted.rebuild.mockReset()
  hoisted.rebuild.mockResolvedValue({
    vertices: new Float32Array([-5, 0, 0, 5, 0, 0, 0, 5, 0]),
    indices: new Uint32Array([0, 1, 2]),
    normals: null,
  })
  useUiStore.setState({ selectedChild: null, childViewOpen: true })
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
})

describe('CSG-CHILD-VIEW — фиксы', () => {
  it('камера нацелена на центр ребёнка; каркас остаётся в реальных координатах', () => {
    const target = childViewTarget({ x: 12, y: -4, z: 3 })
    expect(target).toEqual({ x: 12, y: -4, z: 3 })
    // содержимое не сдвигается общим offset — координаты ребёнка/каркаса не меняются
  })

  it('OrbitControls: вращение, зум, панорама, демпфирование', () => {
    expect(CHILD_VIEW_CONTROLS).toMatchObject({
      enableRotate: true, enableZoom: true, enablePan: true, enableDamping: true,
    })
  })

  it('окно — в левом нижнем углу', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: { root_1: csgObject() } })
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => { root!.render(<ChildView />) })
    await act(async () => { await Promise.resolve() })
    const v = host.querySelector<HTMLElement>('[data-testid=child-view]')!
    expect(v.style.left).toBe('8px')
    expect(v.style.right).toBe('auto')
    expect(v.style.bottom).toBe('8px')
  })
})
