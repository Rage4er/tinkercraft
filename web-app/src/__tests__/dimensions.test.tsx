// ============================================================
// dimensions.test.tsx — DIMENSIONS: размерные линии (ассоциативные, 3 подварианта, слой)
// ============================================================
// Размер привязан к ОБЪЕКТАМ (id + точка в их локальных координатах), а не к мировым точкам:
// сдвиг / поворот / масштаб / смена размеров объекта — число пересчитано. Подварианты: Стандарт
// (A → B), С отступом (наружу на offset, выносные), Проекция (на плоскость XY). Слой — отдельно
// от истории: не шаги, undo / redo не трогает (объект ушёл — размер скрыт, вернулся — виден).
// Реальный WASM (worker-bridge). Браузер (вьюпорт, клики по точкам, число на экране) —
// e2e/dimensions.mjs. `.3dtc` — io/3dtc-io.test.ts.

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
import DimensionList from '../components/DimensionList'
import DimensionPanel from '../components/DimensionPanel'
import DimensionSettingsModal from '../components/DimensionSettingsModal'
import DimensionMenuButton from '../components/DimensionMenuButton'
import { buildDimensionObject, pickDimension } from '../components/dimension-render'
import { useDocumentStore } from '../store/document-store'
import { useUiStore } from '../store/ui-store'
import { useNotifications } from '../store/notifications'
import { useDimensionsStore } from '../store/dimensions-store'
import { useDimensionModeStore, createDimension } from '../store/dimension-mode'
import { usePlacementModeStore } from '../store/placement-mode'
import { useDimensionMode } from '../hooks/useDimensionMode'
import {
  DEFAULT_DIMENSION_DEFAULTS, dimensionEnds, dimensionGeometry, dimensionValue, toLocalPoint, toWorldPoint,
  type Dimension,
} from '../store/dimensions'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import type { SceneObject, TransformNR, Vec3 } from '../csg/types'

const st = () => useDocumentStore.getState()
const ds = () => useDimensionsStore.getState()
const dm = () => useDimensionModeStore.getState()
const notes = () => useNotifications.getState().notifications
const objs = () => Object.values(st().objects)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false, clipboard: [], clearedDocument: null })
  useNotifications.setState({ notifications: [] })
  useUiStore.setState({ dimensionDefaults: DEFAULT_DIMENSION_DEFAULTS, rulerActive: false, showDimensionSettings: false })
  useDimensionsStore.setState({ dimensions: [], showDimensions: true, selectedDimensionId: null })
  useDimensionModeStore.setState({ dimensionMode: null })
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

/** Фигура по умолчанию (рядом с прошлыми: X = N × 25, центр в z = 0). */
async function add(type: 'cube' | 'sphere' | 'cylinder'): Promise<SceneObject> {
  await st().addShape(type)
  return objs()[objs().length - 1]
}
const obj = (id: string) => st().objects[id]
const at = (id: string, patch: Partial<TransformNR>) => st().moveObject(id, { ...obj(id).transform, ...patch })
/** Размер A → B через режим (клик A, клик B), как во вьюпорте. */
function measure(a: { objectId: string; point: Vec3 }, b: { objectId: string; point: Vec3 }): Dimension {
  act(() => dm().startDimensionMode())
  act(() => { expect(dm().clickPoint(a)).toBeNull() })              // A
  let id: string | null = null
  act(() => { id = dm().clickPoint(b) })                             // B → размер
  expect(id).not.toBeNull()
  return ds().dimensions.find((d) => d.id === id)!
}
const value = (d: Dimension) => dimensionValue(ds().dimensions.find((x) => x.id === d.id) ?? d, st().objects)
const close = (a: Vec3, b: Vec3, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits); expect(a.y).toBeCloseTo(b.y, digits); expect(a.z).toBeCloseTo(b.z, digits)
}

function Keys() {
  useDimensionMode(false)
  return <input data-testid="field" />
}
function press(code: string): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code, bubbles: true, cancelable: true })
  act(() => { window.dispatchEvent(ev) })
  return ev
}

