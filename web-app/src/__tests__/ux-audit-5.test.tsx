// ============================================================
// ux-audit-5.test.tsx — UX-прогон 5 (H–N + O–T + U–Y повторно, UX-AUDIT-32-followup): логика на
// реальном WASM
// ============================================================
// ✅ — новые сценарии прогона, которые оправдались (регрессия фиксов 32–34);
// 🐞 — баги прогона 5 (UX-AUDIT-32-followup, 36–40): были `it.fails` «ожидание» (каждый падал на своей
//      проверке), исправлены в fix-all-5 — `it`, с проверками фиксов. Браузерная часть —
//      e2e/ux-audit-5.mjs (были `knownBug`, теперь обычные проверки).
// Описание и шаги — DEVELOPMENT_PLAN.md › «UX-AUDIT-5».

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
import { rebuildFromHistory } from '../store/rebuild'
import ComponentTree, { displayName } from '../components/ComponentTree'
import StepPanel from '../components/StepPanel'
import { opLabel } from '../components/Timeline'
import { fitDistance, FIT_DIR } from '../components/camera-fit'
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
  useUiStore.setState({ expandedTreeIds: {}, selectedChild: null, selectedStep: null })
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
afterEach(async () => {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null
  await i18n.changeLanguage('ru')
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
/** Грань объекта (первый треугольник, нормаль которого принимает `accept`): индекс, мировые нормаль и точка (вершина). */
function face(id: string, accept: (n: THREE.Vector3) => boolean, vertex = 0) {
  const o = st().objects[id]
  const k = Array.from({ length: o.indices.length / 3 }, (_, i) => i).find((i) => accept(triNormal(worldTri(o, i))))!
  const n = triNormal(worldTri(o, k)), q = worldTri(o, k)[vertex]
  return { objectId: id, triangleIndex: k, normal: { x: n.x, y: n.y, z: n.z }, point: { x: q.x, y: q.y, z: q.z } }
}
async function align(a: ReturnType<typeof face> | 'X' | 'Y' | 'Z', ...bs: ReturnType<typeof face>[]) {
  const m = useAlignModeStore.getState()
  m.startAlignMode()
  if (bs.length > 1) useAlignModeStore.getState().toggleMultiple()
  if (typeof a === 'string') useAlignModeStore.getState().setPlane({ axis: a })
  else await useAlignModeStore.getState().clickFace(a)
  for (const b of bs) await useAlignModeStore.getState().clickFace(b)
  useAlignModeStore.getState().exitAlignMode()
}
const COS1 = Math.cos(THREE.MathUtils.degToRad(1))

// ════════════════════════════════════════════════════════════
// ✅ K, O: сценарии прогона 5 оправдались — регрессия фиксов 32–34
// ════════════════════════════════════════════════════════════

describe('UX-прогон 5 — K. «Выровнять» с поворотом: наклонная плоскость A, CSG, правка ребёнка (UX-AUDIT-32)', () => {
  it('K1: A — бок повёрнутого куба (rotZ 30), B — верх CSG (куб ∪ сфера) → нормаль B = нормаль A, грань в плоскости; правка сферы ребёнка не сдвигает CSG; живое = rebuild', async () => {
    const r = await shape('cube', { width: 20, height: 20, depth: 20 }, { ...at(0), rotZ: 30 })
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(45))
    const b = await shape('sphere', { radius: 12, segments: 32 }, at(55))
    st().selectObjects([a, b], false); await st().csgBoolean('union')
    const g = Object.keys(st().objects).find((k) => st().objects[k].shapeType === 'csg')!
    const nA = new THREE.Vector3(Math.cos(Math.PI / 6), 0.5, 0)
    const fA = face(r, (n) => n.dot(nA) > 0.9999)
    const fB = face(g, (n) => n.z > 0.9999)
    await align(fA, fB)
    const o = st().objects[g]
    const after = worldTri(o, fB.triangleIndex)
    expect(triNormal(after).dot(nA)).toBeGreaterThan(COS1)                              // в ту же сторону
    for (const v of after) expect(v.dot(nA)).toBeCloseTo(10, 3)                           // грань B — в плоскости A
    expect(opLabel(lastOp(), t)).toBe('Повернуть')
    const tr0 = { ...o.transform }
    await st().editChildParams(g, b, { radius: 15, segments: 32 })
    expect(st().objects[g].transform).toEqual(tr0)                                        // CSG на месте
    expect(st().objects[g].indices.length).not.toBe(o.indices.length)                     // геометрия пересчитана
    const live = st().objects[g]
    const ops = st().operations.slice(0, st().historyIndex)
    clearSnapshots(); clearTree()
    const rebuilt = (await rebuildFromHistory(ops))[g]
    expect(rebuilt.transform.x).toBeCloseTo(live.transform.x, 4)
    expect(rebuilt.transform.rotY).toBeCloseTo(live.transform.rotY, 4)
    expect(rebuilt.indices.length).toBe(live.indices.length)
  })
})

describe('UX-прогон 5 — O. Текст: зеркало зеркала, вставка, вложенный CSG (UX-AUDIT-33/34)', () => {
  it('O1: текст → зеркало YZ → зеркало XZ → вставка: все — «Текст»; во вложенном CSG и его зеркальной копии — «Текст: Дом»', async () => {
    await addTextObject('Дом', { size: 10, depth: 2 })
    const t1 = Object.keys(st().objects)[0]
    st().selectObjects([t1], false); await st().mirrorSelected('YZ')
    const m1 = Object.keys(st().objects).find((k) => k !== t1)!
    st().selectObjects([m1], false); await st().mirrorSelected('XZ')
    const m2 = Object.keys(st().objects).find((k) => k !== t1 && k !== m1)!
    st().selectObjects([m2], false); st().copySelected(); await st().pasteClipboard()
    expect(opLabel(lastOp(), t)).toBe('Вставить текст')
    expect(Object.values(st().objects).every((o) => isTextObject(o))).toBe(true)
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(60))
    await st().moveObject(m1, { ...st().objects[m1].transform, x: 55 })
    st().selectObjects([m1, cube], false); await st().csgBoolean('union')
    const g1 = Object.keys(st().objects).find((k) => st().objects[k].shapeType === 'csg')!
    const sp = await shape('sphere', { radius: 12, segments: 32 }, at(70))
    st().selectObjects([g1, sp], false); await st().csgBoolean('union')
    const g2 = Object.keys(st().objects).find((k) => st().objects[k].shapeType === 'csg')!
    st().selectObjects([g2], false); await st().mirrorSelected('YZ')
    const mg = Object.keys(st().objects).find((k) => st().objects[k].shapeType === 'csg' && k !== g2)!
    useUiStore.setState({ expandedTreeIds: { [g2]: true, [mg]: true, [g1]: true, [`${mg}:${g1}`]: true } })
    const h = mount(<ComponentTree objects={Object.values(st().objects)} selectedIds={new Set()} onSelect={noop} onRename={noop} onToggleVis={noop} onDelete={noop} />)
    const names = [...h.querySelectorAll('.ct-child .ct-name')].map((e) => e.textContent ?? '')
    expect(names).toContain('Текст: Дом')
    expect(names).toContain('Текст: Дом (зеркало)')
    expect(names.some((n) => n.startsWith('Импорт'))).toBe(false)
  })
})

