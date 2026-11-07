// ============================================================
// ux-audit.test.tsx — UX-AUDIT (v1.3.2): регресс-тесты исправленных UX-багов (fix-all)
// ============================================================
// Баги найдены прогоном «как пользователь» (v1.3.2) и были зафиксированы парой
// `it.fails` «ожидание» + `it` «реальность». В fix-all все 10 исправлены: «ожидания» стали
// обычными тестами, «реальности» удалены. Новый известный баг — снова `it.fails` (AGENTS.md).
// Описание, приоритет и шаги — DEVELOPMENT_PLAN.md › «UX-AUDIT (v1.3.2)».
// Браузерные проверки тех же багов — e2e/ux-audit.mjs.

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
import NumInput from '../components/NumInput'
import PropertiesPanel from '../components/PropertiesPanel'
import ConfirmModal from '../components/ConfirmModal'
import TextModal from '../components/TextModal'
import WebGLFallback from '../components/WebGLFallback'
import { displayName } from '../components/ComponentTree'
import { useDocumentStore, canUndoClear } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { useAutosave } from '../hooks/useAutosave'
import { restoreSession } from '../io/autosave'
import { buildTextMesh } from '../io/text-mesh'
import { addTextObject } from '../store/add-text'
import { createAddShapeGate, addShapeWhenIdle } from '../store/add-shape-queue'
import { ADD_SHAPE_DEBOUNCE_MS } from '../constants'
import type { SceneObject, ShapeParams, ShapeType, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0): TransformNR => ({ ...ID, x, y, z })
const notes = () => useNotifications.getState().notifications

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
/** Пустой документ — как после перезагрузки страницы (стор, снимки, дерево). */
function freshDocument(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false, fileName: null, clearedDocument: null })
  clearSnapshots(); clearTree()
}
beforeEach(async () => {
  freshDocument()
  _resetMockIndexedDB()
  useNotifications.setState({ notifications: [] })
  await i18n.changeLanguage('ru')
})

/** Ждать условие, отдавая управление эффектам React и воркеру. */
async function until(cond: () => boolean, ms = 10000): Promise<void> {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('until: не дождались')
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
  }
}

let root: Root | null = null
let host: HTMLDivElement | null = null
function mount(el: React.ReactElement): HTMLDivElement {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(el))
  return host
}
function unmountNow(): void {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null
}
afterEach(unmountNow)

async function shape(type: ShapeType, params: ShapeParams, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape(type, params)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}

/** 3D-текст ровно как App.handleAddText: `addTextObject` (сварка вершин, имя «Текст: …»). */
async function addText(text: string): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  expect(await addTextObject(text, { size: 10, depth: 5 })).toBe(true)
  return Object.keys(st().objects).find((k) => !before.has(k))!
}

/** Объём замкнутого меша (сумма знаковых тетраэдров), мм³. */
function meshVolume(v: ArrayLike<number>, idx: ArrayLike<number>): number {
  let vol = 0
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3
    vol += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1])
      - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c])
      + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6
  }
  return vol
}

describe('UX-AUDIT-1 — автосохранение восстанавливается при старте', () => {
  /** Корень App, сведённый к автосохранению: `useAutosave(workerOk)`. */
  function Startup({ workerOk }: { workerOk: boolean }): null { useAutosave(workerOk); return null }
  async function scene(): Promise<void> {
    await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    await shape('sphere', { radius: 8, segments: 16 }, at(30))
  }

  it('перезагрузка → работа восстановлена (объекты, история, «не сохранено»), уведомление', async () => {
    await scene()
    await st().triggerAutosave()
    const ops = st().operations.length
    freshDocument()                                        // «F5»
    mount(<Startup workerOk={true} />)
    await until(() => Object.keys(st().objects).length === 2)
    expect(st().operations).toHaveLength(ops)
    expect(st().historyIndex).toBe(ops)
    expect(st().modified).toBe(true)                       // работа не в файле — «● Не сохранено»
    expect(notes().map((n) => n.message)).toContain(i18n.t('autosave.restored'))
  })

  it('до готовности воркера не восстанавливает; после — один раз', async () => {
    await scene()
    await st().triggerAutosave()
    freshDocument()
    const h = document.createElement('div'); document.body.appendChild(h)
    const r = createRoot(h)
    act(() => r.render(<Startup workerOk={false} />))
    await act(async () => { await new Promise((res) => setTimeout(res, 100)) })
    expect(Object.keys(st().objects)).toHaveLength(0)
    act(() => r.render(<Startup workerOk={true} />))
    await until(() => Object.keys(st().objects).length === 2)
    act(() => r.render(<Startup workerOk={true} />))      // повторный рендер — без второго восстановления
    await act(async () => { await new Promise((res) => setTimeout(res, 100)) })
    expect(notes().filter((n) => n.message === i18n.t('autosave.restored'))).toHaveLength(1)
    act(() => r.unmount()); h.remove()
  })

  it('«Очистить сцену» чистит автосохранение — после перезагрузки сцена пуста', async () => {
    await scene()
    await st().triggerAutosave()
    expect((await restoreSession())?.operations.length).toBe(st().operations.length)
    await st().clearScene()
    expect(await restoreSession()).toBeNull()
    freshDocument()
    expect(await st().restoreAutosave()).toBe(false)
    expect(Object.keys(st().objects)).toHaveLength(0)
  })

  it('не затирает текущую работу: при непустой сцене восстановление отклоняется', async () => {
    await scene()
    await st().triggerAutosave()
    freshDocument()
    const cube = await shape('cube', { width: 5, height: 5, depth: 5 }, at(0))
    expect(await st().restoreAutosave()).toBe(false)
    expect(Object.keys(st().objects)).toEqual([cube])
  })
})

