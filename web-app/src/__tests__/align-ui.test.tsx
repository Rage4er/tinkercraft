// ============================================================
// align-ui.test.tsx — ALIGN-UI-REVIT: режим выравнивания (одна кнопка, плоскость → грань B)
// ============================================================
// jsdom + реальный WASM (worker-bridge). Raycast — настоящий Three.js по мешам в памяти
// (без WebGL): pickFace / planarFaceTriangles.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

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
import * as THREE from 'three'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import Toolbar from '../components/Toolbar'
import AlignPanel from '../components/AlignPanel'
import StatusBar from '../components/StatusBar'
import { pickFace, planarFaceTriangles } from '../components/align-picking'
import { applyTransformToPivot } from '../components/viewport-hooks'
import { useAlignModeStore, alignHintKey } from '../store/align-mode'
import { useAlignModeKeys } from '../hooks/useAlignModeKeys'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { rebuildFromHistory } from '../store/rebuild'
import { worldVerticesAABB, solvePlaneAlignDelta, solveAlignDeltas, worldProjectionRange, computeWorldAABB, axisPlane } from '../store/helpers'
import type { SceneObject, ShapeParams, ShapeType, TransformNR, AlignOperation } from '../csg/types'

const st = () => useDocumentStore.getState()
const am = () => useAlignModeStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })
const box = (o: SceneObject) => worldVerticesAABB(o.vertices, o.transform)
const warnings = () => useNotifications.getState().notifications.filter((n) => n.type === 'warning' || n.type === 'error')
const CUBE10 = { width: 10, height: 10, depth: 10 }
const noop = (): void => {}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!('ResizeObserver' in globalThis)) {
    class RO { observe(): void {} unobserve(): void {} disconnect(): void {} }
    ;(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO
  }
})

let root: Root | null = null
let host: HTMLDivElement | null = null
function mount(el: React.ReactElement): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(el))
  return host
}
beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  useAlignModeStore.setState({ alignMode: null })
  clearSnapshots(); clearTree()
  await i18n.changeLanguage('ru')
})
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null
})

async function shape(type: ShapeType, params: ShapeParams, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape(type, params)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}

/** Меш Three.js из объекта сцены — как во вьюпорте (geometry = vertices, pivot = transform). */
function meshOf(o: SceneObject): THREE.Mesh {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(o.vertices), 3))
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(o.indices), 1))
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  mesh.userData.objectId = o.id
  const pivot = new THREE.Object3D()
  pivot.add(mesh)
  applyTransformToPivot(pivot, o.transform)
  pivot.updateMatrixWorld(true)
  return mesh
}
/** Луч сверху вниз (−Z) в точку (x, y). */
function rayDown(x: number, y: number): THREE.Raycaster {
  return new THREE.Raycaster(new THREE.Vector3(x, y, 500), new THREE.Vector3(0, 0, -1))
}
function rayFrom(origin: [number, number, number], dir: [number, number, number]): THREE.Raycaster {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize())
}

function renderToolbar(): HTMLButtonElement[] {
  const h = mount(
    <Toolbar
      objectCount={2} selectedCount={2} canUndo canRedo hasCopied busy={false} workerOk
      cameraMode="perspective" gizmoMode="none" rulerActive={false}
      canMirror canAlign alignActive={false} canCsg theme="dark"
      onOpen={noop} onSave={noop} onExportStl={noop} onImportStl={noop} onShowProjects={noop}
      onUndo={noop} onRedo={noop} onCopy={noop} onPaste={noop} onDelete={noop}
      onFitView={noop} onResetView={noop} onToggleCamera={noop} onGizmo={noop} onToggleRuler={noop}
      onMirror={noop} onPreviewMirror={noop} onPreviewMirrorEnd={noop}
      onAlignMode={() => am().startAlignMode()} onCsg={noop} onToggleTheme={noop} onClearScene={noop}
    />,
  )
  return Array.from(h.querySelectorAll<HTMLButtonElement>('[role="toolbar"] button'))
}

