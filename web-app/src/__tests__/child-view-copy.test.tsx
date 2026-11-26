// ============================================================
// child-view-copy.test.tsx — CHILD-VIEW-COPY: копия основного вида
// ============================================================
// Окно использует основной renderer/scene (не свою сцену): те же координаты и
// объекты; ребёнок — реалистичный, мир — каркасом; камера вписывает сцену;
// OrbitControls — навигация.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import * as THREE from 'three'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import ChildView from '../components/ChildView'
import { CHILD_VIEW_CONTROLS } from '../components/child-view'
import { childViewportRect, fitChildViewCamera, CHILD_VIEW_MATERIALS } from '../components/child-view-render'
import { useUiStore } from '../store/ui-store'
import { useDocumentStore } from '../store/document-store'
import { useChildViewSource } from '../store/child-view-source'
import type { SceneObject } from '../csg/types'

const hoisted = vi.hoisted(() => ({ rebuild: vi.fn() }))
vi.mock('../csg/history-tree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../csg/history-tree')>()
  return {
    ...actual,
    getNode: () => ({ id: 'node_1', type: 'primitive', shapeType: 'cone', params: { radius: 10, height: 24 }, relativeToParent: null }),
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

const obj = (id: string, shapeType: SceneObject['shapeType'], x: number): SceneObject => ({
  id, shapeType, params: { radius: 10, height: 24 }, color: '#89b4fa',
  transform: { x, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  visible: true, locked: false,
  vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
  indices: new Uint32Array([0, 1, 2]),
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
  useChildViewSource.getState().reset()
})

describe('CHILD-VIEW-COPY', () => {
  it('та же сцена: окно берёт основной мир (rootId/меш ребёнка), без своей сцены', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: { root_1: obj('root_1', 'csg', 25), cube_2: obj('cube_2', 'cube', -40) } })
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => { root!.render(<ChildView />) })
    await act(async () => { await Promise.resolve() })
    const src = useChildViewSource.getState()
    expect(src.rootId).toBe('root_1')
    expect(src.child?.vertices.length).toBe(9)
    expect(src.host).toBeTruthy()
    // остальные объекты не дублируются в окне — они уже в основной сцене
    expect((src as unknown as { others?: unknown }).others).toBeUndefined()
  })

  it('ребёнок — реалистичный, мир — каркасом', () => {
    expect(CHILD_VIEW_MATERIALS).toEqual({ child: 'standard', world: 'wireframe' })
  })

  it('fitView: прямоугольник окна и камера вписывает сцену', () => {
    const canvas = { left: 100, top: 50, right: 1400, bottom: 850, width: 1300, height: 800 }
    const win = { left: 120, top: 600, right: 550, bottom: 830, width: 430, height: 230 }
    expect(childViewportRect(canvas, win)).toEqual({ x: 20, y: 20, width: 430, height: 230 })

    const cam = new THREE.PerspectiveCamera(45, 430 / 230, 0.1, 100000)
    const main = new THREE.PerspectiveCamera(45, 1.6, 0.1, 100000)
    main.position.set(150, -200, 120)
    const box = new THREE.Box3(new THREE.Vector3(-30, -10, -10), new THREE.Vector3(40, 10, 20))
    const { center, distance } = fitChildViewCamera(cam, box, main, new THREE.Vector3(0, 0, 0))
    expect(center.x).toBeCloseTo(5, 5)
    expect(distance).toBeGreaterThan(0)
    expect(cam.position.distanceTo(center)).toBeCloseTo(distance, 4)
  })

  it('OrbitControls: вращение/зум/панорама, как в основном виде', () => {
    expect(CHILD_VIEW_CONTROLS).toMatchObject({
      enableRotate: true, enableZoom: true, enablePan: true, enableDamping: true,
    })
  })

  it('закрытие окна очищает источник (основная сцена не трогается)', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: { root_1: obj('root_1', 'csg', 0) } })
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    await act(async () => { root!.render(<ChildView />) })
    await act(async () => { await Promise.resolve() })
    act(() => { host!.querySelector<HTMLButtonElement>('[data-testid=child-view-close]')!.click() })
    expect(useUiStore.getState().childViewOpen).toBe(false)
    expect(useChildViewSource.getState().child).toBeNull()
    expect(useChildViewSource.getState().host).toBeNull()
  })
})
