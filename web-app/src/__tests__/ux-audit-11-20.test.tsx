// ============================================================
// ux-audit-11-20.test.tsx — баги UX-прогона 2 (UX-AUDIT-11…20), fix-all-2
// ============================================================
// Баги заводились `it.fails` «ожидание» (каждый проверен: падает на своей проверке), затем
// исправлены → `it` (регрессия) + тесты фиксов. Вёрстка (UX-AUDIT-12 тулбар, -16 ширина поля,
// -19 тост) в jsdom не измеряется — e2e/ux-audit-2.mjs (`knownBug` → обычные проверки).
// Описание и шаги — DEVELOPMENT_PLAN.md › «UX-AUDIT-2».

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return { ...bridge }
})

import '../__mocks__/indexeddb'
import { _resetMockIndexedDB } from '../__mocks__/indexeddb'
import React, { useRef, type MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import * as THREE from 'three'
import i18n from '../i18n'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { opLabel, opIcon } from '../components/Timeline'
import { SubtractIcon, IntersectIcon, PasteIcon } from '../components/icons'
import { formatParams } from '../csg/tree-view'
import ProjectManagerModal from '../components/ProjectManagerModal'
import { addTextObject } from '../store/add-text'
import { useMeshSync } from '../components/viewport-hooks'
import type { ShapeParams, ShapeType, TransformNR, TinkerCraftOperation, SceneObject } from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0): TransformNR => ({ ...ID, x, y, z })
const notes = () => useNotifications.getState().notifications
const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts)
const lastOp = (): TinkerCraftOperation => st().operations[st().historyIndex - 1]

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false, clipboard: [], clearedDocument: null })
  useNotifications.setState({ notifications: [] })
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
async function csg(op: 'union' | 'subtract' | 'intersect', dx = 12): Promise<string> {
  const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
  const b = await shape('sphere', { radius: 10, segments: 32 }, at(dx))
  st().selectObjects([a, b], false)
  await st().csgBoolean(op)
  return st().selectedIds[0]
}

describe('UX-AUDIT-11 — в истории вычитание и пересечение подписаны своим названием и иконкой', () => {
  it('вычитание → «Вычитание» и иконка вычитания; пересечение → «Пересечение» и иконка пересечения', async () => {
    await csg('subtract')
    expect(opLabel(lastOp(), t)).toBe('Вычитание')
    expect((opIcon(lastOp()) as React.ReactElement).type).toBe(SubtractIcon)
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [] })
    await csg('intersect')
    expect(opLabel(lastOp(), t)).toBe('Пересечение')
    expect((opIcon(lastOp()) as React.ReactElement).type).toBe(IntersectIcon)
  })
})

describe('UX-AUDIT-11 — запасной путь и объединение', () => {
  it('объединение — «Объединение»; старые шаги с флагами isIntersect/subtractOp — по флагам', async () => {
    await csg('union')
    expect(opLabel(lastOp(), t)).toBe('Объединение')
    const legacy = (flags: Record<string, boolean>): TinkerCraftOperation => ({ type: 'group', ids: ['a', 'b'], ...flags } as TinkerCraftOperation)
    expect(opLabel(legacy({ subtractOp: true }), t)).toBe('Вычитание')
    expect(opLabel(legacy({ isIntersect: true }), t)).toBe('Пересечение')
    expect(opLabel(legacy({}), t)).toBe('Объединение')
  })
})