describe('ALIGN-UI-REVIT — кнопка и режим', () => {
  it('1. в тулбаре одна кнопка «Выровнять», 9 старых (X мин … Z макс) нет', () => {
    const names = renderToolbar().map((b) => b.getAttribute('aria-label'))
    expect(names.filter((n) => n === 'Выровнять')).toHaveLength(1)
    for (const old of ['X мин', 'X центр', 'X макс', 'Y мин', 'Y центр', 'Y макс', 'Z мин', 'Z центр', 'Z макс']) {
      expect(names).not.toContain(old)
    }
    expect(i18n.exists('align.x_min')).toBe(false)
  })

  it('2. кнопка → startAlignMode: режим активен, плоскости нет; линейка и гизмо выключены', () => {
    useUiStore.getState().setRulerActive(true)
    useUiStore.getState().setGizmoMode('translate')
    const btn = renderToolbar().find((b) => b.getAttribute('aria-label') === 'Выровнять')!
    act(() => btn.click())
    const m = am().alignMode!
    expect(m.active).toBe(true)
    expect(m.plane).toBeNull()
    expect(m.multiple).toBe(false)
    expect(useUiStore.getState().rulerActive).toBe(false)
    expect(useUiStore.getState().gizmoMode).toBe('none')
  })
})

describe('ALIGN-UI-REVIT — raycast по грани', () => {
  it('3. луч → треугольник: мировые нормаль и точка; клик без плоскости → plane = грань A', async () => {
    const a = await shape('cube', CUBE10, at(0, 0, 0, { rotX: 30 }))
    const mesh = meshOf(st().objects[a])
    const pick = pickFace(rayDown(0, 0), [mesh])!
    expect(pick.objectId).toBe(a)
    // верхняя грань куба, повёрнутого на 30° вокруг X: нормаль (0, −sin30, cos30)
    expect(pick.normal.x).toBeCloseTo(0, 5)
    expect(pick.normal.y).toBeCloseTo(-0.5, 5)
    expect(pick.normal.z).toBeCloseTo(Math.cos(Math.PI / 6), 5)
    expect(pick.point.z).toBeCloseTo(5 / Math.cos(Math.PI / 6), 4)
    // вся плоская грань — 2 треугольника
    expect(planarFaceTriangles(mesh, pick.triangleIndex).length).toBe(18)
    am().startAlignMode()
    await am().clickFace(pick)
    expect(am().alignMode!.plane).toEqual({ normal: pick.normal, point: pick.point, objectId: a, triangleIndex: pick.triangleIndex })
  })

  it('3b. промах — null; объекты без objectId пропускаются', () => {
    const g = new THREE.BoxGeometry(10, 10, 10)
    const helper = new THREE.Mesh(g, new THREE.MeshBasicMaterial())
    helper.updateMatrixWorld()
    expect(pickFace(rayDown(0, 0), [helper])).toBeNull()
    expect(pickFace(rayDown(100, 100), [])).toBeNull()
  })

  it('4. панель: кнопка X → plane = { axis: X } (плоскость YZ), радио отмечено', () => {
    am().startAlignMode()
    const h = mount(<AlignPanel />)
    act(() => h.querySelector<HTMLButtonElement>('[data-testid=align-axis-X]')!.click())
    expect(am().alignMode!.plane).toEqual({ axis: 'X' })
    expect(h.querySelector('[data-testid=align-axis-X]')!.getAttribute('aria-checked')).toBe('true')
    expect(h.querySelector('[data-testid=align-plane]')!.textContent).toContain('YZ')
    act(() => h.querySelector<HTMLButtonElement>('[data-testid=align-reset-plane]')!.click())
    expect(am().alignMode!.plane).toBeNull()
  })

  it('9. наведение: setHoveredFace хранит грань; та же грань — состояние не пересоздаётся', () => {
    am().startAlignMode()
    am().setHoveredFace({ objectId: 'a', triangleIndex: 3 })
    const s1 = am().alignMode
    expect(s1!.hoveredFace).toEqual({ objectId: 'a', triangleIndex: 3 })
    am().setHoveredFace({ objectId: 'a', triangleIndex: 3 })
    expect(am().alignMode).toBe(s1)
    am().setHoveredFace(null)
    expect(am().alignMode!.hoveredFace).toBeNull()
  })
})