describe('UX-AUDIT-2 — «Очистить сцену»: подтверждение и отмена', () => {
  async function scene(): Promise<void> {
    await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    await shape('sphere', { radius: 8, segments: 16 }, at(30))
  }
  it('после «Очистить сцену» Ctrl+Z возвращает объекты, историю (с redo) и «не сохранено»', async () => {
    await scene()
    const ids = Object.keys(st().objects).sort()
    await st().undo()                                      // в истории есть шаг для redo
    const ops = st().operations.length, idx = st().historyIndex
    expect(idx).toBe(ops - 1)
    await st().clearScene()
    expect(Object.keys(st().objects)).toHaveLength(0)
    expect(canUndoClear(st())).toBe(true)
    await st().undo()
    expect(Object.keys(st().objects).sort()).toEqual(ids)
    expect(st().operations).toHaveLength(ops)
    expect(st().historyIndex).toBe(idx)
    expect(st().modified).toBe(true)
    expect(canUndoClear(st())).toBe(false)
    await st().redo()                                      // redo после восстановления работает
    expect(st().historyIndex).toBe(ops)
    expect(st().objects[ids[1]].transform.x).toBeCloseTo(30, 4)
  })
  it('после очистки сделано действие — отмена очистки больше недоступна', async () => {
    await scene()
    await st().clearScene()
    const cube = await shape('cube', { width: 5, height: 5, depth: 5 }, at(0))
    expect(canUndoClear(st())).toBe(false)
    await st().undo()                                      // отменяет новый куб
    expect(Object.keys(st().objects)).toHaveLength(0)
    await st().undo()                                      // дальше отменять нечего — документ до очистки не возвращается
    expect(Object.keys(st().objects)).toHaveLength(0)
    expect(st().operations).toHaveLength(1)
    expect(st().operations[0]).toMatchObject({ type: 'add_shape', id: cube })
  })
  it('очистка пустой сцены — no-op, снимок прежней очистки сохраняется', async () => {
    await scene()
    await st().clearScene()
    await st().clearScene()
    await st().undo()
    expect(Object.keys(st().objects)).toHaveLength(2)
  })
  it('ConfirmModal: «Отмена» и Esc не подтверждают, «Очистить» подтверждает; клавиши не уходят наружу', () => {
    const onConfirm = vi.fn(), onCancel = vi.fn(), outer = vi.fn()
    window.addEventListener('keydown', outer)
    const h = mount(<ConfirmModal title="T" message="M" confirmLabel="Очистить" onConfirm={onConfirm} onCancel={onCancel} />)
    const [confirm, cancel] = Array.from(h.querySelectorAll('button'))
    expect(document.activeElement).toBe(cancel)            // фокус на безопасной кнопке
    act(() => { cancel.click() })
    expect(onCancel).toHaveBeenCalledTimes(1)
    act(() => { cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(onCancel).toHaveBeenCalledTimes(2)
    act(() => { cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true })) })
    expect(outer).not.toHaveBeenCalled()                   // Delete/Ctrl+Z под модалкой не срабатывают
    act(() => { confirm.click() })
    expect(onConfirm).toHaveBeenCalledTimes(1)
    window.removeEventListener('keydown', outer)
  })
})

