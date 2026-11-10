// ============================================================
// ux-polish.test.tsx — ux-polish: CSG-GROUP-UI, CLEANUP-TREE-SNAPSHOT, SHADOW-BOUNDS-400, DIMENSION-UNDO
// ============================================================
// CSG-GROUP-UI: кнопки CSG (объединение / вычитание / пересечение) — в тулбаре (с CSG-GROUP-FIX),
// в режиме нажата кнопка его операции; во вьюпорте группа A — тёплая кайма (+ тёплая подсветка),
// группа B (выделение) — холодная синяя. CLEANUP-TREE-SNAPSHOT: снимков дерева больше нет (писались на
// каждом шаге, не читались) — undo / redo перестраивают дерево из операций: на каждом шаге назад и вперёд
// объекты и дерево — как были (реальный WASM). Браузер — e2e/ux-polish.mjs.

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

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

import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import * as THREE from 'three'
import i18n from '../i18n'
import Toolbar from '../components/Toolbar'
import {
  GROUP_A_OUTLINE, SELECTION_OUTLINE, DRAW_OVER_OUTLINE, SelectionOutlinePass, renderWithSelectionOutline, selectionOutlineTargets,
} from '../components/selection-outline'
import type { CsgOpButtonStates } from '../store/csg-group-mode'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import * as snapshots from '../store/snapshots'
import { clearTree, getNode } from '../csg/history-tree'

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!('ResizeObserver' in globalThis)) {
    class RO { observe(): void {} unobserve(): void {} disconnect(): void {} }
    ;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO
  }
})

let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null
  vi.restoreAllMocks()
})

const noop = (): void => {}

describe('CSG-GROUP-UI — кнопки CSG в тулбаре', () => {
  async function renderToolbar(opStates: CsgOpButtonStates, onCsg: (op: 'union' | 'subtract' | 'intersect') => void) {
    await i18n.changeLanguage('ru')
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root!.render(
        <Toolbar
          objectCount={4} selectedCount={2} canUndo canRedo hasCopied busy={false} workerOk
          cameraMode="perspective" gizmoMode="none" rulerActive={false} dimensionActive={false} dimensionsVisible
          canMirror canAlign canCsg csgOpStates={opStates} theme="dark"
          onOpen={noop} onSave={noop} onExportStl={noop} onImportStl={noop} onShowProjects={noop}
          onUndo={noop} onRedo={noop} onCopy={noop} onPaste={noop} onDelete={noop}
          onFitView={noop} onResetView={noop} onToggleCamera={noop} onGizmo={noop} onToggleRuler={noop}
          onDimensionMode={noop} onDimensionSettings={noop} onToggleDimensions={noop}
          onMirror={noop} onPreviewMirror={noop} onPreviewMirrorEnd={noop}
          alignActive={false} onAlignMode={noop} onCsg={onCsg} onToggleTheme={noop} onClearScene={noop}
        />,
      )
    })
    const byName = (key: string) => host!.querySelector<HTMLButtonElement>(`[role="toolbar"] button[aria-label="${i18n.t(key)}"]`)
    return { union: byName('csg.union'), subtract: byName('csg.subtract'), intersect: byName('csg.intersect') }
  }

  it('три кнопки CSG в тулбаре; клик — операция; в режиме вычитания нажата «Вычитание»', async () => {
    const onCsg = vi.fn()
    const states: CsgOpButtonStates = {
      union: { disabled: true, active: false },
      subtract: { disabled: false, active: true },
      intersect: { disabled: false, active: false },
    }
    const b = await renderToolbar(states, onCsg)
    expect(b.union).not.toBeNull()
    expect(b.subtract).not.toBeNull()
    expect(b.intersect).not.toBeNull()
    expect(b.subtract!.className).toContain('active')
    expect(b.intersect!.className).not.toContain('active')
    expect(b.union!.disabled).toBe(true)
    act(() => { b.subtract!.click() })
    act(() => { b.intersect!.click() })
    expect(onCsg.mock.calls.map((c) => c[0])).toEqual(['subtract', 'intersect'])
  })

  it('вне режима: объединение и вычитание доступны, ни одна не нажата', async () => {
    const onCsg = vi.fn()
    const off = { disabled: false, active: false }
    const b = await renderToolbar({ union: off, subtract: off, intersect: off }, onCsg)
    for (const btn of [b.union, b.subtract, b.intersect]) {
      expect(btn!.disabled).toBe(false)
      expect(btn!.className).not.toContain('active')
    }
    act(() => { b.union!.click() })
    expect(onCsg).toHaveBeenCalledWith('union')
  })
})

