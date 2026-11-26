// ============================================================
// child-view-copy.test.tsx — CHILD-VIEW-COPY: копия основного вида
// ============================================================
// Окно ребёнка — та же сцена/координаты и камера, что в основном виде;
// ребёнок реалистичный, остальной CSG и другие объекты — каркасом;
// OrbitControls — свободная навигация.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import React from 'react'
import * as THREE from 'three'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import ChildView from '../components/ChildView'
import { CHILD_VIEW_CONTROLS, snapshotMainView } from '../components/child-view'
import { useUiStore } from '../store/ui-store'
import { useDocumentStore } from '../store/document-store'
import type { SceneObject } from '../csg/types'

const hoisted = vi.hoisted(() => ({ sceneProps: [] as Array<Record<string, unknown>>, rebuild: vi.fn() }))

vi.mock('../components/ChildViewScene', () => ({
  default: (p: Record<string, unknown>) => { hoisted.sceneProps.push(p); return null },
}))
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

const obj = (id: string, shapeType: SceneObject['shapeType'], x: number, color = '#89b4fa'): SceneObject => ({
  id, shapeType, params: shapeType === 'csg' ? {} : { radius: 10, height: 24 },
  color,
  transform: { x, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
  visible: true, locked: false,
  vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]),
  indices: new Uint32Array([0, 1, 2]),
})

beforeEach(() => {
  hoisted.sceneProps.length = 0
  hoisted.rebuild.mockReset()
  hoisted.rebuild.mockResolvedValue({
    vertices: new Float32Array([-5, 0, 0, 5, 0, 0, 0, 5, 0]),
    indices: new Uint32Array([0, 1, 2]),
    normals: null,
  })
  useUiStore.setState({ selectedChild: null, childViewOpen: true })
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
})

const render = async (mainCamera: THREE.Camera | null, mainTarget: THREE.Vector3 | null) => {
  host = document.body.appendChild(document.createElement('div'))
  root = createRoot(host)
  await act(async () => {
    root!.render(<ChildView mainCamera={mainCamera} mainTarget={mainTarget} />)
  })
  await act(async () => { await Promise.resolve() })
}

describe('CHILD-VIEW-COPY', () => {
  it('та же сцена: корень и остальные объекты — в своих координатах, без offset', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: {
      root_1: obj('root_1', 'csg', 30),
      cube_2: obj('cube_2', 'cube', -40, '#a6e3a1'),
    } })
    await render(null, null)
    const p = hoisted.sceneProps[0] as {
      root: { transform: { x: number } }; others: Array<{ id: string; transform: { x: number } }>; child: unknown
    }
    expect(p.root.transform.x).toBe(30)
    expect(p.others.map((o) => o.id)).toEqual(['cube_2'])
    expect(p.others[0].transform.x).toBe(-40)
    expect(p.child).toBeTruthy()
  })

  it('выбранный ребёнок — реалистичный меш (отдельно от корневого каркаса)', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: { root_1: obj('root_1', 'csg', 0) } })
    await render(null, null)
    const p = hoisted.sceneProps[0] as { child: { vertices: Float32Array } | null; root: { vertices: Float32Array } | null; color?: string }
    expect(p.child?.vertices.length).toBe(9)
    expect(p.root?.vertices.length).toBeGreaterThan(0)
    expect(p.color).toBe('#89b4fa')
  })

  it('остальные объекты сцены — в списке others (каркас)', async () => {
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: {
      root_1: obj('root_1', 'csg', 0),
      cube_2: obj('cube_2', 'cube', 50),
      sphere_3: obj('sphere_3', 'sphere', -50),
    } })
    await render(null, null)
    const p = hoisted.sceneProps[0] as { others: Array<{ id: string }> }
    expect(p.others.map((o) => o.id).sort()).toEqual(['cube_2', 'sphere_3'])
  })

  it('камера — снимок основной (позиция/цель/up), без отдельной центровки', async () => {
    const cam = new THREE.PerspectiveCamera(50, 1.4, 0.1, 5000)
    cam.position.set(140, -90, 70)
    cam.up.set(0, 0, 1)
    const target = new THREE.Vector3(25, 10, -5)
    useUiStore.setState({ selectedChild: { rootId: 'root_1', nodeId: 'node_1' } })
    useDocumentStore.setState({ objects: { root_1: obj('root_1', 'csg', 0) } })
    await render(cam, target)
    const p = hoisted.sceneProps[0] as { mainCamera: THREE.Camera; mainTarget: THREE.Vector3 }
    expect(p.mainCamera).toBe(cam)
    expect(p.mainTarget).toBe(target)
    const snap = snapshotMainView(cam, { x: target.x, y: target.y, z: target.z })
    expect(snap.position).toEqual({ x: 140, y: -90, z: 70 })
    expect(snap.target).toEqual({ x: 25, y: 10, z: -5 })
  })

  it('OrbitControls — вращение/зум/панорама, как в основном виде', () => {
    expect(CHILD_VIEW_CONTROLS).toMatchObject({
      enableRotate: true, enableZoom: true, enablePan: true, enableDamping: true,
    })
  })
})
