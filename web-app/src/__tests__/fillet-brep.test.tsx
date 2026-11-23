// ============================================================
// fillet-brep.test.tsx — FILLET-CHAMFER-BREP: выбор ребра, панель, шаг
// ============================================================
// jsdom без WebGL: raycast по LineSegments (чистая функция), панель режима
// и патч размера шага `fillet_brep`.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import React from 'react'
import * as THREE from 'three'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import BrepPanel from '../components/BrepPanel'
import { brepSizePatchWith } from '../components/StepPanel'
import { pickBrepEdgeIndex } from '../brep/edge-pick'
import { useBrepModeStore } from '../store/brep-mode'
import type { BrepEdgeLine } from '../brep/brep-kernel'

beforeAll(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  await i18n.changeLanguage('ru')
})

let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(() => {
  if (root) act(() => root!.unmount())
  root = null
  host?.remove()
  host = null
  useBrepModeStore.getState().cancel()
})

const edge = (index: number, points: number[]): BrepEdgeLine => ({ index, points })

describe('Выбор ребра (raycast, edgeId)', () => {
  it('луч из камеры попадает в линию ребра — индекс из userData', () => {
    const lines: THREE.LineSegments[] = []
    const add = (idx: number, a: [number, number, number], b: [number, number, number]) => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b], 3))
      const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial())
      line.userData.brepEdgeIndex = idx
      lines.push(line)
    }
    add(3, [-5, 0, 0], [5, 0, 0])
    add(7, [0, 5, 0], [0, 15, 0])
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 20)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    expect(pickBrepEdgeIndex(ray, lines)).toBe(3)
  })

  it('луч мимо линий — null', () => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([-5, 5, 0, 5, 5, 0], 3))
    const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial())
    line.userData.brepEdgeIndex = 1
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 0, 20)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    expect(pickBrepEdgeIndex(ray, [line])).toBeNull()
  })
})

describe('Панель режима B-Rep', () => {
  it('«Скругление»: рёбра, выбранное ребро, радиус, «Применить»', async () => {
    useBrepModeStore.setState({
      active: 'fillet', targetId: 'obj_1', base: { shapeType: 'cube', params: { width: 20 } },
      transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
      edges: [edge(0, [-5, 0, 0, 5, 0, 0]), edge(1, [0, -5, 0, 0, 5, 0])],
      selectedEdge: 0, hoverEdge: null, size: 2, loading: false,
    })
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    act(() => { root!.render(<BrepPanel />) })
    expect(host.querySelector('[data-testid=brep-panel]')!.getAttribute('data-brep-kind')).toBe('fillet')
    expect(host.querySelector('[data-testid=brep-edge]')!.textContent).toContain('1')
    expect(host.querySelector<HTMLButtonElement>('[data-testid=brep-apply]')!.disabled).toBe(false)
  })

  it('Chamfer: подпись «Размер», без выбора ребра «Применить» недоступно', () => {
    useBrepModeStore.setState({
      active: 'chamfer', targetId: 'obj_1', base: { shapeType: 'cube', params: { width: 20 } },
      transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
      edges: [edge(0, [-5, 0, 0, 5, 0, 0])],
      selectedEdge: null, hoverEdge: null, size: 2, loading: false,
    })
    host = document.body.appendChild(document.createElement('div'))
    root = createRoot(host)
    act(() => { root!.render(<BrepPanel />) })
    expect(host.querySelector('[data-testid=brep-panel]')!.getAttribute('data-brep-kind')).toBe('chamfer')
    expect(host.querySelector<HTMLButtonElement>('[data-testid=brep-apply]')!.disabled).toBe(true)
  })
})

describe('Шаг fillet_brep — патч размера', () => {
  it('то же значение — null; новое — патч', () => {
    expect(brepSizePatchWith(2, 2)).toBeNull()
    expect(brepSizePatchWith(2, 0)).toBeNull()
    expect(brepSizePatchWith(2, 3)).toEqual({ kind: 'fillet_brep', size: 3 })
  })
})
