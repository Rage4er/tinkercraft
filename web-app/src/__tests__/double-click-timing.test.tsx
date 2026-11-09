// ============================================================
// double-click-timing.test.tsx — двойной клик по фигуре палитры и неподвижная палитра
// ============================================================
// DOUBLE-CLICK-TIMING (v1.3.6) мерил фильтр двойного клика по иконке (200 мс) по времени клика
// (`event.timeStamp`): на медленном CPU клики ждут в очереди и обрабатываются подряд.
// PLUG-AND-PLAY: клик по иконке только включает режим размещения — фигура появляется, когда её
// ставят (клик по грани / сетке, Enter). Фильтр не нужен и удалён; здесь — что клики по иконке,
// в т. ч. пришедшие из очереди подряд, дают один режим и ни одной лишней фигуры.
// Второе (TIMELINE-SCROLL-FIX): палитра не уезжает из-под курсора — история (Timeline) прокручивает
// к текущему шагу только свой список (`scrollListToItem`), а не всю левую панель (`scrollIntoView`
// двигал `.panel-left` на строку с каждой фигурой: второй клик через 300 мс попадал мимо «Куба»).
// Браузер (очередь ввода при занятом главном потоке, неподвижная палитра) — e2e/double-click-timing.mjs.

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
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import i18n from '../i18n'
import LeftPanel from '../components/LeftPanel'
import Timeline from '../components/Timeline'
import { scrollListToItem } from '../components/list-scroll'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { usePlacementModeStore, type PlaceableShape } from '../store/placement-mode'
import type { TinkerCraftOperation, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const cubes = () => Object.values(st().objects).filter((o) => o.shapeType === 'cube').length
const notes = () => useNotifications.getState().notifications
const noop = () => {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom: нет scrollIntoView (Timeline в LeftPanel прокручивает к текущему шагу)
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})
beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false, clipboard: [], clearedDocument: null })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree(); _resetMockIndexedDB()
  usePlacementModeStore.getState().cancelPlacement()
  await i18n.changeLanguage('ru')
})

let root: Root | null = null
let host: HTMLDivElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null
})

/** Палитра (LeftPanel) с обработчиком клика по фигуре; кнопка «Куб». */
function mountPalette(onAddShape: (type: PlaceableShape) => void): HTMLButtonElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(
    <LeftPanel shapeSearch="" onShapeSearchChange={noop} workerOk busy={false} onAddShape={onAddShape} onShowTextModal={noop}
      objectList={[]} selSet={new Set()} activeTab="objects" onTabChange={noop} onSelect={noop} onRename={noop}
      onToggleVis={noop} onDeleteObject={noop} historyIndex={0} operations={[]} tlFilters={{}} onFilterChange={noop} onJumpHistory={noop} />,
  ))
  const btn = [...host.querySelectorAll<HTMLButtonElement>('.shape-btn')].find((b) => b.textContent?.includes(i18n.t('shapes.cube')))
  if (!btn) throw new Error('нет кнопки «Куб» в палитре')
  return btn
}
/** Клик с временем клика `timeStamp` (мс) — как от браузера: время ставится при вводе. */
function clickAt(btn: HTMLElement, timeStamp: number): void {
  const ev = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
  Object.defineProperty(ev, 'timeStamp', { value: timeStamp })
  act(() => { btn.dispatchEvent(ev) })
}
/** Дождаться `n` кубов (реальный WASM) и убедиться, что лишний не появится. */
async function expectCubes(n: number): Promise<void> {
  const t0 = Date.now()
  while (cubes() < n || st().busy) {
    if (Date.now() - t0 > 10000) throw new Error(`кубов ${cubes()}, ожидалось ${n}`)
    await act(async () => { await sleep(20) })
  }
  await act(async () => { await sleep(100) })
  expect(cubes()).toBe(n)
}

describe('PLUG-AND-PLAY — клики по иконке (и из очереди) — один режим, фигура — только при размещении', () => {
  const pm = () => usePlacementModeStore.getState()
  const place = (t: PlaceableShape) => pm().startPlacement(t)

  it('медленный CPU: клики по «Кубу» через 300 мс обработаны подряд — один режим, фигур нет; поставить — одна', async () => {
    const btn = mountPalette(place)                         // как в App
    clickAt(btn, 10_000)
    clickAt(btn, 10_300)                                    // из очереди — сразу за первым
    expect(pm().placementMode?.shapeType).toBe('cube')
    await act(async () => { await sleep(200) })
    expect(cubes()).toBe(0)                                 // клик по иконке фигуру не создаёт
    await act(async () => { await pm().confirmPlacement() })   // Enter
    await expectCubes(1)
    expect(pm().placementMode).toBeNull()
    expect(notes()).toEqual([])
  })

  it('двойной клик по иконке и поставить дважды подряд — ровно одна фигура', async () => {
    const btn = mountPalette(place)
    clickAt(btn, 20_000)
    clickAt(btn, 20_100)
    const first = pm().confirmPlacement()
    const second = pm().confirmPlacement()                  // второй Enter / клик до конца первого
    expect(await first).toBe(true)
    expect(await second).toBe(false)
    await expectCubes(1)
  })

  it('клик, поставить, клик, поставить (через 300 мс) — две фигуры по очереди, ни одна не теряется', async () => {
    const btn = mountPalette(place)
    clickAt(btn, 30_000)
    const a = pm().confirmPlacement()                        // стор занят первым кубом
    clickAt(btn, 30_300)
    const b = pm().confirmPlacement()                        // ждёт очереди
    expect([await a, await b]).toEqual([true, true])
    await expectCubes(2)
    expect(notes()).toEqual([])
  })
})