// ════════════════════════════════════════════════════════════
// 🐞 Баги прогона 5 (логика) — исправлены в fix-all-5
// ════════════════════════════════════════════════════════════

describe('UX-AUDIT-32-followup — «Выровнять» с поворотом: объект не уходит вбок', () => {
  // Было: поворот (UX-AUDIT-32, fix-all-4) — вокруг точки клика на грани B: центр объекта смещался
  // вдоль плоскости A на величину, зависящую от того, куда кликнули (призма X 40: Y −19,4 в e2e; две
  // одинаковые призмы «Множественным» — Y −11,1 и −5,1). Исправлено в fix-all-5: поворот на месте
  // (вокруг опорной точки объекта, как поворот полями) + сдвиг только вдоль нормали A.
  it('призма X 40 → верх куба боковой гранью: повёрнута, грань B в плоскости A, X/Y — прежние (40, 0)', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const prism = await shape('prism', undefined, at(40))
    const b = face(prism, (n) => Math.abs(n.z) < 0.01)
    await align(face(cube, (n) => n.z > 0.99), b)
    const o = st().objects[prism]
    const after = worldTri(o, b.triangleIndex)
    expect(triNormal(after).z).toBeGreaterThan(COS1)                                   // поворот — есть
    for (const v of after) expect(v.z).toBeCloseTo(10, 3)                              // грань B — в плоскости A
    expect(o.transform.z).toBeCloseTo(10 - 12 * Math.cos(Math.PI / 6), 3)              // сдвиг вдоль нормали A
    expect([o.transform.x, o.transform.y]).toEqual([40, 0])                            // без смещения вбок (было X 22,3 — от точки клика)
  })
  it('«Множественное» — две одинаковые призмы, клик в разные вершины грани → одинаковый сдвиг (только по Z)', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const p1 = await shape('prism', undefined, at(40))
    const p2 = await shape('prism', undefined, at(-40))
    const side = (n: THREE.Vector3) => Math.abs(n.z) < 0.01 && n.y < -0.99
    await align(face(cube, (n) => n.z > 0.99), face(p1, side, 0), face(p2, side, 2))
    const [o1, o2] = [st().objects[p1].transform, st().objects[p2].transform]
    expect(o1.z).toBeCloseTo(o2.z, 6)
    expect([o1.x, o1.y, o2.x, o2.y]).toEqual([40, 0, -40, 0])                         // было: Y зависел от точки клика
  })
})

