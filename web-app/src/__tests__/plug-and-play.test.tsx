// ============================================================
// plug-and-play.test.tsx — PLUG-AND-PLAY: размещение фигуры с привязкой к плоскости
// ============================================================
// Клик по иконке палитры → режим (фигура не создана) → превью под курсором встаёт на плоскость:
// грань объекта (raycast по настоящему мешу), сетка (XY) или плоскость оси (X / Y / Z → YZ / XZ /
// XY) → клик / Enter → фигура создана там, стоит на плоскости (основание — в точке, локальная +Z —
// по нормали). Esc / «Отмена» — без фигуры. Реальный WASM (worker-bridge), лучи — Three.js.
// Браузер (вьюпорт, превью, правый клик) — e2e/plug-and-play.mjs.

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

import '../__mocks__/indexeddb'
import { _resetMockIndexedDB } from '../__mocks__/indexeddb'
import React from 'react'
import * as THREE from 'three'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import LeftPanel from '../components/LeftPanel'
import StatusBar from '../components/StatusBar'
import { pickFace } from '../components/align-picking'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { useNotifications } from '../store/notifications'
import { useAlignModeStore } from '../store/align-mode'
import { useCsgGroupModeStore } from '../store/csg-group-mode'
import { usePlacementModeStore, loadPreviewMesh, type PlaceableShape } from '../store/placement-mode'
import { usePlacementMode } from '../hooks/usePlacementMode'
import { meshBottom, rotationForNormal, type PlacementAim, type Ray3 } from '../store/placement'
import { worldVerticesAABB } from '../store/helpers'
import { computeRSMatrix } from '../csg/worker-matrix'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { OBJECT_SPACING } from '../constants'
import type { SceneObject, Vec3 } from '../csg/types'

const st = () => useDocumentStore.getState()
const pm = () => usePlacementModeStore.getState()
const mode = () => pm().placementMode
const notes = () => useNotifications.getState().notifications
const objs = () => Object.values(st().objects)
const noop = () => {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})
beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false, clipboard: [], clearedDocument: null })
  useNotifications.setState({ notifications: [] })
  useUiStore.setState({ snapValue: 1, rulerActive: false, gizmoMode: 'none' })
  useAlignModeStore.setState({ alignMode: null })
  useCsgGroupModeStore.setState({ csgGroupMode: null })
  usePlacementModeStore.getState().cancelPlacement()
  clearSnapshots(); clearTree(); _resetMockIndexedDB()
  await i18n.changeLanguage('ru')
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
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null
})

/** Режим размещения с загруженным мешем превью. */
async function startPlacing(type: PlaceableShape): Promise<void> {
  await loadPreviewMesh(type)
  act(() => pm().startPlacement(type))
  expect(mode()?.mesh).not.toBeNull()
}
/** Луч из `from` в сторону `to`. */
function ray(from: Vec3, to: Vec3): Ray3 {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z }
  const l = Math.hypot(d.x, d.y, d.z)
  return { origin: from, direction: { x: d.x / l, y: d.y / l, z: d.z / l } }
}
/** Меш объекта для raycast (как во вьюпорте: pivot с трансформом, вершины в origin). */
function meshOf(o: SceneObject): THREE.Mesh {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(o.vertices, 3))
  g.setIndex(new THREE.BufferAttribute(o.indices, 1))
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial())
  mesh.userData.objectId = o.id
  const pivot = new THREE.Object3D()
  pivot.position.set(o.transform.x, o.transform.y, o.transform.z)
  pivot.rotation.set(...([o.transform.rotX, o.transform.rotY, o.transform.rotZ].map(THREE.MathUtils.degToRad) as [number, number, number]))
  pivot.add(mesh)
  pivot.updateMatrixWorld(true)
  return mesh
}
/** Куда смотрит курсор: луч `r` и грань объектов сцены под ним (как `aimAt` во вьюпорте). */
function aimAt(r: Ray3): PlacementAim {
  const rc = new THREE.Raycaster(
    new THREE.Vector3(r.origin.x, r.origin.y, r.origin.z),
    new THREE.Vector3(r.direction.x, r.direction.y, r.direction.z),
  )
  return { ray: r, face: pickFace(rc, objs().map(meshOf)) }
}
/** Куб 20³ по умолчанию: центр (0, 0, 0), грани ±10. */
async function cube(): Promise<SceneObject> {
  await st().addShape('cube')
  return objs()[objs().length - 1]
}
/** Локальная +Z, повёрнутая трансформом. */
function upOf(rot: { rotX: number; rotY: number; rotZ: number }): Vec3 {
  const m = computeRSMatrix(rot, { scaleX: 1, scaleY: 1, scaleZ: 1 })
  return { x: m[2], y: m[5], z: m[8] }
}
const close = (a: Vec3, b: Vec3, eps = 1e-6) => {
  expect(a.x).toBeCloseTo(b.x, -Math.log10(eps)); expect(a.y).toBeCloseTo(b.y, -Math.log10(eps)); expect(a.z).toBeCloseTo(b.z, -Math.log10(eps))
}
/** Дождаться `n` объектов (реальный WASM). */
async function waitObjects(n: number): Promise<void> {
  const t0 = Date.now()
  while (objs().length < n || st().busy) {
    if (Date.now() - t0 > 10000) throw new Error(`объектов ${objs().length}, ожидалось ${n}`)
    await act(async () => { await sleep(10) })
  }
}

