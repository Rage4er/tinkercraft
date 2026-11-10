// ============================================================
// ux-polish.test.tsx — ux-polish: CSG-GROUP-UI, CLEANUP-TREE-SNAPSHOT, SHADOW-BOUNDS-400, DIMENSION-UNDO
// ============================================================
// CSG-GROUP-UI: кнопки CSG (объединение / вычитание / пересечение) — в тулбаре (с CSG-GROUP-FIX),
// в режиме нажата кнопка его операции; во вьюпорте группа A — тёплая кайма (+ тёплая подсветка),
// группа B (выделение) — холодная синяя. CLEANUP-TREE-SNAPSHOT: снимков дерева больше нет (писались на
// каждом шаге, не читались) — undo / redo перестраивают дерево из операций: на каждом шаге назад и вперёд
// объекты и дерево — как были (реальный WASM). SHADOW-BOUNDS-400: область теней и приёмник следуют за
// видом (было ±200 мм у начала координат), размер — по отдалению; свет — то же направление.
// DIMENSION-UNDO: удалил размер → Ctrl+Z → вернулся (тот же размер, на том же месте списка), Ctrl+Y →
// снова удалён; действия с размерами и шаги документа отменяются в общем порядке.
// Браузер — e2e/ux-polish.mjs.

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
import {
  SHADOW_MIN_HALF, SUN_DIR, applyShadowFrustum, sameShadowFrustum, shadowFrustumFor, shadowHalfFor,
} from '../components/shadow-follow'
import { clearTree, getNode } from '../csg/history-tree'
import { useDimensionsStore } from '../store/dimensions-store'
import { useDimensionModeStore, createDimension, deleteDimension, restyleDimension } from '../store/dimension-mode'
import { undoWithDimensions, redoWithDimensions, canUndoDimension, canRedoDimension } from '../store/dimension-undo'

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