describe('UX-AUDIT-36 — имя 3D-текста — на языке интерфейса', () => {
  // Было: имя текста («Текст: Дом») записывается в объект на языке создания (add-text), а имена по
  // умолчанию остальных объектов — по id при показе («Куб 1» → «Cube 1», «CSG результат 3» → «CSG
  // result 3»), ребёнок CSG — «Text: Дом» (UX-AUDIT-34): в английском интерфейсе список/дерево —
  // «Текст: Дом». Исправлено в fix-all-5: `displayName` — имя текста по умолчанию (`defaultTextName`)
  // на языке интерфейса; переименованный — своё имя.
  it('текст «Дом», созданный в ru, в en — «Text: Дом» (как ребёнок CSG и шаг истории «Add Text: Дом»)', async () => {
    await addTextObject('Дом', { size: 10, depth: 2 })
    const id = Object.keys(st().objects)[0]
    await st().addShape('cube')
    await i18n.changeLanguage('en')
    const cube = Object.values(st().objects).find((o) => o.shapeType === 'cube')!
    expect(displayName(cube, t)).toMatch(/^Cube/)                                      // фигура — переведена
    expect(opLabel(st().operations[0], t)).toBe('Add Text: Дом')                       // шаг — переведён
    expect(displayName(st().objects[id], t)).toBe('Text: Дом')                          // было «Текст: Дом»
  })
  it('дерево в en: строка текста — «Text: Дом»; двойной клик + Enter без правки — не переименование (имя на диске — «Текст: Дом»)', async () => {
    await addTextObject('Дом', { size: 10, depth: 2 })
    const id = Object.keys(st().objects)[0]
    await i18n.changeLanguage('en')
    const renamed: string[] = []
    const h = mount(<ComponentTree objects={Object.values(st().objects)} selectedIds={new Set()} onSelect={noop} onRename={(_, n) => renamed.push(n)} onToggleVis={noop} onDelete={noop} />)
    const name = h.querySelector(`.ct-item[data-object-id="${id}"] .ct-name`)!
    expect(name.textContent).toBe('Text: Дом')
    act(() => { name.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    const input = h.querySelector<HTMLInputElement>('.ct-name-input')!
    expect(input.value).toBe('Text: Дом')
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(renamed).toEqual([])
    expect(st().objects[id].name).toBe('Текст: Дом')
  })
  it('переименованный текст — своё имя на любом языке (граница фикса)', async () => {
    await addTextObject('Дом', { size: 10, depth: 2 })
    const id = Object.keys(st().objects)[0]
    st().renameObject(id, 'Логотип')
    await i18n.changeLanguage('en')
    expect(displayName(st().objects[id], t)).toBe('Логотип')
  })
})

describe('UX-AUDIT-37 — «Выровнять»: почти встречная грань доворачивается встречно, а не переворачивается', () => {
  // Строго встречная грань B (|cos| ≥ cos 1°) — только сдвиг: объект встаёт на плоскость (как раньше).
  // Было: та же грань, наклонённая на 5°, — «не параллельна» → поворот по правилу UX-AUDIT-32 (нормаль
  // B → нормаль A, dot > 0) на 175°: объект переворачивался и уходил на другую сторону плоскости.
  // Исправлено в fix-all-5 (решение пользователя, как SolidWorks): угол < 90° и = 90° — в ту же
  // сторону, > 90° — встречно (на меньший угол).
  const side = (n: THREE.Vector3) => n.y < -0.99
  it('строго встречная (куб Y 40, плоскость Y) — сдвиг: куб стоит на плоскости, Y 10, без поворота', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0, 40))
    await align('Y', face(c, side))
    const tr = st().objects[c].transform
    expect([tr.rotX, tr.rotY, tr.rotZ]).toEqual([0, 0, 0])
    expect(tr.y).toBeCloseTo(10, 6)
  })
  it('наклон 5° (rotZ 5) — доворот на 5° встречно, куб на той же стороне (Y 10), не переворот', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, { ...at(0, 40), rotZ: 5 })
    const b = face(c, side)
    await align('Y', b)
    const o = st().objects[c]
    expect(triNormal(worldTri(o, b.triangleIndex)).y).toBeLessThan(-COS1)              // встречно плоскости (было: нормаль +Y — переворот)
    expect(Math.abs(o.transform.rotZ)).toBeLessThan(0.01)                              // было rotZ 180
    expect(o.transform.y).toBeCloseTo(10, 6)                                           // было Y −10
    expect(o.transform.x).toBeCloseTo(0, 6)                                            // на месте (UX-AUDIT-32-followup)
  })
  it('правило (плоскость Y, нормаль +Y): угол 85° и 90° — в ту же сторону (куб за плоскостью, Y −10), 95° — встречно (куб на плоскости, Y 10)', async () => {
    // грань куба −Y после rotZ θ: нормаль (sin θ, −cos θ, 0), угол с +Y — 180° − θ
    for (const [angle, theta, dir, y] of [[85, 95, 1, -10], [90, 90, 1, -10], [95, 85, -1, 10]] as const) {
      useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [] }); clearSnapshots(); clearTree()
      const c = await shape('cube', { width: 20, height: 20, depth: 20 }, { ...at(0, 40), rotZ: theta })
      const th = THREE.MathUtils.degToRad(theta)
      const b = face(c, (n) => n.distanceTo(new THREE.Vector3(Math.sin(th), -Math.cos(th), 0)) < 1e-4)
      await align('Y', b)
      const o = st().objects[c]
      expect(triNormal(worldTri(o, b.triangleIndex)).y * dir, `${angle}°`).toBeGreaterThan(COS1)
      expect(o.transform.y, `${angle}°`).toBeCloseTo(y, 4)
      expect(o.transform.x, `${angle}°`).toBeCloseTo(0, 6)
      for (const v of worldTri(o, b.triangleIndex)) expect(v.y, `${angle}°`).toBeCloseTo(0, 4)
    }
  })
})