describe('ALIGN-UI-REVIT — выравнивание B (реальный WASM)', () => {
  it('5. грань A (верх куба) → клик по нижней грани B → B стоит на A (шаг align — ALIGN-PLANE-RESOLVE), уведомлений нет', async () => {
    const a = await shape('cube', CUBE10, at(0, 0, 0))
    const b = await shape('cube', CUBE10, at(30, 0, 17))
    am().startAlignMode()
    await am().clickFace(pickFace(rayDown(0, 0), [meshOf(st().objects[a])])!)            // верх A: z = 5
    const n = st().operations.length
    // нижняя грань B (луч снизу вверх): параллельна A → встаёт в плоскость A
    const pickB = pickFace(rayFrom([30, 0, -100], [0, 0, 1]), [meshOf(st().objects[b])])!
    expect(pickB.normal.z).toBeCloseTo(-1, 5)
    const expected = solvePlaneAlignDelta(st().objects[b], { normal: { x: 0, y: 0, z: 1 }, point: { x: 0, y: 0, z: 5 } }, pickB)
    expect(await am().applyAlignB(pickB)).toBe(true)
    expect(warnings()).toHaveLength(0)
    expect(box(st().objects[b]).min.z).toBeCloseTo(5, 4)
    expect(st().objects[b].transform.z).toBeCloseTo(17 + expected.z, 6)
    expect(st().operations).toHaveLength(n + 1)
    const op = st().operations[n] as AlignOperation
    expect([op.type, op.anchorId]).toEqual(['align', a])                                    // шаг align по грани A
    expect(op.plane!.moves[b].delta.z).toBeCloseTo(-7, 4)
    const replay = await rebuildFromHistory(st().operations)                               // воспроизведение — то же
    expect(box(replay[b]).min.z).toBeCloseTo(5, 4)
  })

  it('5b. плоскость X (YZ) + повёрнутый цилиндр, клик по боковой (не параллельной) грани → крайняя точка по реальной геометрии', async () => {
    const c = await shape('cylinder', { radius: 5, height: 20, segments: 48 }, at(40, 0, 0, { rotY: 45 }))
    am().startAlignMode()
    am().setPlane({ axis: 'X' })
    const pick = pickFace(rayDown(40, 0), [meshOf(st().objects[c])])!                      // наклонная грань сверху
    expect(Math.abs(pick.normal.x)).toBeGreaterThan(0.1)
    expect(Math.abs(pick.normal.x)).toBeLessThan(0.99)
    await am().clickFace(pick)
    const r = worldProjectionRange(st().objects[c], { x: 1, y: 0, z: 0 })
    // грань смотрит в сторону знака n.x → эта сторона легла в x = 0
    expect(pick.normal.x > 0 ? r.max : r.min).toBeCloseTo(0, 4)
  })

  it('5c. та же семантика, что solveAlignDeltas: плоскость через X min якоря = живой align X min', async () => {
    const anchor = await shape('cube', CUBE10, at(50, 0, 0))
    const cyl = await shape('cylinder', { radius: 5, height: 20, segments: 48 }, at(0, 30, 0, { rotY: 90 }))
    const plane = { normal: { x: -1, y: 0, z: 0 }, point: { x: computeWorldAABB(st().objects[anchor]).min.x, y: 0, z: 0 } }
    const d = solvePlaneAlignDelta(st().objects[cyl], plane, { normal: { x: -1, y: 0, z: 0 }, point: { x: -10, y: 30, z: 0 } }) // основание: x = −h/2
    expect(d.x).toBeCloseTo(solveAlignDeltas(st().objects, [cyl], 'X', 'min', anchor)[cyl], 6)
    // для осевых нормалей протяжённость = computeWorldAABB
    const r = worldProjectionRange(st().objects[cyl], axisPlane('Z').normal)
    expect(r.min).toBeCloseTo(computeWorldAABB(st().objects[cyl]).min.z, 6)
  })

  it('6. «Множественное» выключено → после B режим закрыт', async () => {
    const b = await shape('cube', CUBE10, at(30, 0, 17))
    am().startAlignMode()
    am().setPlane({ axis: 'Z' })
    await am().clickFace(pickFace(rayFrom([30, 0, -100], [0, 0, 1]), [meshOf(st().objects[b])])!)
    expect(box(st().objects[b]).min.z).toBeCloseTo(0, 4)
    expect(am().alignMode).toBeNull()
  })

  it('7. «Множественное» включено → режим и плоскость остаются, B2 в ту же плоскость', async () => {
    const b1 = await shape('cube', CUBE10, at(30, 0, 17))
    const b2 = await shape('sphere', { radius: 6, segments: 32 }, at(-30, 0, 40))
    am().startAlignMode()
    am().toggleMultiple()
    am().setPlane({ axis: 'Z' })
    await am().clickFace(pickFace(rayFrom([30, 0, -100], [0, 0, 1]), [meshOf(st().objects[b1])])!)
    expect(am().alignMode).not.toBeNull()
    expect(am().alignMode!.plane).toEqual({ axis: 'Z' })
    expect(am().alignMode!.alignedCount).toBe(1)
    expect(alignHintKey(am().alignMode!)).toBe('alignMode.hintAligned')
    await am().clickFace(pickFace(rayFrom([-30, 0, -100], [0, 0, 1]), [meshOf(st().objects[b2])])!)
    expect(box(st().objects[b1]).min.z).toBeCloseTo(0, 4)
    expect(box(st().objects[b2]).min.z).toBeCloseTo(0, 3)
    expect(am().alignMode!.alignedCount).toBe(2)
  })

  it('объект плоскости A как B — отказ с подсказкой, без сдвига; заблокированный — тоже', async () => {
    const a = await shape('cube', CUBE10, at(0, 0, 0))
    am().startAlignMode()
    const pick = pickFace(rayDown(0, 0), [meshOf(st().objects[a])])!
    await am().clickFace(pick)
    const n = st().operations.length
    expect(await am().applyAlignB(pick)).toBe(false)
    expect(st().operations).toHaveLength(n)
    expect(useNotifications.getState().notifications.at(-1)!.message).toBe(i18n.t('alignMode.sameObject'))
    const b = await shape('cube', CUBE10, at(30, 0, 17))
    useDocumentStore.setState({ objects: { ...st().objects, [b]: { ...st().objects[b], locked: true } } })
    const m = st().operations.length
    expect(await am().applyAlignB(pickFace(rayDown(30, 0), [meshOf(st().objects[b])])!)).toBe(false)
    expect(st().operations).toHaveLength(m)
  })
})