describe('UX-AUDIT-3 — 3D-текст участвует в CSG', () => {
  it('куб − текст «A» (гравировка): CSG выполняется, объём уменьшился, уведомлений нет', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const txt = await addText('A')
    await st().moveObject(txt, { ...st().objects[txt].transform, x: 0, y: 0, z: 8 })
    st().selectObjects([cube, txt], false)
    await st().csgBoolean('subtract')
    const objs = Object.values(st().objects)
    expect(objs).toHaveLength(1)
    expect(objs[0].shapeType).toBe('csg')
    const vol = meshVolume(objs[0].vertices, objs[0].indices)
    expect(vol).toBeGreaterThan(7000)
    expect(vol).toBeLessThan(8000 - 50)                    // буква вырезана
    expect(notes().filter((n) => n.type !== 'info')).toEqual([])
  })
  it('меш текста замкнут: каждое ребро — ровно у двух треугольников (встречно), вырожденных нет', async () => {
    for (const text of ['A', 'Hi 8', 'Привет']) {
      const { vertices, indices } = await buildTextMesh(text, { size: 10, depth: 5 })
      expect(vertices.length / 3).toBeLessThan(indices.length)           // вершины общие (не 3 на треугольник)
      const edges = new Map<string, number>()
      for (let i = 0; i < indices.length; i += 3) {
        const t = [indices[i], indices[i + 1], indices[i + 2]]
        expect(new Set(t).size).toBe(3)
        for (let k = 0; k < 3; k++) {
          const key = `${t[k]}>${t[(k + 1) % 3]}`
          edges.set(key, (edges.get(key) ?? 0) + 1)
        }
      }
      for (const [key, n] of edges) {
        expect(n).toBe(1)                                                // ориентированное ребро — один раз
        const [a, b] = key.split('>')
        expect(edges.get(`${b}>${a}`)).toBe(1)                           // и есть встречное
      }
      expect(meshVolume(vertices, indices)).toBeGreaterThan(0)          // наружу смотрят нормали
    }
  })
  it('текст с цифрами и кириллицей ∪ куб и куб ∩ текст — CSG выполняется', async () => {
    for (const op of ['union', 'intersect'] as const) {
      freshDocument()
      const cube = await shape('cube', { width: 60, height: 20, depth: 20 }, at(0))
      const txt = await addText('Ёж 42')
      await st().moveObject(txt, { ...st().objects[txt].transform, x: 0, y: 0, z: 0 })
      st().selectObjects([cube, txt], false)
      await st().csgBoolean(op)
      expect(Object.keys(st().objects)).toHaveLength(1)
      expect(notes().filter((n) => n.type !== 'info')).toEqual([])
    }
  })
})

describe('UX-AUDIT-4 — пустой результат CSG: уведомление, объекты и история не тронуты', () => {
  async function pair(b: TransformNR, sizeB = 8): Promise<[string, string]> {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s2 = await shape('sphere', { radius: sizeB, segments: 16 }, b)
    st().selectObjects([a, s2], false)
    return [a, s2]
  }
  it('пересечение непересекающихся — уведомление «результат пуст», объекты и история не тронуты', async () => {
    const [a, b] = await pair(at(40))
    const ops = st().operations.length
    await st().csgBoolean('intersect')
    expect(Object.keys(st().objects).sort()).toEqual([a, b].sort())
    expect(st().operations).toHaveLength(ops)
    expect(st().busy).toBe(false)
    expect(notes()).toEqual([expect.objectContaining({ type: 'warning', message: i18n.t('errors.csgEmpty') })])
  })
  it('вычитание «всего» (малый куб − большая сфера) — тоже отказ с уведомлением', async () => {
    const a = await shape('cube', { width: 4, height: 4, depth: 4 }, at(0))
    const b = await shape('sphere', { radius: 20, segments: 24 }, at(0))
    st().selectObjects([a, b], false)
    const ops = st().operations.length
    await st().csgBoolean('subtract')
    expect(Object.keys(st().objects).sort()).toEqual([a, b].sort())
    expect(st().operations).toHaveLength(ops)
    expect(notes().at(-1)?.message).toBe(i18n.t('errors.csgEmpty'))
  })
  it('непустое пересечение — как раньше: CSG-результат и шаг истории, без уведомлений', async () => {
    await pair(at(12))
    const ops = st().operations.length
    await st().csgBoolean('intersect')
    const objs = Object.values(st().objects)
    expect(objs).toHaveLength(1)
    expect(objs[0].indices.length).toBeGreaterThan(0)
    expect(st().operations).toHaveLength(ops + 1)
    expect(notes()).toEqual([])
  })
})