describe('DIMENSIONS — три подварианта', () => {
  it('Стандарт: A → B (ребро куба) — 20.0 мм; режим остаётся для следующего размера; без уведомлений', async () => {
    const c = await add('cube')
    const before = st().operations.length
    const d = measure({ objectId: c.id, point: { x: 10, y: -10, z: 10 } }, { objectId: c.id, point: { x: -10, y: -10, z: 10 } })
    expect(d).toMatchObject({ type: 'linear', objectIdA: c.id, objectIdB: c.id, style: { kind: 'standard', units: 'mm' } })
    close(d.pointA, { x: 10, y: -10, z: 10 })                         // локальная точка (куб в начале координат)
    expect(value(d)).toBeCloseTo(20, 6)
    const g = dimensionGeometry(dimensionEnds(d, st().objects)!, 'standard', d.offset)
    close(g.line[0], { x: 10, y: -10, z: 10 }); close(g.line[1], { x: -10, y: -10, z: 10 })
    expect(g.extensions).toEqual([])
    close(g.label, { x: 0, y: -10, z: 10 })
    expect(dm().dimensionMode).toMatchObject({ first: null, created: 1 })   // режим — для следующего
    expect(st().operations.length).toBe(before)                       // не шаг истории
    expect(st().modified).toBe(true)                                  // но документ изменён (сохраняется в файл)
    expect(notes()).toEqual([])
  })

  it('С отступом: линия сдвинута НАРУЖУ на offset перпендикулярно AB, выносные от A и B; число — |AB|', async () => {
    const c = await add('cube')
    useUiStore.getState().setDimensionDefaults({ style: { ...DEFAULT_DIMENSION_DEFAULTS.style, kind: 'offset' }, offset: 15 })
    const d = measure({ objectId: c.id, point: { x: 10, y: -10, z: 10 } }, { objectId: c.id, point: { x: -10, y: -10, z: 10 } })
    expect(d.style.kind).toBe('offset')
    expect(d.offset).toBe(15)
    const g = dimensionGeometry(dimensionEnds(d, st().objects)!, 'offset', 15)
    const n = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 }             // от центра куба к середине ребра, ⟂ AB
    close(g.line[0], { x: 10, y: -10 + n.y * 15, z: 10 + n.z * 15 })
    close(g.line[1], { x: -10, y: -10 + n.y * 15, z: 10 + n.z * 15 })
    expect(g.extensions).toHaveLength(2)
    close(g.extensions[0][0], { x: 10, y: -10, z: 10 })               // выносная — от точки A
    expect(g.value).toBeCloseTo(20, 6)
    expect(value(d)).toBeCloseTo(20, 6)
  })

  it('Проекция: на плоскость XY (уровень нижней точки) — длина по горизонтали, выносные вертикально', async () => {
    const a = await add('cube')                                       // x ∈ [−10, 10]
    const b = await add('cube')                                       // x ∈ [15, 35]
    useUiStore.getState().setDimensionDefaults({ style: { ...DEFAULT_DIMENSION_DEFAULTS.style, kind: 'projection' }, offset: 10 })
    const d = measure({ objectId: a.id, point: { x: 10, y: 10, z: 10 } }, { objectId: b.id, point: { x: 15, y: -10, z: -10 } })
    const g = dimensionGeometry(dimensionEnds(d, st().objects)!, 'projection', d.offset)
    expect(g.value).toBeCloseTo(Math.hypot(5, 20), 6)                  // Δz = 20 не входит
    close(g.line[0], { x: 10, y: 10, z: -10 }); close(g.line[1], { x: 15, y: -10, z: -10 })
    expect(g.extensions).toHaveLength(1)
    close(g.extensions[0][1], { x: 10, y: 10, z: -10 })               // из A вертикально вниз
    expect(value(d)).toBeCloseTo(Math.hypot(5, 20), 6)
    // тот же размер «Стандарт» — полная длина
    expect(dimensionGeometry(dimensionEnds(d, st().objects)!, 'standard', 0).value).toBeCloseTo(Math.hypot(5, 20, 20), 6)
  })
})