function Keys({ modal = false }: { modal?: boolean }) {
  usePlacementMode(modal)
  return <input data-testid="field" />
}
function press(code: string, opts: KeyboardEventInit = {}, target: EventTarget = window): KeyboardEvent {
  const key = code === 'Escape' ? 'Escape' : code === 'Enter' ? 'Enter' : code.replace('Key', '').toLowerCase()
  const ev = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...opts })
  act(() => { target.dispatchEvent(ev) })
  return ev
}

describe('PLUG-AND-PLAY — режим: клик по иконке не создаёт фигуру', () => {
  it('клик по «Кубу» → режим размещения, фигуры нет; двойной клик — тот же режим; другая иконка — смена фигуры', async () => {
    const h = mount(
      <LeftPanel shapeSearch="" onShapeSearchChange={noop} workerOk busy={false} onAddShape={(t) => pm().startPlacement(t)} onShowTextModal={noop}
        objectList={[]} selSet={new Set()} activeTab="objects" onTabChange={noop} onSelect={noop} onRename={noop}
        onToggleVis={noop} onDeleteObject={noop} historyIndex={0} operations={[]} tlFilters={{}} onFilterChange={noop} onJumpHistory={noop} />,
    )
    const btn = (label: string) => [...h.querySelectorAll<HTMLButtonElement>('.shape-btn')].find((b) => b.textContent?.includes(label))!
    act(() => { btn('Куб').click() })
    act(() => { btn('Куб').click() })                       // двойной клик
    expect(mode()?.shapeType).toBe('cube')
    expect(btn('Куб').classList.contains('active')).toBe(true)
    expect(btn('Куб').getAttribute('aria-pressed')).toBe('true')
    await act(async () => { await sleep(300) })             // меш превью из воркера
    expect(mode()?.mesh).not.toBeNull()
    expect(objs()).toHaveLength(0)                          // ничего не создано
    expect(st().operations).toHaveLength(0)
    act(() => { btn('Сфера').click() })
    expect(mode()?.shapeType).toBe('sphere')
    expect(btn('Куб').classList.contains('active')).toBe(false)
    expect(objs()).toHaveLength(0)
  })

  it('статус-бар: подсказка, плоскость и место превью, «Поставить» / «Отмена»', async () => {
    await startPlacing('cube')
    const h = mount(<StatusBar workerOk objectCount={0} totalTris={0} historyIndex={0} operationsLength={0} modified={false}
      currentProjectId={null} lastCsgMs={null} rulerActive={false} fps={60} />)
    const bar = h.querySelector('[data-testid=placement-mode]')!
    expect(bar.getAttribute('data-shape')).toBe('cube')
    expect(h.querySelector('[data-testid=placement-hint]')!.textContent).toMatch(/^Разместить куб: наведите на грань объекта или сетку/)
    expect(h.querySelector('[data-testid=placement-where]')!.textContent).toBe('Enter — рядом с прошлыми')
    act(() => pm().aim({ ray: ray({ x: 3, y: -8, z: 50 }, { x: 3, y: -8, z: 0 }), face: null }))
    expect(h.querySelector('[data-testid=placement-where]')!.textContent).toBe('сетка (XY) · X 3 · Y -8 · Z 10')
    expect(bar.getAttribute('data-plane')).toBe('grid')
    act(() => { h.querySelector<HTMLButtonElement>('[data-testid=placement-cancel]')!.click() })
    expect(mode()).toBeNull()
    expect(objs()).toHaveLength(0)
  })
})