describe('UX-AUDIT-6 — 3D-текст в дереве называется «Текст: …»', () => {
  const tr = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts)
  it('объект текста носит имя «Текст: Hi» — его и показывает дерево', async () => {
    const id = await addText('Hi')
    expect(st().objects[id].name).toBe('Текст: Hi')
    expect(displayName(st().objects[id], tr)).toBe('Текст: Hi')
  })
  it('живое = rebuild: имя то же после undo/redo без снимков (перестройка из истории)', async () => {
    const id = await addText('Hi')
    await shape('cube', { width: 5, height: 5, depth: 5 }, at(40))
    clearSnapshots()
    await st().undo(); await st().redo()
    expect(st().objects[id].name).toBe('Текст: Hi')
  })
  it('en — «Text: Hi»', async () => {
    await i18n.changeLanguage('en')
    const id = await addText('Hi')
    expect(st().objects[id].name).toBe('Text: Hi')
  })
})

describe('UX-AUDIT-7 — английский интерфейс без русских строк', () => {
  const CYR = /[А-Яа-яЁё]/
  it('en — единица поля «mm», ru — «мм»; явная единица не меняется', async () => {
    await i18n.changeLanguage('en')
    let h = mount(<NumInput label="X" value={1} onChange={() => {}} />)
    expect(h.querySelector('.num-label')!.textContent).toBe('mm')
    unmountNow()
    await i18n.changeLanguage('ru')
    h = mount(<NumInput label="X" value={1} onChange={() => {}} />)
    expect(h.querySelector('.num-label')!.textContent).toBe('мм')
    unmountNow()
    h = mount(<NumInput label="rotX" unit="°" value={1} onChange={() => {}} />)
    expect(h.querySelector('.num-label')!.textContent).toBe('°')
  })
  it('en — модалка текста, подтверждение очистки, экран «нет WebGL» без кириллицы', async () => {
    await i18n.changeLanguage('en')
    const noop = (): void => {}
    for (const el of [
      <TextModal key="t" textInput="Hi" textSize={10} textDepth={5} busy={false} workerOk onTextChange={noop} onSizeChange={noop} onDepthChange={noop} onAdd={noop} onClose={noop} />,
      <ConfirmModal key="c" title={i18n.t('confirmClear.title')} message={i18n.t('confirmClear.message')} confirmLabel={i18n.t('confirmClear.confirm')} onConfirm={noop} onCancel={noop} />,
      <WebGLFallback key="w" />,
    ]) {
      const h = mount(el)
      expect(h.textContent!.length).toBeGreaterThan(5)
      expect(h.textContent).not.toMatch(CYR)
      unmountNow()
    }
  })
  it('en — ошибка отмены/повтора в уведомлении без русского названия действия', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t('errors.operationFailed', { name: i18n.t('errors.historyAction.undo') })).toBe('Operation failed: undo')
    expect(i18n.t('viewportStatus.loadingCsg')).toBe('Loading CSG (WASM)…')
  })
})

describe('UX-AUDIT-8 — целое поле «Граней» без «.0»', () => {
  const prism: SceneObject = {
    id: 'p1', shapeType: 'prism', params: { radius: 12, height: 20, sides: 6 }, color: '#94e2d5', visible: true, locked: false,
    transform: ID, vertices: new Float32Array(9), indices: new Uint32Array([0, 1, 2]),
  }
  const panel = () => {
    const noop = (): void => {}
    return mount(
      <PropertiesPanel
        firstSelected={prism} busy={false} selectedIds={[prism.id]} canResize canCsg={false}
        objectList={[prism]} operationsLength={1} fileName={null} currentProjectId={null} currentProjectName={null} modified={false}
        onMoveAxis={noop} onRotAxis={noop} onScaleAxis={noop} onResizeDim={noop} onResizeObject={noop}
        onCsg={noop} onSetColor={noop} onToggleVisible={noop} onShowProjects={noop} onSaveToProject={noop}
      />,
    )
  }
  const sidesValue = (h: HTMLElement) =>
    Array.from(h.querySelectorAll('.props-row')).find((r) => r.querySelector('.props-label')?.textContent === i18n.t('properties.sides'))!
      .querySelector('input')!.value
  it('«Граней 6» — без дробной части', () => {
    expect(sidesValue(panel())).toBe('6')
  })
  it('целое поле: ввод 7.6 → 8 (округление), шаг 1; обычное поле — как раньше (1 знак)', () => {
    const got: number[] = []
    const h = mount(<NumInput label="n" unit="" integer min={3} value={6} onChange={(v) => got.push(v)} />)
    const input = h.querySelector('input')!
    expect(input.value).toBe('6')
    expect(input.step).toBe('1')
    const setValue = (v: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, v)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    act(() => { setValue('7.6') })
    act(() => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    act(() => { setValue('1') })                           // меньше min — 3
    act(() => { input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })) })
    expect(got).toEqual([8, 3])
    unmountNow()
    const h2 = mount(<NumInput label="X" value={6} onChange={() => {}} />)
    expect(h2.querySelector('input')!.value).toBe('6.0')
  })
})