describe('UX-AUDIT-38 — панель «Шаг N» у шага поворота / масштаба — «Повернуть» / «Масштаб»', () => {
  // UX-AUDIT-29 развёл шаги move в истории: «Переместить» / «Повернуть» / «Масштаб». Панель правки шага
  // (✎) называла любой move «Шаг N: Перемещение», а «Исходно» показывала только сдвиг: у поворота
  // полем — «Δ (0, 0, 0)», у выравнивания с поворотом — сдвиг без углов. Исправлено в fix-all-5:
  // заголовок — по виду шага (`kind`), как в истории; «Исходно» — сдвиг, поворот и масштаб шага.
  it('поворот куба на 30° → ✎ → «Шаг 2: Повернуть», в «Исходно» — поворот (0, 0, 30)°', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    await st().moveObject(c, { ...st().objects[c].transform, rotZ: 30 })
    const step = st().historyIndex - 1
    expect(opLabel(lastOp(), t)).toBe('Повернуть')
    useUiStore.setState({ selectedStep: step })
    const h = mount(<StepPanel />)
    expect(h.querySelector('.props-section-title')?.textContent).toBe(`Шаг ${step + 1}: Повернуть`)   // было «Перемещение»
    expect(h.querySelector('[data-testid=step-original]')?.textContent).toBe('поворот (0, 0, 30)°')    // было «Δ (0, 0, 0)»
  })
  it('масштаб куба ×2 → ✎ → «Шаг 2: Масштаб», в «Исходно» — масштаб; сдвиг — «Перемещение», «Δ (…)» как раньше', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    await st().moveObject(c, { ...st().objects[c].transform, scaleX: 2 })
    const step = st().historyIndex - 1
    useUiStore.setState({ selectedStep: step })
    const h = mount(<StepPanel />)
    expect(h.querySelector('.props-section-title')?.textContent).toBe(`Шаг ${step + 1}: Масштаб`)       // было «Перемещение»
    expect(h.querySelector('[data-testid=step-original]')?.textContent).toBe('масштаб (1, 0, 0)')
    // сдвиг + поворот одним шагом (выравнивание с поворотом) — и то и другое
    await st().moveObject(c, { ...st().objects[c].transform, x: 5, rotX: -90 })
    act(() => useUiStore.setState({ selectedStep: st().historyIndex - 1 }))
    expect(h.querySelector('.props-section-title')?.textContent).toBe(`Шаг ${st().historyIndex}: Повернуть`)
    expect(h.querySelector('[data-testid=step-original]')?.textContent).toBe('Δ (5, 0, 0), поворот (-90, 0, 0)°')
    // обычный сдвиг — как раньше
    await st().moveObject(c, { ...st().objects[c].transform, y: 3 })
    act(() => useUiStore.setState({ selectedStep: st().historyIndex - 1 }))
    expect(h.querySelector('.props-section-title')?.textContent).toBe(`Шаг ${st().historyIndex}: Перемещение`)
    expect(h.querySelector('[data-testid=step-original]')?.textContent).toBe('Δ (0, 3, 0)')
  })
})