describe('UX-AUDIT-13 — вставка CSG в истории — «Вставить», а не «Объединение»', () => {
  it('Ctrl+C / Ctrl+V CSG → шаг истории «Вставить …» с иконкой вставки', async () => {
    const g = await csg('union')
    st().selectObjects([g], false); st().copySelected(); await st().pasteClipboard()
    expect(opLabel(lastOp(), t)).toMatch(/^Вставить/)
    expect(opLabel(lastOp(), t)).toBe('Вставить CSG')
    expect((opIcon(lastOp()) as React.ReactElement).type).toBe(PasteIcon)
  })
  it('вставка примитива — «Вставить …», а не «Добавить …»; en — «Paste CSG»', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    st().selectObjects([c], false); st().copySelected(); await st().pasteClipboard()
    expect(lastOp()).toMatchObject({ type: 'add_shape', pasted: true })
    expect(opLabel(lastOp(), t)).toMatch(/^Вставить /)
    await i18n.changeLanguage('en')
    expect(opLabel({ type: 'group', ids: [], pasted: true } as TinkerCraftOperation, t)).toBe('Paste CSG')
  })
  it('старая вставка CSG (без признака, `ids: []`) — тоже «Вставить»; CSG и extrude — нет', () => {
    expect(opLabel({ type: 'group', ids: [] } as TinkerCraftOperation, t)).toBe('Вставить CSG')
    expect(opLabel({ type: 'group', ids: ['a', 'b'], treeOperation: 'union' } as TinkerCraftOperation, t)).toBe('Объединение')
    expect(opLabel({ type: 'group', ids: ['a', 'b'], source: { kind: 'extrude', baseId: 'a', slabId: 'b', axis: 'Z', depth: 5 } } as TinkerCraftOperation, t)).not.toMatch(/Вставить/)
  })
})

describe('UX-AUDIT-14 — цилиндр: параметры цилиндра, сводка «R10 H20»', () => {
  it('новый цилиндр — радиус и высота (а не ширина/высота/глубина куба), сводка дерева «R10 H20»', async () => {
    const c = await shape('cylinder', undefined, at(0))
    expect(st().objects[c].params).toMatchObject({ radius: 10, height: 20 })
    expect(st().objects[c].params.width).toBeUndefined()
    expect(formatParams(st().objects[c].params, 'cylinder')).toBe('R10 H20')
  })
})

describe('UX-AUDIT-14 — геометрия та же, старые цилиндры и дерево', () => {
  it('новые параметры по умолчанию дают ту же геометрию, что старые (width/height/depth)', async () => {
    const oldC = await shape('cylinder', { width: 20, height: 20, depth: 20 }, at(0))
    const newC = await shape('cylinder', undefined, at(0))
    const a = st().objects[oldC], b = st().objects[newC]
    expect(b.indices.length).toBe(a.indices.length)
    expect(Array.from(b.vertices)).toEqual(Array.from(a.vertices))
  })
  it('сводка — по параметрам фигуры: старый цилиндр (W/H/D) — «R10 H20», куб — «W20 H20 D20», призма — «R12 H20 n6»', () => {
    expect(formatParams({ width: 20, height: 20, depth: 20 }, 'cylinder')).toBe('R10 H20')
    expect(formatParams({ width: 20, height: 20, depth: 20 }, 'cube')).toBe('W20 H20 D20')
    expect(formatParams({ radius: 12, height: 20, sides: 6 }, 'prism')).toBe('R12 H20 n6')
    expect(formatParams({ torusRadius: 15, tubeRadius: 4 }, 'torus')).toBe('R15 r4')
  })
  it('строка дерева CSG с цилиндром — «Цилиндр · R10 H20»', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const c = await shape('cylinder', undefined, at(8))
    st().selectObjects([a, c], false); await st().csgBoolean('union')
    const root = st().selectedIds[0]
    const view = (await import('../csg/tree-view')).getTreeView(root)!
    const cyl = view.children.find((ch) => ch.shapeType === 'cylinder')!
    expect(formatParams(cyl.params, cyl.shapeType)).toBe('R10 H20')
  })
})