describe('CSG-GROUP-UI — подсветка групп A / B во вьюпорте', () => {
  type Entry = { mesh: THREE.Mesh; pivot: THREE.Object3D }
  function makeScene(ids: string[]) {
    const scene = new THREE.Scene()
    const map = new Map<string, Entry>()
    for (const id of ids) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial())
      const pivot = new THREE.Object3D(); pivot.add(mesh); scene.add(pivot)
      map.set(id, { mesh, pivot })
    }
    const gizmo = new THREE.Object3D(); gizmo.userData[DRAW_OVER_OUTLINE] = true; scene.add(gizmo)
    return { scene, map, camera: new THREE.PerspectiveCamera(45, 1.5, 0.1, 10000) }
  }

  it('A — тёплая кайма, B — холодная (синяя): цвета различимы', () => {
    const warm = new THREE.Color(GROUP_A_OUTLINE.color)
    const cold = new THREE.Color(SELECTION_OUTLINE.color)
    expect(warm.r).toBeGreaterThan(warm.b + 0.5)
    expect(cold.b).toBeGreaterThan(cold.r + 0.5)
    const { scene, camera } = makeScene([])
    const passA = new SelectionOutlinePass(800, 600, scene, camera, GROUP_A_OUTLINE)
    expect(passA.visibleEdgeColor.getHex()).toBe(GROUP_A_OUTLINE.color)
    expect(passA.hiddenEdgeColor.getHex()).toBe(GROUP_A_OUTLINE.hiddenColor)
    expect(new SelectionOutlinePass(800, 600, scene, camera).visibleEdgeColor.getHex()).toBe(SELECTION_OUTLINE.color)
  })

  it('режим A → B: кайма A у группы A, кайма B у выделенных; кадр — сцена, A, B, накладки', () => {
    const { scene, map, camera } = makeScene(['a1', 'a2', 'b1', 'b2', 'x'])
    const passA = new SelectionOutlinePass(800, 600, scene, camera, GROUP_A_OUTLINE)
    const passB = new SelectionOutlinePass(800, 600, scene, camera)
    const log: string[] = []
    vi.spyOn(passA, 'render').mockImplementation(() => { log.push(`A(${passA.selectedObjects.length})`) })
    vi.spyOn(passB, 'render').mockImplementation(() => { log.push(`B(${passB.selectedObjects.length})`) })
    const gl = {
      autoClear: true, shadowMap: { autoUpdate: true },
      render: (o: THREE.Object3D) => { log.push(o instanceof THREE.Scene ? 'scene' : 'overlay') },
    } as unknown as THREE.WebGLRenderer
    selectionOutlineTargets(new Set(['a1', 'a2']), map, passA.selectedObjects)
    selectionOutlineTargets(new Set(['b1', 'b2']), map, passB.selectedObjects)
    expect(passA.selectedObjects).toEqual([map.get('a1')!.mesh, map.get('a2')!.mesh])
    expect(passB.selectedObjects).toEqual([map.get('b1')!.mesh, map.get('b2')!.mesh])
    expect(renderWithSelectionOutline(gl, scene, camera, [passA, passB])).toBe(true)
    expect(log).toEqual(['scene', 'A(2)', 'B(2)', 'overlay'])

    // B ещё не выбрана — только кайма A
    log.length = 0
    selectionOutlineTargets(new Set(), map, passB.selectedObjects)
    expect(renderWithSelectionOutline(gl, scene, camera, [passA, passB])).toBe(true)
    expect(log).toEqual(['scene', 'A(2)', 'overlay'])

    // режим закончился (группы A нет), ничего не выделено — обычный кадр
    log.length = 0
    selectionOutlineTargets(new Set(), map, passA.selectedObjects)
    expect(renderWithSelectionOutline(gl, scene, camera, [passA, passB])).toBe(false)
    expect(log).toEqual(['scene'])
  })
})