describe('UX-AUDIT-39 — «Вписать в экран»: вся сцена во вьюпорте при любом соотношении сторон', () => {
  // Было: расстояние камеры = 2,5 × наибольший размер сцены, без угла обзора по горизонтали — на 768×1024
  // (вьюпорт 248 × 883) сцена обрезалась по ширине (e2e: объект у края). Исправлено в fix-all-5:
  // `fitDistance` (components/camera-fit) — не меньше, чем нужно описанной сфере для меньшего из
  // углов обзора; на широком вьюпорте — как раньше.
  /** Углы рамки сцены в NDC камеры «вписать» (fov 45, как CAMERA_FOV). */
  function corners(size: THREE.Vector3, aspect: number, dist: number) {
    const cam = new THREE.PerspectiveCamera(45, aspect, 0.1, 100000)
    cam.position.set(FIT_DIR.x * dist, FIT_DIR.y * dist, FIT_DIR.z * dist); cam.lookAt(0, 0, 0); cam.updateMatrixWorld()
    const out: THREE.Vector3[] = []
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(new THREE.Vector3(sx * size.x / 2, sy * size.y / 2, sz * size.z / 2).project(cam))
    return out
  }
  it('сцена куб + призма X 40 (62 × 24 × 20) и плоская (200 × 10 × 5): углы рамки в кадре при aspect 0,28 / 0,8 / 1,13 / 2,5; на широком — прежнее расстояние', () => {
    for (const size of [new THREE.Vector3(62, 24, 20), new THREE.Vector3(200, 10, 5), new THREE.Vector3(5, 5, 5)]) {
      for (const aspect of [248 / 883, 504 / 627, 880 / 776, 2.5]) {
        const ndc = corners(size, aspect, fitDistance(size, 45, aspect))
        for (const p of ndc) {
          expect(Math.abs(p.x), `${size.toArray()} aspect ${aspect.toFixed(2)}`).toBeLessThan(1)
          expect(Math.abs(p.y), `${size.toArray()} aspect ${aspect.toFixed(2)}`).toBeLessThan(1)
        }
      }
    }
    const scene = new THREE.Vector3(62, 24, 20)
    expect(fitDistance(scene, 45, 880 / 776)).toBe(62 * 2.5)                            // 1400 — как раньше
    expect(fitDistance(scene, 45, 504 / 627)).toBe(62 * 2.5)                            // 1024 — как раньше
    // было на 768: прежнее расстояние — углы за краем кадра по ширине
    expect(corners(scene, 248 / 883, 62 * 2.5).some((p) => Math.abs(p.x) > 1)).toBe(true)
  })
})

