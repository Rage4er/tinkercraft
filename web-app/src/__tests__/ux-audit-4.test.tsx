// ============================================================
// ux-audit-4.test.tsx — UX-прогон 4 (H–N + O–T повторно, U–Y, UX-AUDIT-32): логика на реальном WASM
// ============================================================
// ✅ — сценарии U–Y, которые оправдались (регрессия фиксов 29, 31);
// 🐞 — новые баги: `it.fails` «ожидание» — тест проверяет ожидание пользователя и сейчас падает
//      (баг воспроизводится; каждый проверен — падает на своей проверке). После фикса (fix-all-4):
//      `it.fails` → `it`. Браузерная часть — e2e/ux-audit-4.mjs (`knownBug`).
// Описание и шаги — DEVELOPMENT_PLAN.md › «UX-AUDIT-4».

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return { ...bridge }
})

import '../__mocks__/indexeddb'
import { _resetMockIndexedDB } from '../__mocks__/indexeddb'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import * as THREE from 'three'
import i18n from '../i18n'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { useUiStore } from '../store/ui-store'
import { useAlignModeStore } from '../store/align-mode'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { computeRSMatrix } from '../csg/worker-matrix'
import { addTextObject } from '../store/add-text'
import { isTextObject } from '../store/text-object'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import ComponentTree from '../components/ComponentTree'
import { opLabel, filterKeyOf } from '../components/Timeline'
import type { SceneObject, ShapeParams, ShapeType, TransformNR, TinkerCraftOperation } from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0): TransformNR => ({ ...ID, x, y, z })
const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts)
const noop = () => {}
const lastOp = (): TinkerCraftOperation => st().operations[st().historyIndex - 1]

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false, clipboard: [], clearedDocument: null })
  useNotifications.setState({ notifications: [] })
  useUiStore.setState({ expandedTreeIds: {}, selectedChild: null })
  useAlignModeStore.setState({ alignMode: null })
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

async function shape(type: ShapeType, params: ShapeParams | undefined, tr: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape(type, params)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, tr)
  return id
}
/** Мировые вершины треугольника `k` объекта (полный TRS). */
function worldTri(o: SceneObject, k: number): THREE.Vector3[] {
  const tr = o.transform
  const m = computeRSMatrix({ rotX: tr.rotX, rotY: tr.rotY, rotZ: tr.rotZ }, { scaleX: tr.scaleX, scaleY: tr.scaleY, scaleZ: tr.scaleZ })
  return [0, 1, 2].map((j) => {
    const i = o.indices[k * 3 + j]
    const x = o.vertices[i * 3], y = o.vertices[i * 3 + 1], z = o.vertices[i * 3 + 2]
    return new THREE.Vector3(m[0] * x + m[1] * y + m[2] * z + tr.x, m[3] * x + m[4] * y + m[5] * z + tr.y, m[6] * x + m[7] * y + m[8] * z + tr.z)
  })
}
const triNormal = ([a, b, c]: THREE.Vector3[]) => b.clone().sub(a).cross(c.clone().sub(a)).normalize()

// ════════════════════════════════════════════════════════════
// ✅ U–Y: сценарии оправдались — регрессия фиксов 29, 31
// ════════════════════════════════════════════════════════════

describe('UX-прогон 4 — X. История: поворот и масштаб полями — свои шаги и фильтры (UX-AUDIT-29)', () => {
  it('X1: сдвиг / поворот / масштаб → «Переместить» / «Повернуть» / «Масштаб», категории move / rotate / scale', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(5))
    const got: [string, string][] = [[opLabel(lastOp(), t), filterKeyOf(lastOp())]]
    await st().moveObject(c, { ...st().objects[c].transform, rotZ: 30 })
    got.push([opLabel(lastOp(), t), filterKeyOf(lastOp())])
    await st().moveObject(c, { ...st().objects[c].transform, scaleX: 2 })
    got.push([opLabel(lastOp(), t), filterKeyOf(lastOp())])
    expect(got).toEqual([['Переместить', 'move'], ['Повернуть', 'rotate'], ['Масштаб', 'scale']])
  })
})

describe('UX-прогон 4 — U. Текст: переименование и undo/redo (UX-AUDIT-31)', () => {
  it('U1: переименованный текст — по-прежнему «Тип: Текст»; шаг — «Добавить текст: Дом» после undo/redo', async () => {
    await addTextObject('Дом', { size: 10, depth: 2 })
    const id = Object.keys(st().objects)[0]
    st().renameObject(id, 'Логотип')
    expect([st().objects[id].name, isTextObject(st().objects[id])]).toEqual(['Логотип', true])
    await st().undo(); await st().undo(); await st().redo()
    expect(opLabel(st().operations[0], t)).toBe('Добавить текст: Дом')
    expect(isTextObject(st().objects[id])).toBe(true)
  })
})

// ════════════════════════════════════════════════════════════
// 🐞 Новые баги прогона 4 (логика) — it.fails «ожидание»
// ════════════════════════════════════════════════════════════