describe('UX-AUDIT-9 — двойной клик по фигуре: <200 мс — одна, позже — две', () => {
  it('фильтр: повтор той же фигуры через 100 мс отброшен, через 300 мс — принят; разные фигуры независимы', () => {
    expect(ADD_SHAPE_DEBOUNCE_MS).toBe(200)
    let now = 0
    const gate = createAddShapeGate(() => now)
    expect(gate('cube')).toBe(true)
    now = 100; expect(gate('cube')).toBe(false)            // случайный двойной клик
    now = 110; expect(gate('sphere')).toBe(true)           // другая фигура — не мешает
    now = 300; expect(gate('cube')).toBe(true)             // осознанный второй клик
    now = 450; expect(gate('cube')).toBe(false)            // тройной 300/450/600: отсчёт от принятого
    now = 600; expect(gate('cube')).toBe(true)
  })
  it('клик во время занятого стора не теряется: фигуры добавляются по очереди, когда стор свободен', async () => {
    useDocumentStore.setState({ busy: true })              // идёт долгая операция (CSG)
    const p1 = addShapeWhenIdle('cube')
    const p2 = addShapeWhenIdle('sphere')
    await new Promise((r) => setTimeout(r, 50))
    expect(Object.keys(st().objects)).toHaveLength(0)       // ждут
    useDocumentStore.setState({ busy: false })
    expect(await p1).toBe(true)
    expect(await p2).toBe(true)
    expect(Object.values(st().objects).map((o) => o.shapeType)).toEqual(['cube', 'sphere'])
    expect(notes()).toEqual([])                             // без уведомлений
  })
  it('стор занят дольше срока ожидания — клик отменяется без фигуры', async () => {
    useDocumentStore.setState({ busy: true })
    expect(await addShapeWhenIdle('cube', 60)).toBe(false)
    useDocumentStore.setState({ busy: false })
    expect(Object.keys(st().objects)).toHaveLength(0)
  })
})

describe('UX-AUDIT-10 — ошибка создания текста → уведомление (а не только console.error)', () => {
  it('ошибка построителя → «Не удалось создать текст: <причина>», объект не добавлен', async () => {
    const err = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ok = await addTextObject('Hi', { size: 10, depth: 5 }, async () => { throw new Error('шрифт не загрузился') })
    expect(ok).toBe(false)
    expect(Object.keys(st().objects)).toHaveLength(0)
    expect(notes()).toEqual([expect.objectContaining({ type: 'error', message: 'Не удалось создать текст: шрифт не загрузился' })])
    err.mockRestore()
  })
  it('геометрии нет (строка из одних пробелов) — уведомление с понятной причиной', async () => {
    const err = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await addTextObject('x', { size: 10, depth: 5 }, (_t, o) => buildTextMesh('   ', o))).toBe(false)
    expect(notes().at(-1)?.message).toBe(i18n.t('errors.textFailed', { reason: i18n.t('errors.textNoGlyphs') }))
    err.mockRestore()
  })
  it('размер или глубина 0 — уведомление; en — по-английски', async () => {
    const err = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await addTextObject('Hi', { size: 0, depth: 5 })).toBe(false)
    expect(notes().at(-1)?.message).toBe('Не удалось создать текст: размер и глубина должны быть больше 0')
    await i18n.changeLanguage('en')
    expect(await addTextObject('Hi', { size: 10, depth: 0 })).toBe(false)
    expect(notes().at(-1)?.message).toBe('Could not create the text: size and depth must be greater than 0')
    err.mockRestore()
  })
  it('удачно — true, без уведомлений; пустая строка → «Text»', async () => {
    const id = await addText('  ')
    expect(st().objects[id].name).toBe('Текст: Text')
    expect(notes()).toEqual([])
  })
})