describe('ALIGN-UI-REVIT — выход и подсказки', () => {
  function KeysHost(): null { useAlignModeKeys(); return null }

  it('8. Esc → exitAlignMode; общий обработчик клавиш (window, bubble) его не получает', () => {
    mount(<KeysHost />)
    const later = vi.fn()
    window.addEventListener('keydown', later)
    am().startAlignMode()
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })) })
    expect(am().alignMode).toBeNull()
    expect(later).not.toHaveBeenCalled()
    // вне режима Esc проходит дальше как обычно
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })) })
    expect(later).toHaveBeenCalledTimes(1)
    window.removeEventListener('keydown', later)
  })

  it('8b. «Готово» в панели → выход', () => {
    am().startAlignMode()
    const h = mount(<AlignPanel />)
    act(() => h.querySelector<HTMLButtonElement>('[data-testid=align-done]')!.click())
    expect(am().alignMode).toBeNull()
  })

  for (const lang of ['ru', 'en'] as const) {
    it(`10. ${lang}: подсказки в статус-баре по шагам режима`, async () => {
      await i18n.changeLanguage(lang)
      const h = mount(
        <StatusBar workerOk objectCount={1} totalTris={12} historyIndex={1} operationsLength={1} modified={false}
          currentProjectId={null} lastCsgMs={null} rulerActive={false} fps={60} />,
      )
      const hint = () => h.querySelector('[data-testid=align-hint]')?.textContent ?? null
      expect(hint()).toBeNull()
      act(() => am().startAlignMode())
      expect(hint()).toBe(i18n.t('alignMode.hintPlane'))
      act(() => am().setPlane({ axis: 'Z' }))
      expect(hint()).toBe(i18n.t('alignMode.hintFaceB'))
      act(() => { am().toggleMultiple(); useAlignModeStore.setState({ alignMode: { ...am().alignMode!, alignedCount: 1 } }) })
      expect(hint()).toBe(i18n.t('alignMode.hintAligned'))
      expect(hint()).toBe(lang === 'ru' ? 'Выровнено. Выберите ещё B или Esc — выход' : 'Aligned. Pick another B or Esc to exit')
    })
  }
})