describe('UX-AUDIT-32 — «Выровнять»: непараллельная грань B не поворачивается в плоскость A', () => {
  // solvePlaneAlignDelta (ALIGN-UI-REVIT) — только сдвиг вдоль нормали плоскости: параллельная грань B
  // ложится в плоскость, непараллельная — объект сдвигается до касания крайней точкой, без поворота.
  // Куб (верх z = 10) и шестигранная призма (верх тоже z = 10): боковая грань призмы → не происходит
  // ничего (крайняя точка уже в плоскости, шага нет).
  it.fails('ожидание: куб — верхняя грань (A), призма — боковая грань (B) → призма повёрнута, грань B — в плоскости A', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const prism = await shape('prism', undefined, at(40))
    const p = st().objects[prism]
    expect(p.params.sides).toBe(6)
    const side = Array.from({ length: p.indices.length / 3 }, (_, k) => k).find((k) => Math.abs(triNormal(worldTri(p, k)).z) < 0.01)!
    const n0 = triNormal(worldTri(p, side)), q0 = worldTri(p, side)[0]
    useAlignModeStore.getState().startAlignMode()
    await useAlignModeStore.getState().clickFace({ objectId: cube, triangleIndex: 0, normal: { x: 0, y: 0, z: 1 }, point: { x: 0, y: 0, z: 10 } })
    await useAlignModeStore.getState().clickFace({ objectId: prism, triangleIndex: side, normal: { x: n0.x, y: n0.y, z: n0.z }, point: { x: q0.x, y: q0.y, z: q0.z } })
    const after = worldTri(st().objects[prism], side)
    const n1 = triNormal(after)
    expect(Math.abs(n1.z)).toBeGreaterThan(Math.cos(THREE.MathUtils.degToRad(1)))     // нормаль B ∥ нормали A (Z)
    for (const v of after) expect(v.z).toBeCloseTo(10, 3)                             // грань B — в плоскости A
    expect(lastOp().type).toBe('move')                                                 // один шаг истории
  })
})

describe('UX-AUDIT-33 — зеркальная копия 3D-текста — «Импорт» (а после перезагрузки — «Текст»)', () => {
  // mirror-store (mirrorObject) переносит в копию `name`, но не `text` (UX-AUDIT-31): живая копия —
  // «Тип: Импорт», иконка импорта. rebuild копирует метаданные источника целиком (с `text`) —
  // после перезагрузки/перемотки та же копия — «Текст»: живое ≠ rebuild.
  it.fails('ожидание: зеркальная копия текста «Дом» — тоже текст, и живая, и после перестроения из истории', async () => {
    await addTextObject('Дом', { size: 10, depth: 2 })
    const id = Object.keys(st().objects)[0]
    st().selectObjects([id], false)
    await st().mirrorSelected('YZ')
    const copy = Object.values(st().objects).find((o) => o.id !== id)!
    expect(copy.name).toBe('Текст: Дом')
    const ops = st().operations.slice(0, st().historyIndex)
    clearSnapshots(); clearTree()
    const rebuilt = await rebuildFromHistory(ops)
    expect(isTextObject(rebuilt[copy.id])).toBe(true)                                  // rebuild — текст
    expect([copy.text, isTextObject(copy)]).toEqual(['Дом', true])                      // живая — импорт (баг)
  })
})

describe('UX-AUDIT-34 — дерево: 3D-текст внутри CSG подписан «Импорт»', () => {
  // ComponentTree.childLabel: запечённый ребёнок без shapeType — «Импорт» (componentTree.import);
  // текст в CSG (куб − «Дом») — тоже «Импорт», хотя сам объект до CSG был «Текст: Дом» (UX-AUDIT-31).
  it.fails('ожидание: куб − текст «Дом» → в раскрытом дереве ребёнок — «Текст …», с иконкой текста', async () => {
    const cube = await shape('cube', { width: 60, height: 60, depth: 20 }, at(0))
    await addTextObject('Дом', { size: 10, depth: 15 })
    const txt = Object.keys(st().objects).find((k) => k !== cube)!
    st().selectObjects([cube, txt], false)
    await st().csgBoolean('subtract')
    const g = Object.keys(st().objects)[0]
    useUiStore.setState({ expandedTreeIds: { [g]: true } })
    const h = mount(<ComponentTree objects={Object.values(st().objects)} selectedIds={new Set()} onSelect={noop} onRename={noop} onToggleVis={noop} onDelete={noop} />)
    const children = [...h.querySelectorAll('.ct-child .ct-name')].map((e) => e.textContent ?? '')
    expect(children).toHaveLength(2)
    expect(children[0]).toMatch(/^Куб/)
    expect(children[1]).toMatch(/^Текст/)
    // после перестроения из истории (загрузка .3dtc) — так же
    const ops = st().operations.slice(0, st().historyIndex)
    clearSnapshots(); clearTree()
    const rebuilt = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, rebuilt)
    act(() => root!.render(<ComponentTree objects={Object.values(rebuilt)} selectedIds={new Set()} onSelect={noop} onRename={noop} onToggleVis={noop} onDelete={noop} />))
    expect([...h.querySelectorAll('.ct-child .ct-name')].map((e) => e.textContent ?? '')[1]).toMatch(/^Текст/)
  })
})