describe('UX-AUDIT-15 — менеджер проектов закрывается по Esc', () => {
  it('Esc (фокус вне модалки и внутри) → onClose', async () => {
    const onClose = vi.fn()
    const h = mount(<ProjectManagerModal onClose={onClose} onLoad={() => {}} onSave={async () => {}} setCurrentProjectId={() => {}} />)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })     // список проектов
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(1)
    const input = h.querySelector('input')!
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('UX-AUDIT-17 — история (ru): «Добавить сферу» (винительный падеж)', () => {
  it('«Добавить куб / сферу / цилиндр / конус / тор / призму / пирамиду»', () => {
    const op = (shapeType: ShapeType): TinkerCraftOperation => ({ type: 'add_shape', id: 'x', shapeType, params: {}, color: '#fff', transform: ID })
    expect(['cube', 'sphere', 'cylinder', 'cone', 'torus', 'prism', 'pyramid'].map((s) => opLabel(op(s as ShapeType), t))).toEqual([
      'Добавить куб', 'Добавить сферу', 'Добавить цилиндр', 'Добавить конус', 'Добавить тор', 'Добавить призму', 'Добавить пирамиду',
    ])
  })
})

describe('UX-AUDIT-17 — вставка, подсказка палитры, en', () => {
  it('вставка — «Вставить сферу»; en — «Add Sphere»; у каждой фигуры палитры есть форма', async () => {
    const op = (shapeType: ShapeType, pasted?: boolean): TinkerCraftOperation => ({ type: 'add_shape', id: 'x', shapeType, params: {}, color: '#fff', transform: ID, pasted })
    expect(opLabel(op('sphere', true), t)).toBe('Вставить сферу')
    expect(t('leftPanel.addShape', { label: t('shapesAcc.pyramid') })).toBe('Добавить пирамиду')
    for (const s of ['cube', 'sphere', 'cylinder', 'cone', 'torus', 'prism', 'pyramid', 'text']) {
      expect(i18n.exists(`shapesAcc.${s}`, { lng: 'ru' }) && i18n.exists(`shapesAcc.${s}`, { lng: 'en' })).toBe(true)
    }
    await i18n.changeLanguage('en')
    expect(opLabel(op('sphere'), t)).toBe('Add Sphere')
  })
})

describe('UX-AUDIT-18 — символы, которых нет в шрифте, — предупреждение', () => {
  it('«A漢字» → текст создаётся, предупреждение называет «漢字»', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await addTextObject('A漢字', { size: 10, depth: 5 })).toBe(true)
    const w = notes().filter((n) => n.type === 'warning')
    expect(w).toHaveLength(1)
    expect(w[0].message).toContain('漢字')
    warn.mockRestore(); err.mockRestore()
  })
})

// ---- UX-AUDIT-20: затенение в НАСТОЯЩЕМ useMeshSync (как viewport-mesh-sync.test.ts) ----
type MeshMap = Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D; helper?: THREE.BoxHelper }>
let lastMap: MeshMap | null = null
function Harness(props: { objects: SceneObject[] }) {
  const sceneRef: MutableRefObject<THREE.Scene | null> = useRef(new THREE.Scene())
  const mapRef: MutableRefObject<MeshMap> = useRef(new Map())
  useMeshSync(props.objects, true, sceneRef, mapRef, new Set<string>())
  lastMap = mapRef.current
  return null
}
/**
 * Нормали вершин меша в локальной системе объекта. Сфера (центр `c`, радиус `r`) —
 * у гладкой нормаль ≈ радиальная; у гранёной — нормаль грани (до ~6° у 32 сегментов).
 * Возвращает [макс. отклонение на сфере (°), макс. отклонение на грани куба z = +10 (°),
 * среднее отклонение на сфере (°)].
 */
function shadingErrors(mesh: THREE.Mesh, c: THREE.Vector3, r: number): [number, number, number] {
  const g = mesh.geometry
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal')
  const p = new THREE.Vector3(), n = new THREE.Vector3()
  let sphere = 0, face = 0, sum = 0, cnt = 0
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i).normalize()
    const radial = p.clone().sub(c)
    if (Math.abs(radial.length() - r) < 0.05 && p.x > c.x - 2) {        // на сфере, вдали от куба
      const d = THREE.MathUtils.radToDeg(n.angleTo(radial.normalize()))
      sphere = Math.max(sphere, d); sum += d; cnt++
    }
    if (Math.abs(p.z - (c.z + 10)) < 1e-4 && p.x < c.x - 5 && p.x > c.x - 21 && Math.abs(p.y - c.y) < 9) {   // верхняя грань куба
      face = Math.max(face, THREE.MathUtils.radToDeg(n.angleTo(new THREE.Vector3(0, 0, 1))))
    }
  }
  return [sphere, face, cnt ? sum / cnt : Infinity]
}