describe('DIMENSIONS — ассоциативный: число следует за объектом', () => {
  it('сдвиг, поворот, масштаб и смена размеров объекта — число пересчитано', async () => {
    const a = await add('cube')
    const b = await add('cube')                                       // центр x = 25
    const d = measure({ objectId: a.id, point: { x: 10, y: 0, z: 0 } }, { objectId: b.id, point: { x: 15, y: 0, z: 0 } })
    expect(value(d)).toBeCloseTo(5, 6)
    await at(b.id, { x: 35 })                                         // сдвиг +10
    expect(value(d)).toBeCloseTo(15, 6)
    await at(b.id, { scaleX: 2 })                                     // масштаб ×2 вокруг центра: грань x = 35 − 20
    expect(value(d)).toBeCloseTo(5, 6)
    await at(b.id, { scaleX: 1, rotZ: 90 })                           // поворот: точка (−10, 0, 0) → (0, −10, 0)
    close(dimensionEnds(ds().dimensions[0], st().objects)!.b, { x: 35, y: -10, z: 0 }, 5)
    expect(value(d)).toBeCloseTo(Math.hypot(25, 10), 5)
    await at(b.id, { rotZ: 0 })
    await st().resizeObject(a.id, { width: 30, height: 20, depth: 20 })   // куб A шире: грань x = 15
    close(dimensionEnds(ds().dimensions[0], st().objects)!.a, { x: 15, y: 0, z: 0 }, 4)
    expect(value(d)).toBeCloseTo(10, 4)
    expect(ds().dimensions).toHaveLength(1)                           // тот же размер, не новый
  })

  it('локальные ↔ мировые точки с поворотом и масштабом — обратные', () => {
    const t: TransformNR = { x: 3, y: -7, z: 11, rotX: 30, rotY: -45, rotZ: 70, scaleX: 2, scaleY: 0.5, scaleZ: 1.5 }
    const p = { x: 4.5, y: -2, z: 8 }
    close(toLocalPoint(t, toWorldPoint(t, p)), p, 9)
  })
})

describe('DIMENSIONS — слой, корзина, undo / redo', () => {
  it('слой: «Показать / скрыть» — все размеры скрыты / видны, выделение снимается', async () => {
    const c = await add('cube')
    const d = measure({ objectId: c.id, point: { x: 10, y: 10, z: 10 } }, { objectId: c.id, point: { x: -10, y: 10, z: 10 } })
    act(() => dm().exitDimensionMode())
    act(() => ds().selectDimension(d.id))
    const h = mount(<DimensionList />)
    expect(h.querySelectorAll('[data-testid=dimension-row]')).toHaveLength(1)
    expect(h.querySelector('[data-testid=dimension-value]')!.textContent).toBe('20.0 мм')
    act(() => ds().toggleShowDimensions())
    expect(ds().showDimensions).toBe(false)
    expect(ds().selectedDimensionId).toBeNull()
    expect(h.textContent).toContain('Слой скрыт')                      // в списке — с пометкой
    act(() => ds().toggleShowDimensions())
    expect(ds().showDimensions).toBe(true)
    expect(ds().dimensions).toHaveLength(1)                            // скрытие ничего не удаляет
  })

  it('корзина в списке и Delete при выделенном размере — удаляют размер, а не объекты', async () => {
    mount(<Keys />)
    const c = await add('cube')
    const s = await add('sphere')
    const d1 = measure({ objectId: c.id, point: { x: 10, y: 10, z: 10 } }, { objectId: s.id, point: { x: 25, y: 0, z: 12 } })
    const d2 = measure({ objectId: c.id, point: { x: -10, y: 10, z: 10 } }, { objectId: c.id, point: { x: 10, y: 10, z: 10 } })
    act(() => dm().exitDimensionMode())
    act(() => root!.unmount())
    host!.remove()
    const h = mount(<><Keys /><DimensionList /></>)
    expect(h.querySelectorAll('[data-testid=dimension-row]')).toHaveLength(2)
    act(() => { (h.querySelector(`[data-dimension-id="${d1.id}"] [data-testid=dimension-delete]`) as HTMLButtonElement).click() })
    expect(ds().dimensions.map((d) => d.id)).toEqual([d2.id])
    // клик по строке — выделить, Delete — удалить; объекты на месте
    act(() => { (h.querySelector(`[data-dimension-id="${d2.id}"]`) as HTMLElement).click() })
    expect(ds().selectedDimensionId).toBe(d2.id)
    const ev = press('Delete')
    expect(ev.defaultPrevented).toBe(true)
    expect(ds().dimensions).toEqual([])
    expect(objs()).toHaveLength(2)
    expect(press('Delete').defaultPrevented).toBe(false)             // без выделенного размера — как обычно
  })

  it('undo / redo не трогают размеры: число следует за объектом, ушедший объект — размер скрыт до возврата', async () => {
    const a = await add('cube')
    const b = await add('cube')
    const steps = st().operations.length
    const d = measure({ objectId: a.id, point: { x: 10, y: 0, z: 0 } }, { objectId: b.id, point: { x: 15, y: 0, z: 0 } })
    expect(st().operations.length).toBe(steps)                        // размер — не шаг истории
    await at(b.id, { x: 45 })
    expect(value(d)).toBeCloseTo(25, 6)
    await st().undo()                                                 // откат сдвига
    expect(ds().dimensions).toHaveLength(1)
    expect(value(d)).toBeCloseTo(5, 6)
    await st().redo()
    expect(value(d)).toBeCloseTo(25, 6)
    await st().undo(); await st().undo()                              // до создания B
    expect(obj(b.id)).toBeUndefined()
    expect(ds().dimensions).toHaveLength(1)                           // размер не удалён — скрыт
    expect(value(d)).toBeNull()
    await st().redo()
    expect(value(d)).toBeCloseTo(5, 6)                                // вернулся вместе с объектом
    expect(st().operations.length).toBe(steps + 1)                    // в истории — только сдвиг
  })
})