describe('PLUG-AND-PLAY — превью и привязка', () => {
  it('превью на курсоре: луч в сетку → точка на XY с шагом привязки, куб стоит на сетке (z = 10)', async () => {
    await startPlacing('cube')
    act(() => pm().aim({ ray: ray({ x: 3.4, y: -7.6, z: 50 }, { x: 3.4, y: -7.6, z: 0 }), face: null }))
    const p = mode()!.preview!
    expect(p.plane.kind).toBe('grid')
    close(p.plane.normal, { x: 0, y: 0, z: 1 })
    close(p.point, { x: 3, y: -8, z: 0 })                   // шаг 1 мм
    expect(p.transform).toMatchObject({ x: 3, y: -8, z: 10, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
    // наклонный луч камеры → точка пересечения с z = 0; без привязки — точно
    act(() => useUiStore.setState({ snapValue: 0 }))
    act(() => pm().aim({ ray: ray({ x: 150, y: -200, z: 120 }, { x: 10.25, y: 20.5, z: 0 }), face: null }))
    close(mode()!.preview!.point, { x: 10.25, y: 20.5, z: 0 })
    // курсор ушёл из вьюпорта → превью нет
    act(() => pm().aim(null))
    expect(mode()!.preview).toBeNull()
  })

  it('привязка к грани: луч в верх куба → плоскость грани (нормаль +Z, точка на грани), сфера стоит на ней', async () => {
    const c = await cube()
    await startPlacing('sphere')
    const bottom = meshBottom((await loadPreviewMesh('sphere')).vertices)
    expect(bottom).toBeGreaterThan(11.5)                    // R 12
    act(() => pm().aim(aimAt(ray({ x: 2.3, y: -3.2, z: 80 }, { x: 2.3, y: -3.2, z: 0 }))))
    const p = mode()!.preview!
    expect(p.plane).toMatchObject({ kind: 'face', objectId: c.id })
    close(p.plane.normal, { x: 0, y: 0, z: 1 })
    expect(p.plane.point.z).toBeCloseTo(10, 6)              // верх куба
    close(p.point, { x: 2, y: -3, z: 10 })                  // в плоскости грани — шаг привязки
    expect(p.transform.z).toBeCloseTo(10 + bottom, 6)
    // боковая грань +X: нормаль +X, фигура повёрнута (локальная +Z → +X)
    act(() => pm().aim(aimAt(ray({ x: 80, y: 1, z: 2 }, { x: 0, y: 1, z: 2 }))))
    const s = mode()!.preview!
    close(s.plane.normal, { x: 1, y: 0, z: 0 })
    close(upOf(s.transform), { x: 1, y: 0, z: 0 })
    expect(s.transform.x).toBeCloseTo(10 + bottom, 6)
  })

  it('X / Y / Z → плоскости YZ / XZ / XY через начало координат (нормаль — к камере); та же клавиша — снять', async () => {
    mount(<Keys />)
    await startPlacing('cylinder')
    const bottom = meshBottom(mode()!.mesh!.vertices)
    const cam = ray({ x: 60, y: -90, z: 40 }, { x: -4, y: 7, z: 3 })
    act(() => pm().aim({ ray: cam, face: null }))
    expect(mode()!.preview!.plane.kind).toBe('grid')

    const xEv = press('KeyX')
    expect(xEv.defaultPrevented).toBe(true)                 // X в режиме — не «Вычитание»
    expect(mode()!.lock).toBe('X')
    let p = mode()!.preview!
    expect(p.plane).toMatchObject({ kind: 'axis', axis: 'X' })
    close(p.plane.normal, { x: 1, y: 0, z: 0 })             // камера со стороны +X
    expect(p.point.x).toBe(0)                               // плоскость YZ
    close(upOf(p.transform), { x: 1, y: 0, z: 0 })
    expect(p.transform.x).toBeCloseTo(bottom, 6)            // стоит на YZ со стороны камеры

    press('KeyY')
    p = mode()!.preview!
    expect(p.plane).toMatchObject({ kind: 'axis', axis: 'Y' })
    close(p.plane.normal, { x: 0, y: -1, z: 0 })            // камера со стороны −Y
    expect(p.point.y).toBe(0)
    close(upOf(p.transform), { x: 0, y: -1, z: 0 })
    expect(p.transform.y).toBeCloseTo(-bottom, 6)

    press('KeyZ')
    p = mode()!.preview!
    expect(p.plane).toMatchObject({ kind: 'axis', axis: 'Z' })
    expect(p.point.z).toBe(0)
    close(upOf(p.transform), { x: 0, y: 0, z: 1 })

    press('KeyZ')                                           // та же — снять
    expect(mode()!.lock).toBeNull()
    expect(mode()!.preview!.plane.kind).toBe('grid')

    const undoEv = press('KeyZ', { ctrlKey: true })         // Ctrl+Z — не ось
    expect(undoEv.defaultPrevented).toBe(false)
    expect(mode()!.lock).toBeNull()
    expect(objs()).toHaveLength(0)
  })

  it('сетка (пол) → плоскость XY: луч мимо объектов → z = 0; луч в небо — превью нет, клик не ставит', async () => {
    await cube()
    await startPlacing('cube')
    act(() => pm().aim(aimAt(ray({ x: 60, y: -60, z: 50 }, { x: 40, y: 30, z: 0 }))))   // мимо куба
    const p = mode()!.preview!
    expect(p.plane.kind).toBe('grid')
    expect(p.point).toMatchObject({ x: 40, y: 30, z: 0 })
    const sky = { ray: ray({ x: 0, y: -100, z: 50 }, { x: 0, y: 100, z: 120 }), face: null }
    act(() => pm().aim(sky))
    expect(mode()!.preview).toBeNull()
    expect(await pm().confirmPlacement(sky)).toBe(false)    // мимо плоскостей: режим остаётся
    expect(mode()?.shapeType).toBe('cube')
    expect(objs()).toHaveLength(1)
    expect(notes()).toEqual([])                             // без уведомлений
  })

  it('rotationForNormal: локальная +Z → нормаль (оси, наклонная, вниз)', () => {
    for (const n of [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
      { x: 0.6, y: 0, z: 0.8 }, { x: -0.48, y: 0.6, z: -0.64 }]) {
      close(upOf(rotationForNormal(n)), n)
    }
  })
})

describe('PLUG-AND-PLAY — создание и отмена', () => {
  it('клик по грани → фигура создана на плоскости: pivot, поворот, настоящая геометрия касается грани', async () => {
    const c = await cube()
    await startPlacing('cylinder')
    const at = aimAt(ray({ x: 90, y: 4.2, z: -2.7 }, { x: 0, y: 4.2, z: -2.7 }))   // грань +X куба
    const preview = (act(() => pm().aim(at)), mode()!.preview!)
    expect(await pm().confirmPlacement(at)).toBe(true)
    await waitObjects(2)
    expect(mode()).toBeNull()                                // режим выключен
    const o = objs().find((x) => x.id !== c.id)!
    expect(o.shapeType).toBe('cylinder')
    expect(o.transform).toEqual(preview.transform)            // там, где было превью
    expect(o.transform.y).toBe(4)                             // точка клика (шаг привязки)
    expect(o.transform.z).toBe(-3)
    close(upOf(o.transform), { x: 1, y: 0, z: 0 })            // ось цилиндра — по нормали грани
    const box = worldVerticesAABB(o.vertices, o.transform)
    expect(box.min.x).toBeCloseTo(10, 4)                      // основание — на грани куба (x = 10)
    expect((box.min.y + box.max.y) / 2).toBeCloseTo(4, 4)
    expect((box.min.z + box.max.z) / 2).toBeCloseTo(-3, 4)
    const op = st().operations[st().operations.length - 1]
    expect(op).toMatchObject({ type: 'add_shape', shapeType: 'cylinder', transform: o.transform })   // в истории — то же место
    expect(notes()).toEqual([])
  })

  it('клик по сетке → куб стоит на сетке (низ — z = 0), не в начале координат', async () => {
    await startPlacing('cube')
    const at = { ray: ray({ x: 120, y: -150, z: 100 }, { x: 37, y: -12, z: 0 }), face: null }
    expect(await pm().confirmPlacement(at)).toBe(true)
    await waitObjects(1)
    const o = objs()[0]
    expect(o.transform).toMatchObject({ x: 37, y: -12, z: 10, rotX: 0, rotY: 0, rotZ: 0 })
    const box = worldVerticesAABB(o.vertices, o.transform)
    expect(box.min.z).toBeCloseTo(0, 6)
  })

  it('Esc → отмена: фигура не создана, событие погашено (выделение не снимается)', async () => {
    const c = await cube()
    st().selectObjects([c.id], false)
    mount(<Keys />)
    await startPlacing('sphere')
    act(() => pm().aim({ ray: ray({ x: 40, y: 0, z: 60 }, { x: 40, y: 0, z: 0 }), face: null }))
    const ev = press('Escape')
    expect(ev.defaultPrevented).toBe(true)
    expect(mode()).toBeNull()
    expect(objs()).toHaveLength(1)
    expect(st().selectedIds).toEqual([c.id])
    expect(press('Escape').defaultPrevented).toBe(false)    // вне режима Esc — как обычно
  })

  it('Enter: в превью; без превью (курсор не во вьюпорте) — рядом с прошлыми, как раньше', async () => {
    mount(<Keys />)
    await cube()                                             // объект 0: x = 0
    await startPlacing('sphere')
    press('Enter')                                           // превью нет
    await waitObjects(2)
    expect(objs()[1].transform).toMatchObject({ x: 1 * OBJECT_SPACING, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 })
    expect(mode()).toBeNull()

    await startPlacing('cone')
    act(() => pm().aim({ ray: ray({ x: -30, y: 40, z: 90 }, { x: -30, y: 40, z: 0 }), face: null }))
    const preview = mode()!.preview!.transform
    const ev = press('Enter')
    expect(ev.defaultPrevented).toBe(true)                   // не «нажимает» иконку в фокусе
    await waitObjects(3)
    expect(objs()[2].transform).toEqual(preview)
    expect(objs()[2].transform.x).toBe(-30)
  })

  it('клавиши в поле ввода и под модалкой не перехватываются', async () => {
    const h = mount(<Keys />)
    await startPlacing('cube')
    const field = h.querySelector('[data-testid=field]')!
    expect(press('KeyX', {}, field).defaultPrevented).toBe(false)
    expect(press('Escape', {}, field).defaultPrevented).toBe(false)
    expect(mode()?.lock).toBeNull()
    expect(mode()).not.toBeNull()
    act(() => root!.render(<Keys modal />))
    expect(press('Enter').defaultPrevented).toBe(false)
    expect(press('Escape').defaultPrevented).toBe(false)
    expect(mode()).not.toBeNull()
    expect(objs()).toHaveLength(0)
  })

  it('стор занят (идёт CSG) — поставленная фигура ждёт очереди, не теряется', async () => {
    await startPlacing('cube')
    useDocumentStore.setState({ busy: true })
    const p = pm().confirmPlacement({ ray: ray({ x: 5, y: 5, z: 50 }, { x: 5, y: 5, z: 0 }), face: null })
    await act(async () => { await sleep(50) })
    expect(objs()).toHaveLength(0)
    expect(mode()).toBeNull()
    useDocumentStore.setState({ busy: false })
    expect(await p).toBe(true)
    expect(objs()[0].transform).toMatchObject({ x: 5, y: 5, z: 10 })
  })

  it('режимы не совмещаются: размещение выходит из «Выровнять» и CSG A → B; «Выровнять» и линейка — из размещения', async () => {
    mount(<Keys />)
    const a = await cube()
    act(() => useAlignModeStore.getState().startAlignMode())
    await startPlacing('cube')
    expect(useAlignModeStore.getState().alignMode).toBeNull()
    act(() => pm().cancelPlacement())

    st().selectObjects([a.id], false)
    act(() => { useCsgGroupModeStore.getState().startCsgGroup('subtract') })
    expect(useCsgGroupModeStore.getState().csgGroupMode).not.toBeNull()
    await startPlacing('sphere')
    expect(useCsgGroupModeStore.getState().csgGroupMode).toBeNull()

    act(() => useAlignModeStore.getState().startAlignMode())
    expect(mode()).toBeNull()
    act(() => useAlignModeStore.getState().exitAlignMode())

    await startPlacing('cube')
    act(() => useUiStore.getState().setRulerActive(true))
    expect(mode()).toBeNull()
    expect(objs()).toHaveLength(1)
  })
})