describe('CLEANUP-TREE-SNAPSHOT — undo / redo без снимков дерева', () => {
  const st = () => useDocumentStore.getState()
  function reset(): void {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    useNotifications.setState({ notifications: [] })
    snapshots.clearSnapshots(); clearTree()
  }
  const r = (v: number) => Math.round(v * 1000) / 1000
  /** Состояние сцены и дерева: объекты (тип, трансформ, число вершин) + узлы дерева (тип, params, дети). */
  function signature(): string {
    const objs = Object.values(st().objects).sort((a, b) => a.id.localeCompare(b.id)).map((o) => {
      const t = o.transform
      return [o.id, o.shapeType, r(t.x), r(t.y), r(t.z), r(t.rotZ), r(t.scaleX), o.vertices.length, o.indices.length].join(':')
    })
    const roots = Object.values(st().objects).filter((o) => o.shapeType === 'csg').map((o) => {
      const node = getNode(o.id)
      const kids = (node?.children ?? []).map((k) => { const n = getNode(k); return `${k}=${n?.type}${JSON.stringify(n?.params ?? {})}` })
      return `${o.id}<${node?.operation}|${kids.join(',')}>`
    })
    return [...objs, ...roots].join(' ; ')
  }

  it('снимков дерева нет: модуль снимков — только объекты (запись, чтение, очистка)', () => {
    expect(Object.keys(snapshots).sort()).toEqual(['cacheSnapshot', 'clearSnapshots', 'getCachedSnapshot'])
  })

  it('куб − сфера, правка ребёнка, сдвиг, цилиндр: каждый шаг назад и вперёд — объекты и дерево как были', async () => {
    reset()
    const sig: string[] = [signature()]
    await st().addShape('cube'); sig.push(signature())
    await st().addShape('sphere'); sig.push(signature())
    const [cube, sphere] = Object.keys(st().objects)
    await st().csgBoolean('subtract', { a: [cube], b: [sphere] }); sig.push(signature())
    const root = Object.keys(st().objects)[0]
    const kids = getNode(root)!.children!
    await st().editChildParams(root, kids[1], { radius: 15, segments: 32 }); sig.push(signature())
    await st().moveObject(root, { ...st().objects[root].transform, x: 30, rotZ: 45 }); sig.push(signature())
    await st().addShape('cylinder'); sig.push(signature())
    expect(st().historyIndex).toBe(sig.length - 1)
    expect(getNode(getNode(root)!.children![1])!.params).toMatchObject({ radius: 15 })
    expect(warnings()).toEqual([])

    for (let i = sig.length - 2; i >= 0; i--) {                       // undo по шагу
      await st().undo()
      expect(st().historyIndex).toBe(i)
      expect(signature()).toBe(sig[i])
    }
    for (let i = 1; i < sig.length; i++) {                             // redo по шагу
      await st().redo()
      expect(st().historyIndex).toBe(i)
      expect(signature()).toBe(sig[i])
    }
    // без кэша объектов (перестроение через WASM — путь, где раньше тоже писался снимок дерева)
    snapshots.clearSnapshots()
    for (let i = sig.length - 2; i >= sig.length - 4; i--) {
      await st().undo()
      expect(signature()).toBe(sig[i])
    }
    expect(getNode(getNode(root)!.children![1])!.params).toMatchObject({ radius: 12 })   // правка ребёнка откатилась
    await st().redo()
    expect(signature()).toBe(sig[sig.length - 3])
    expect(warnings()).toEqual([])
  }, 60000)

  const warnings = () => useNotifications.getState().notifications.filter((n) => n.type === 'warning' || n.type === 'error').map((n) => n.message)
})