describe('DIMENSIONS — настройки и панель', () => {
  it('«Настройки размеров»: тип, цвет, шрифт, высота — «Применить к новым» и «Применить к выбранному»', async () => {
    const c = await add('cube')
    const h = mount(<DimensionSettingsModal onClose={() => useUiStore.getState().setShowDimensionSettings(false)} />)
    const input = (id: string) => h.querySelector(`[data-testid=${id}]`) as HTMLInputElement
    const setValue = (el: HTMLInputElement | HTMLSelectElement, v: string) => {
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    }
    expect(input('dim-units').textContent).toBe('мм')
    expect((input('dim-apply-selected') as unknown as HTMLButtonElement).disabled).toBe(true)   // нечего выбирать
    act(() => { (h.querySelector('[data-testid=dim-kind-offset]') as HTMLButtonElement).click() })
    act(() => setValue(input('dim-color'), '#ff8800'))
    act(() => setValue(h.querySelector('[data-testid=dim-font]') as HTMLSelectElement, 'monospace'))
    act(() => setValue(input('dim-size'), '7.5'))
    act(() => setValue(input('dim-offset'), '12'))
    act(() => { (h.querySelector('[data-testid=dim-apply-new]') as HTMLButtonElement).click() })
    expect(useUiStore.getState().dimensionDefaults).toEqual({ offset: 12, style: { kind: 'offset', color: '#ff8800', font: 'monospace', size: 7.5, units: 'mm' } })
    const d = measure({ objectId: c.id, point: { x: 10, y: 10, z: 10 } }, { objectId: c.id, point: { x: -10, y: 10, z: 10 } })
    expect(d.style).toEqual({ kind: 'offset', color: '#ff8800', font: 'monospace', size: 7.5, units: 'mm' })
    expect(d.offset).toBe(12)

    // выделенный размер — окно открывается с его стилем, «Применить к выбранному»
    act(() => dm().exitDimensionMode())
    act(() => ds().selectDimension(d.id))
    act(() => root!.unmount()); host!.remove()
    const h2 = mount(<DimensionSettingsModal onClose={() => {}} />)
    act(() => { (h2.querySelector('[data-testid=dim-kind-projection]') as HTMLButtonElement).click() })
    act(() => setValue(h2.querySelector('[data-testid=dim-color]') as HTMLInputElement, '#00aa55'))
    act(() => { (h2.querySelector('[data-testid=dim-apply-selected]') as HTMLButtonElement).click() })
    expect(ds().dimensions[0].style).toMatchObject({ kind: 'projection', color: '#00aa55', font: 'monospace', size: 7.5 })
    expect(useUiStore.getState().dimensionDefaults.style.kind).toBe('offset')   // новые — как были
  })

  it('панель размера: значение, тип переключается, «Удалить размер»', async () => {
    const c = await add('cube')
    const d = measure({ objectId: c.id, point: { x: 10, y: 10, z: 10 } }, { objectId: c.id, point: { x: -10, y: -10, z: -10 } })
    act(() => dm().exitDimensionMode())
    act(() => ds().selectDimension(d.id))
    const h = mount(<DimensionPanel />)
    expect(h.querySelector('[data-testid=dimension-panel-value]')!.textContent).toBe(`${(Math.sqrt(1200)).toFixed(1)} мм`)
    act(() => { (h.querySelector('[data-testid=dimension-panel-kind-projection]') as HTMLButtonElement).click() })
    expect(ds().dimensions[0].style.kind).toBe('projection')
    expect(h.querySelector('[data-testid=dimension-panel-value]')!.textContent).toBe(`${Math.sqrt(800).toFixed(1)} мм`)
    act(() => { (h.querySelector('[data-testid=dimension-panel-delete]') as HTMLButtonElement).click() })
    expect(ds().dimensions).toEqual([])
  })
})