describe('SHADOW-BOUNDS-400 — тени там, где смотрит камера', () => {
  const MAP = 4096
  /** Солнце и приёмник, как во вьюпорте; область применена. */
  function rig(target: { x: number; y: number; z: number }, dist: number) {
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.castShadow = true
    sun.shadow.mapSize.set(MAP, MAP)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial())
    const f = shadowFrustumFor(target, dist, MAP)
    applyShadowFrustum(sun, ground, 400, f)
    sun.updateMatrixWorld()
    sun.shadow.updateMatrices(sun)
    /** Точка в области теней (NDC камеры тени в −1…1). */
    const inShadowArea = (x: number, y: number, z = 0) => {
      const p = new THREE.Vector3(x, y, z).project(sun.shadow.camera)
      return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z >= -1 && p.z <= 1
    }
    return { sun, ground, f, inShadowArea }
  }

  it('объект за пределами 400 × 400: раньше вне области теней, теперь в ней (область — у центра вида)', () => {
    // прежняя область: ±200 мм у начала координат, солнце (100, −80, 200)
    const old = new THREE.DirectionalLight(); old.position.set(100, -80, 200)
    Object.assign(old.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 0.1, far: 1000 })
    old.shadow.camera.updateProjectionMatrix(); old.updateMatrixWorld(); old.shadow.updateMatrices(old)
    const oldIn = (x: number, y: number) => { const p = new THREE.Vector3(x, y, 0).project(old.shadow.camera); return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 }
    expect(oldIn(0, 0)).toBe(true)
    for (const [x, y] of [[600, 0], [1500, -800], [-2500, 3000]]) {
      expect(oldIn(x, y)).toBe(false)
      const { f, ground, inShadowArea } = rig({ x, y, z: 0 }, 300)
      expect(inShadowArea(x, y)).toBe(true)                            // объект у центра вида — в тени
      expect(inShadowArea(x + 20, y - 20, 20)).toBe(true)              // и его верх
      expect(inShadowArea(x + 150, y + 150)).toBe(true)                 // и окрестность
      expect(Math.hypot(f.center.x - x, f.center.y - y, f.center.z)).toBeLessThan((2 * f.half) / MAP)   // центр — с точностью до текселя
      expect(ground.position.x).toBe(f.center.x)                        // приёмник теней — там же
      expect(ground.position.y).toBe(f.center.y)
      expect(ground.scale.x).toBeCloseTo((2 * f.half) / 400, 9)
    }
  })

  it('отдалили камеру — область теней больше (не меньше ±200 мм, ступенями ×1,25); видимая область покрыта', () => {
    expect(shadowHalfFor(10)).toBe(SHADOW_MIN_HALF)
    expect(shadowHalfFor(200)).toBe(SHADOW_MIN_HALF)
    const ds = [10, 100, 277, 600, 1500, 5000]
    const hs = ds.map(shadowHalfFor)
    for (let i = 0; i < ds.length; i++) {
      expect(hs[i]).toBeGreaterThanOrEqual(Math.max(SHADOW_MIN_HALF, ds[i]))
      expect(hs[i]).toBeLessThan(Math.max(SHADOW_MIN_HALF, ds[i]) * 1.25 + 1e-6)
      if (i) expect(hs[i]).toBeGreaterThanOrEqual(hs[i - 1])
      const k = Math.log(hs[i] / SHADOW_MIN_HALF) / Math.log(1.25)
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9)          // ступени
    }
    // камера на 1500 мм от цели: точки в ±1000 мм вокруг цели — в области теней
    const { inShadowArea } = rig({ x: 300, y: 300, z: 0 }, 1500)
    for (const [dx, dy] of [[1000, 0], [-1000, 0], [0, 1000], [0, -1000], [700, 700]]) expect(inShadowArea(300 + dx, 300 + dy)).toBe(true)
  })

  it('свет — то же направление; смещения в мировых единицах — как при ±200 мм (тени не отрываются и не рябят)', () => {
    for (const d of [100, 1000, 5000]) {
      const { sun, f } = rig({ x: 700, y: -300, z: 0 }, d)
      const dir = sun.position.clone().sub(sun.target.position).normalize()
      expect(dir.distanceTo(SUN_DIR)).toBeLessThan(1e-9)
      expect(f.bias * (f.far - f.near)).toBeCloseTo(-0.002 * 1000, 9)  // depth bias × глубина — 2 мм, как было
      expect(f.normalBias / ((2 * f.half) / MAP)).toBeCloseTo(0.05 / (400 / MAP), 9)   // normal bias на тексель — как было
      expect(sun.shadow.camera.right).toBe(f.half)
      expect(sun.shadow.camera.far).toBe(f.far)
    }
  })

  it('сдвиг вида меньше текселя — область почти не меняется (тени не дрожат); дальше — центр по сетке текселей', () => {
    const a = shadowFrustumFor({ x: 400, y: 100, z: 0 }, 300, MAP)
    const texel = (2 * a.half) / MAP
    // 11 положений вида в пределах полутекселя: центр меняется только на границах ячеек (≤ 1 раз по каждой оси)
    const centers = new Set<string>()
    for (let i = 0; i <= 10; i++) {
      const f = shadowFrustumFor({ x: 400 + texel * 0.05 * i, y: 100, z: 0 }, 300, MAP)
      centers.add(f.center.toArray().map((v) => v.toFixed(6)).join(','))
    }
    expect(centers.size).toBeLessThanOrEqual(4)
    expect(sameShadowFrustum(a, shadowFrustumFor({ x: 400, y: 100, z: 0 }, 300, MAP))).toBe(true)
    const c = shadowFrustumFor({ x: 470, y: 160, z: 0 }, 300, MAP)
    expect(sameShadowFrustum(a, c)).toBe(false)
    expect(sameShadowFrustum(null, a)).toBe(false)
    // центры a и c отличаются на целое число текселей в плоскости света
    const m = new THREE.Matrix4().lookAt(SUN_DIR, new THREE.Vector3(), new THREE.Vector3(0, 1, 0))
    const ax = new THREE.Vector3().setFromMatrixColumn(m, 0), ay = new THREE.Vector3().setFromMatrixColumn(m, 1)
    const d = c.center.clone().sub(a.center)
    const az = new THREE.Vector3().setFromMatrixColumn(m, 2)
    for (const axis of [ax, ay, az]) { const k = d.dot(axis) / texel; expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6) }
  })
})