describe('UX-AUDIT-18 — кириллица и диакритика — запасным шрифтом, без «?»', () => {
  it('латиница, кириллица, ё, диакритика, цифры — без предупреждения; отсутствуют только 漢字', async () => {
    expect(await addTextObject('Ёжик 42 Hi! Üß é', { size: 10, depth: 5 })).toBe(true)
    expect(notes()).toEqual([])
    const { buildTextMesh } = await import('../io/text-mesh')
    expect((await buildTextMesh('Ж 漢 B 字 漢', { size: 10, depth: 5 })).missing).toEqual(['漢', '字'])
  })
  it('«Ж» рисуется буквой Ж, а не «?» (другая геометрия); меш кириллицы замкнут — CSG работает', async () => {
    const { buildTextMesh } = await import('../io/text-mesh')
    const zh = await buildTextMesh('Ж', { size: 10, depth: 5 })
    const q = await buildTextMesh('?', { size: 10, depth: 5 })
    expect(zh.missing).toEqual([])
    expect(zh.indices.length).not.toBe(q.indices.length)
    const cube = await shape('cube', { width: 80, height: 20, depth: 20 }, at(0))
    expect(await addTextObject('Привет', { size: 10, depth: 5 })).toBe(true)
    const txt = st().selectedIds[0]
    await st().moveObject(txt, { ...st().objects[txt].transform, x: 0, y: 0, z: 8 })
    st().selectObjects([cube, txt], false)
    await st().csgBoolean('subtract')
    expect(Object.keys(st().objects)).toHaveLength(1)
    expect(notes().filter((n) => n.type !== 'info')).toEqual([])
  })
})

describe('UX-AUDIT-18 — кириллица запасного шрифта — замкнутый меш (Т-образные стыки)', () => {
  /** Ориентированное ребро — ровно один раз, у каждого есть встречное, вырожденных нет. */
  function openEdges(indices: number[]): number {
    const edges = new Map<string, number>()
    for (let i = 0; i < indices.length; i += 3) {
      const tri = [indices[i], indices[i + 1], indices[i + 2]]
      if (new Set(tri).size !== 3) return Infinity
      for (let k = 0; k < 3; k++) { const key = `${tri[k]}>${tri[(k + 1) % 3]}`; edges.set(key, (edges.get(key) ?? 0) + 1) }
    }
    let bad = 0
    for (const [key, n] of edges) { const [a, b] = key.split('>'); if (n !== 1 || edges.get(`${b}>${a}`) !== 1) bad++ }
    return bad
  }
  it('весь алфавит (в т.ч. «Д», «д», «Ф» — дырка касается контура) и диакритика — без открытых рёбер', async () => {
    const { buildTextMesh } = await import('../io/text-mesh')
    for (const text of ['АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя', 'ÜÖÄßéèàçñ №«»—', 'Hello, 123!']) {
      const m = await buildTextMesh(text, { size: 10, depth: 5 })
      expect(m.missing, text).toEqual([])
      expect(openEdges(m.indices), text).toBe(0)
    }
  })
  it('repairTJunctions: ребро, на котором лежит вершина, делится; замкнутый меш не меняется', async () => {
    const { repairTJunctions } = await import('../io/text-mesh')
    // тетраэдр — замкнут: без изменений
    const tv = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
    const tet = [0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]
    expect(repairTJunctions(tv, tet)).toEqual(tet)
    // Т-стык: квадрат z = 0 с двух сторон; спереди ребро 0→1 целиком, сзади — через вершину 4
    const v = [0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0, 1, 0, 0]
    const front = [0, 1, 2, 0, 2, 3]
    const back = [0, 3, 4, 4, 3, 1, 1, 3, 2]
    const fixed = repairTJunctions(v, [...front, ...back])
    expect(fixed).toHaveLength(front.length + back.length + 3)   // треугольник (0, 1, 2) разделён в 4
    expect(fixed.slice(0, 6)).toEqual([0, 4, 2, 4, 1, 2])
    expect(openEdges(fixed)).toBe(0)
  })
})