describe('UX-AUDIT-40 — история: правка поворота шага подписана поворотом', () => {
  // Было: Timeline.patchDetail для move-патча писал только сдвиг: правка поворота шага (панель «Шаг N»,
  // группа «Поворот») — «Правка шага 2: сдвиг (0, 0, 0) → (0, 0, 0)», изменения в подписи не видно.
  // Исправлено в fix-all-5: в подписи — группы, которые правка меняет.
  it('поворот 30° → правка шага на 45° → «Правка шага 2: поворот (0, 0, 30)° → (0, 0, 45)°»', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    await st().moveObject(c, { ...st().objects[c].transform, rotZ: 30 })
    const step = st().historyIndex - 1
    expect(await st().editStepParams(step, { kind: 'move', delta: { x: 0, y: 0, z: 0 }, rotDelta: { x: 0, y: 0, z: 45 } })).toBe(true)
    expect(st().objects[c].transform.rotZ).toBeCloseTo(45, 6)                          // правка применилась
    expect(opLabel(lastOp(), t)).toBe(`Правка шага ${step + 1}: поворот (0, 0, 30)° → (0, 0, 45)°`)   // было «сдвиг (0, 0, 0) → (0, 0, 0)»
    // сдвиг — как раньше; сдвиг и поворот вместе — оба
    expect(await st().editStepParams(step, { kind: 'move', delta: { x: 4, y: 0, z: 0 }, rotDelta: { x: 0, y: 0, z: 45 } })).toBe(true)
    expect(opLabel(lastOp(), t)).toBe(`Правка шага ${step + 1}: сдвиг (0, 0, 0) → (4, 0, 0)`)
    expect(await st().editStepParams(step, { kind: 'move', delta: { x: 1, y: 0, z: 0 }, rotDelta: { x: 0, y: 0, z: 10 } })).toBe(true)
    expect(opLabel(lastOp(), t)).toBe(`Правка шага ${step + 1}: сдвиг (4, 0, 0) → (1, 0, 0), поворот (0, 0, 45)° → (0, 0, 10)°`)
  })
})