// ── палитра не уезжает: прокрутка истории — только в своём списке ──
const rect = (top: number, height: number): DOMRect =>
  ({ top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
/** Геометрия (jsdom без вёрстки): `of(el)` — прямоугольник, `clientHeight` — высота видимой части списков. */
function mockLayout(of: (el: Element) => DOMRect, clientHeight: (el: Element) => number): () => void {
  const r = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) { return of(this) })
  const h = vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) { return clientHeight(this) })
  return () => { r.mockRestore(); h.mockRestore() }
}
/** Вызовы `el.scrollTo` (у jsdom его нет): кто прокручивался и куда. */
function recordScrollTo(): { calls: Array<{ el: Element; top: number | undefined }>; restore: () => void } {
  const calls: Array<{ el: Element; top: number | undefined }> = []
  const proto = Element.prototype as unknown as { scrollTo?: (o: ScrollToOptions) => void }
  const had = proto.scrollTo
  proto.scrollTo = function (this: Element, o: ScrollToOptions) { calls.push({ el: this, top: o.top }) }
  return { calls, restore: () => { if (had) proto.scrollTo = had; else delete proto.scrollTo } }
}

describe('DOUBLE-CLICK-TIMING — палитра не уезжает: история прокручивает только свой список', () => {
  const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
  const ops = Array.from({ length: 12 }, (_, i) => (
    { type: 'add_shape', id: `obj_${i + 1}`, shapeType: 'cube', params: {}, color: '#fff', transform: ID })) as unknown as TinkerCraftOperation[]

  it('новый шаг ниже видимой части истории: прокручен список истории, левая панель (с палитрой) — нет', () => {
    // левая панель 0…850 (прокручивается), палитра вверху; история внизу: список 600…820, видно 220
    const restoreLayout = mockLayout((el) => {
      if (el.classList.contains('tl-list')) return rect(600, 220)
      if (el.classList.contains('tl-item')) return el.classList.contains('current') ? rect(830, 22) : rect(610, 22)
      return rect(0, 850)
    }, (el) => (el.classList.contains('tl-list') ? 220 : el.classList.contains('panel-left') ? 850 : 0))
    const scroll = recordScrollTo()
    const intoView = vi.spyOn(Element.prototype, 'scrollIntoView')
    try {
      host = document.createElement('div')
      host.className = 'panel-left'
      document.body.appendChild(host)
      root = createRoot(host)
      act(() => root!.render(<Timeline operations={ops} historyIndex={11} busy={false} onJump={noop} filters={{}} />))
      scroll.calls.length = 0
      act(() => root!.render(<Timeline operations={ops} historyIndex={12} busy={false} onJump={noop} filters={{}} />))  // + фигура
      expect(intoView).not.toHaveBeenCalled()                       // не двигает предков
      expect(scroll.calls).toHaveLength(1)
      expect(scroll.calls[0].el.classList.contains('tl-list')).toBe(true)
      expect(scroll.calls[0].top).toBe(32)                          // низ шага 852 − низ списка 820
      expect(host.scrollTop).toBe(0)                                // панель с палитрой на месте
    } finally {
      intoView.mockRestore(); scroll.restore(); restoreLayout()
    }
  })

  it('scrollListToItem: виден — не двигает; выше — к верхнему краю; ниже — к нижнему; без scrollTo — scrollTop', () => {
    const list = document.createElement('div')
    const item = document.createElement('div')
    list.appendChild(item)
    let itemRect = rect(120, 20)                                    // список 100…320
    const restoreLayout = mockLayout((el) => (el === list ? rect(100, 220) : itemRect), (el) => (el === list ? 220 : 0))
    const scroll = recordScrollTo()
    try {
      list.scrollTop = 50
      scrollListToItem(list, item)
      expect(scroll.calls).toEqual([])                              // виден целиком
      itemRect = rect(80, 20)
      scrollListToItem(list, item)
      expect(scroll.calls.at(-1)).toEqual({ el: list, top: 30 })     // выше на 20 → 50 − 20
      itemRect = rect(330, 20)
      scrollListToItem(list, item)
      expect(scroll.calls.at(-1)).toEqual({ el: list, top: 80 })     // ниже на 30 → 50 + 30
      itemRect = rect(-200, 20)
      scrollListToItem(list, item)
      expect(scroll.calls.at(-1)).toEqual({ el: list, top: 0 })      // не меньше 0
    } finally { scroll.restore() }
    try {
      itemRect = rect(330, 20)
      list.scrollTop = 0
      scrollListToItem(list, item)                                   // jsdom: scrollTo нет
      expect(list.scrollTop).toBe(30)
    } finally { restoreLayout() }
  })
})