describe('UX-AUDIT-20 — CSG-результат затенён гладко (сфера), острые рёбра — остры', () => {
  // Плоское затенение (баг) — до ~9° на сфере. Гладкое по излому — нормали усреднены по граням
  // вокруг вершины; manifold перетриангулирует результат (длинные треугольники), поэтому не
  // строго радиальные: в среднем < 1°, максимум < 4°.
  it('куб ∪ сфера: нормали на сфере ≈ радиальные (среднее < 1°, макс. < 4°), на грани куба — нормаль грани (< 0.01°)', async () => {
    const g = await csg('union', 12)
    const obj = st().objects[g]
    mount(<Harness objects={[obj]} />)
    const mesh = lastMap!.get(g)!.mesh
    // вершины объекта — относительно pivot (= позиция куба A, 0,0,0): сфера в (12,0,0)
    const [sphereErr, faceErr, sphereMean] = shadingErrors(mesh, new THREE.Vector3(12, 0, 0).sub(new THREE.Vector3(obj.transform.x, obj.transform.y, obj.transform.z)), 10)
    expect(sphereMean).toBeLessThan(1)
    expect(sphereErr).toBeLessThan(4)
    expect(faceErr).toBeLessThan(0.01)
  })
})

describe('UX-AUDIT-20 — путь обновления и виды затенения', () => {
  it('после правки размера куб остаётся с острыми гранями (раньше computeVertexNormals сглаживал углы)', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const h = mount(<Harness objects={[st().objects[c]]} />)
    await st().resizeObject(c, { width: 30 })
    act(() => root!.render(<Harness objects={[st().objects[c]]} />))
    const mesh = lastMap!.get(c)!.mesh
    const pos = mesh.geometry.getAttribute('position'), nor = mesh.geometry.getAttribute('normal')
    let worst = 0
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getZ(i) - 10) > 1e-4) continue                // вершины верхней грани
      const n = new THREE.Vector3().fromBufferAttribute(nor, i).normalize()
      // у вершин верхней грани плоская нормаль либо (0,0,1), либо нормаль боковой грани
      worst = Math.max(worst, Math.min(n.angleTo(new THREE.Vector3(0, 0, 1)), ...[[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]].map((v) => n.angleTo(new THREE.Vector3(...(v as [number, number, number]))))))
    }
    expect(THREE.MathUtils.radToDeg(worst)).toBeLessThan(0.01)
    expect(mesh.geometry.boundingBox!.max.x).toBeCloseTo(15, 3)       // геометрия обновилась
    void h
  })
  it('shadingOf: куб/призма/пирамида — плоско, CSG/импорт/цилиндр/конус — по излому (UX-AUDIT-26), сфера/тор — гладко', async () => {
    const { shadingOf } = await import('../components/object-geometry')
    expect(['cube', 'prism', 'pyramid'].map((t2) => shadingOf({ shapeType: t2 as ShapeType, params: { width: 1 } }))).toEqual(['flat', 'flat', 'flat'])
    expect(shadingOf({ shapeType: 'csg', params: {} })).toBe('crease')
    expect(shadingOf({ shapeType: 'import_mesh', params: {} })).toBe('crease')
    expect(['sphere', 'cylinder', 'cone', 'torus'].map((t2) => shadingOf({ shapeType: t2 as ShapeType, params: { radius: 1 } }))).toEqual(['smooth', 'crease', 'crease', 'smooth'])
  })
})