describe('DIMENSIONS — режим и отрисовка', () => {
  it('режим: та же точка дважды — ждём другую B; Esc — выход; размещение выходит из режима «Размер»', async () => {
    mount(<Keys />)
    const c = await add('cube')
    act(() => dm().startDimensionMode())
    expect(ds().showDimensions).toBe(true)
    const p = { objectId: c.id, point: { x: 10, y: 10, z: 10 } }
    act(() => { dm().clickPoint(p) })
    act(() => { expect(dm().clickPoint(p)).toBeNull() })               // та же точка
    expect(ds().dimensions).toHaveLength(0)
    expect(dm().dimensionMode?.first).toEqual(p)
    const esc = press('Escape')
    expect(esc.defaultPrevented).toBe(true)
    expect(dm().dimensionMode).toBeNull()
    act(() => dm().startDimensionMode())
    await act(async () => { usePlacementModeStore.getState().startPlacement('cube'); await sleep(0) })
    expect(dm().dimensionMode).toBeNull()                              // режимы не совмещаются
    act(() => usePlacementModeStore.getState().cancelPlacement())
    expect(createDimension({ objectId: 'нет', point: p.point }, p)).toBeNull()
    expect(notes()).toEqual([])
  })

  it('3D: линии, две стрелки, число — billboard-спрайт; луч в линию выделяет размер', async () => {
    const c = await add('cube')
    const d = measure({ objectId: c.id, point: { x: 10, y: 10, z: 10 } }, { objectId: c.id, point: { x: -10, y: 10, z: 10 } })
    const geom = dimensionGeometry(dimensionEnds(d, st().objects)!, 'standard', 0, d.style.size * 0.9)
    const group = buildDimensionObject(d.id, geom, d.style, '20.0 мм', false)
    const lines = group.children.find((o) => o instanceof THREE.LineSegments) as THREE.LineSegments
    expect(Array.from(lines.geometry.getAttribute('position').array)).toEqual([10, 10, 10, -10, 10, 10])
    expect(group.children.filter((o) => o instanceof THREE.Mesh && (o.geometry as THREE.BufferGeometry).type === 'ConeGeometry')).toHaveLength(2)
    const sprite = group.children.find((o) => o instanceof THREE.Sprite) as THREE.Sprite
    expect(sprite.userData.dimensionLabel).toBe('20.0 мм')
    expect(sprite.position.z).toBeGreaterThan(10)                      // над линией, не закрывает её
    const scene = new THREE.Scene(); scene.add(group); scene.updateMatrixWorld(true)
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
    camera.position.set(0, 10, 100); camera.lookAt(0, 10, 10); camera.updateMatrixWorld(true)
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(0.06, 0), camera)
    expect(pickDimension(rc, group)).toBe(d.id)
    rc.setFromCamera(new THREE.Vector2(0.9, 0.9), camera)
    expect(pickDimension(rc, group)).toBeNull()
  })
})

describe('DIMENSIONS — кнопка «Размер» в тулбаре: меню из трёх пунктов', () => {
  it('клик → «Поставить размер» (D), «Настройки размера», «Показать / скрыть размеры» (галочка); Esc и клик мимо — закрыть', () => {
    const calls: string[] = []
    const h = mount(<DimensionMenuButton dimensionActive={false} dimensionsVisible
      onDimensionMode={() => calls.push('mode')} onDimensionSettings={() => calls.push('settings')} onToggleDimensions={() => calls.push('toggle')} />)
    const btn = h.querySelector('button')!
    expect(btn.getAttribute('aria-label')).toBe('Размер')
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    const menu = () => document.querySelector('[data-testid=dimension-menu]')
    act(() => { btn.click() })
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    const items = [...menu()!.querySelectorAll('[role^=menuitem]')].map((e) => e.textContent)
    expect(items).toEqual(['Поставить размерD', 'Настройки размера', '✓Показать / скрыть размеры'])
    act(() => { (menu()!.querySelector('[data-testid=dimension-menu-place]') as HTMLButtonElement).click() })
    expect(calls).toEqual(['mode'])
    expect(menu()).toBeNull()                                           // выбор закрывает меню
    act(() => { btn.click() })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(menu()).toBeNull()
    act(() => { btn.click() })
    act(() => { document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })) })
    expect(menu()).toBeNull()                                           // клик мимо
    act(() => { btn.click() })
    act(() => { (menu()!.querySelector('[data-testid=dimension-menu-settings]') as HTMLButtonElement).click() })
    act(() => { btn.click() })
    act(() => { (menu()!.querySelector('[data-testid=dimension-menu-toggle]') as HTMLButtonElement).click() })
    expect(calls).toEqual(['mode', 'settings', 'toggle'])
  })
})