describe('DIMENSION-UNDO — удалить размер → Ctrl+Z → вернулся, Ctrl+Y → удалён', () => {
  const st = () => useDocumentStore.getState()
  const ds = () => useDimensionsStore.getState()
  function reset(): void {
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false })
    useNotifications.setState({ notifications: [] })
    useDimensionsStore.setState({ dimensions: [], selectedDimensionId: null, undoStack: [], redoStack: [], showDimensions: true })
    useDimensionModeStore.setState({ dimensionMode: null })
    snapshots.clearSnapshots(); clearTree()
  }
  /** Два куба (X = 0 и 25) и размеры между их вершинами. */
  async function twoCubes() {
    reset()
    await st().addShape('cube'); await st().addShape('cube')
    const [a, b] = Object.keys(st().objects)
    const dim = (za: number) => createDimension({ objectId: a, point: { x: 10, y: 10, z: za } }, { objectId: b, point: { x: 15, y: 10, z: za } })!
    return { a, b, dim }
  }
  const ids = () => ds().dimensions.map((d) => d.id)
  /** Ctrl+Z / Ctrl+Y и доступность кнопок «Отменить» / «Повторить» по размерам. */
  const z = () => undoWithDimensions()
  const y = () => redoWithDimensions()
  const canZ = () => canUndoDimension(ds().undoStack, st().historyIndex)
  const canY = () => canRedoDimension(ds().redoStack, st().historyIndex)

  it('удалил → Ctrl+Z — тот же размер на том же месте списка; Ctrl+Y — снова удалён; документ не тронут', async () => {
    const { dim } = await twoCubes()
    const d1 = dim(10), d2 = dim(-10), d3 = dim(0)
    expect(ids()).toEqual([d1.id, d2.id, d3.id])
    useDocumentStore.setState({ modified: false })
    deleteDimension(d2.id)
    expect(ids()).toEqual([d1.id, d3.id])
    expect(canZ()).toBe(true)
    await z()
    expect(ids()).toEqual([d1.id, d2.id, d3.id])                      // вернулся на своё место
    expect(ds().dimensions[1]).toEqual(d2)                              // тот же размер (точки, стиль, отступ)
    expect(st().historyIndex).toBe(2)                                   // шаг документа не отменён
    expect(Object.keys(st().objects)).toHaveLength(2)
    expect(st().modified).toBe(true)
    expect(canY()).toBe(true)
    await y()
    expect(ids()).toEqual([d1.id, d3.id])                              // снова удалён
    await z(); await z()                                                 // удаление, затем создание d3
    expect(ids()).toEqual([d1.id, d2.id])
    await y()
    expect(ids()).toEqual([d1.id, d2.id, d3.id])
  }, 30000)

  it('общий порядок: размер → сдвиг куба → удаление размера; Ctrl+Z ×4 и Ctrl+Y ×4 — в обратном и прямом порядке', async () => {
    const { b, dim } = await twoCubes()
    const d = dim(10)                                                  // позиция документа 2
    await st().moveObject(b, { ...st().objects[b].transform, x: 40 })   // 3
    deleteDimension(d.id)                                               // на позиции 3
    const state = () => `${st().historyIndex}:${ids().join(',')}:${st().objects[b]?.transform.x ?? '-'}`
    const s3del = state()
    await z(); expect(state()).toBe(`3:${d.id}:40`)                     // 1) вернулось удаление
    await z(); expect(state()).toBe(`2:${d.id}:25`)                     // 2) отменён сдвиг
    await z(); expect(state()).toBe('2::25')                            // 3) отменено создание размера
    await z(); expect(state()).toBe('1::-')                             // 4) отменён второй куб
    await y(); expect(state()).toBe('2::25')
    await y(); expect(state()).toBe(`2:${d.id}:25`)
    await y(); expect(state()).toBe(`3:${d.id}:40`)
    await y(); expect(state()).toBe(s3del)
    expect(canY()).toBe(false)
    expect(st().historyIndex).toBe(st().operations.length)              // «Повторить» неактивна
  }, 30000)

  it('стиль: Ctrl+Z — прежний цвет и отступ, Ctrl+Y — новый', async () => {
    const { dim } = await twoCubes()
    const d = dim(10)
    restyleDimension(d.id, { color: '#ff0000', offset: 12 })
    expect(ds().dimensions[0].style.color).toBe('#ff0000')
    await z()
    expect(ds().dimensions[0].style.color).toBe(d.style.color)
    expect(ds().dimensions[0].offset).toBe(d.offset)
    await y()
    expect(ds().dimensions[0].style.color).toBe('#ff0000')
    expect(ds().dimensions[0].offset).toBe(12)
    restyleDimension(d.id, { color: '#ff0000', offset: 12 })            // без изменений — записи нет
    expect(ds().undoStack.map((e) => e.kind)).toEqual(['create', 'restyle'])
  }, 30000)

  it('новый шаг после Ctrl+Z — вернуть удалённый размер Ctrl+Y нельзя; открыт другой документ — стек пуст', async () => {
    const { a, dim } = await twoCubes()
    const d = dim(10)
    deleteDimension(d.id)
    await z()
    expect(canY()).toBe(true)
    await st().moveObject(a, { ...st().objects[a].transform, y: 30 })   // новый шаг документа
    expect(canY()).toBe(false)
    expect(ds().redoStack).toEqual([])
    expect(ids()).toEqual([d.id])
    await y()
    expect(ids()).toEqual([d.id])                                       // Ctrl+Y ничего не сделал с размерами
    // открытие файла / проекта — слой заменён, стек размеров пуст
    deleteDimension(d.id)
    expect(canZ()).toBe(true)
    ds().setDimensions([])
    expect(ds().undoStack).toEqual([])
    expect(canZ()).toBe(false)
  }, 30000)
})
