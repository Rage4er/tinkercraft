// ============================================================
// ux-audit-3.test.tsx — UX-прогон 3 (H–N повторно + O–T): логика на реальном WASM
// ============================================================
// ✅ — сценарии O–T (текст, затенение, история), которые оправдались: регрессия фиксов
//      UX-AUDIT-18 (кириллица запасным шрифтом, предупреждение о символах вне шрифтов) и
//      UX-AUDIT-20 (CSG и импорт затенены гладко по излому);
// 🐞 — баги UX-AUDIT-21, 22, 25–29, 31 (логика): заведены `it.fails` «ожидание» (каждый проверен —
//      падал на своей проверке), исправлены в fix-all-3 → `it` (регрессия) + проверки фиксов.
// Браузерная часть (вёрстка: поле, линейка, тост на 768; долгие задачи при импорте 100k) — e2e/ux-audit-3.mjs
// (были `knownBug`, после fix-all-3 — обычные проверки).
// Описание и шаги — DEVELOPMENT_PLAN.md › «UX-AUDIT-3».

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return { ...bridge }
})

import '../__mocks__/indexeddb'
import { _resetMockIndexedDB } from '../__mocks__/indexeddb'
import React, { useRef, type MutableRefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react-dom/test-utils'
import * as THREE from 'three'
import i18n from '../i18n'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { useUiStore } from '../store/ui-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { buildTextMesh } from '../io/text-mesh'
import { addTextObject } from '../store/add-text'
import { useMeshSync } from '../components/viewport-hooks'
import { buildObjectGeometry } from '../components/object-geometry'
import { findNearestSnap } from '../components/snap-utils'
import ComponentTree, { displayName } from '../components/ComponentTree'
import LeftPanel from '../components/LeftPanel'
import TextModal from '../components/TextModal'
import Timeline, { opLabel, opIcon, filterKeyOf } from '../components/Timeline'
import { isTextObject } from '../store/text-object'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { OP_FILTER_LABELS } from '../constants'
import { SubtractIcon, IntersectIcon, UnionIcon, TextIcon } from '../components/icons'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import type { SceneObject, ShapeParams, ShapeType, TransformNR, TinkerCraftOperation } from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0): TransformNR => ({ ...ID, x, y, z })
const notes = () => useNotifications.getState().notifications
const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts)
const noop = () => {}

beforeAll(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // jsdom: нет scrollIntoView (Timeline прокручивает к текущему шагу)
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})
beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false, clipboard: [], clearedDocument: null })
  useNotifications.setState({ notifications: [] })
  useUiStore.setState({ expandedTreeIds: {}, selectedChild: null })
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
async function csg(a: string, b: string, op: 'union' | 'subtract' | 'intersect'): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  st().selectObjects([a, b], false)
  await st().csgBoolean(op)
  const id = Object.keys(st().objects).find((k) => !before.has(k) && st().objects[k].shapeType === 'csg')
  if (!id) throw new Error(`csg ${op}(${a}, ${b}): результата нет — объекты ${Object.keys(st().objects)}, выделено ${st().selectedIds}, busy ${st().busy}, уведомления ${notes().map((n) => n.message)}`)
  return id
}
/** Куб 20³ в (0,0,0) и сфера R10 в (dx,0,0) → CSG. */
async function cubeSphere(op: 'union' | 'subtract' | 'intersect', dx = 12): Promise<string> {
  const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
  const b = await shape('sphere', { radius: 10, segments: 32 }, at(dx))
  return csg(a, b, op)
}
/** Открытые рёбра меша: у замкнутого каждое ребро — ровно у двух треугольников (встречно). */
function openEdges(idx: ArrayLike<number>): number {
  const edges = new Map<string, number>()
  for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) {
    const key = `${idx[i + k]}>${idx[i + (k + 1) % 3]}`
    edges.set(key, (edges.get(key) ?? 0) + 1)
  }
  let bad = 0
  for (const [key, n] of edges) { const [a, b] = key.split('>'); if (n !== 1 || edges.get(`${b}>${a}`) !== 1) bad++ }
  return bad
}
/** Нормали треугольников, все три вершины которых удовлетворяют `on` (локальные координаты). */
function cornerNormals(geo: THREE.BufferGeometry, on: (p: THREE.Vector3) => boolean): THREE.Vector3[] {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal')
  const idx = geo.getIndex()
  const tris = (idx ? idx.count : pos.count) / 3
  const out: THREE.Vector3[] = []
  const p = new THREE.Vector3()
  for (let t3 = 0; t3 < tris; t3++) {
    const vi = [0, 1, 2].map((k) => (idx ? idx.getX(t3 * 3 + k) : t3 * 3 + k))
    if (!vi.every((v) => on(p.fromBufferAttribute(pos, v)))) continue
    for (const v of vi) out.push(new THREE.Vector3().fromBufferAttribute(nor, v).normalize())
  }
  return out
}
/** Отклонение (°) нормалей вершин на сфере (центр `c`, радиус `r`, фильтр `keep`) от радиальных: [среднее, макс.]. */
function sphereShading(geo: THREE.BufferGeometry, c: THREE.Vector3, r: number, keep: (p: THREE.Vector3) => boolean): [number, number] {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal')
  const p = new THREE.Vector3(), n = new THREE.Vector3()
  let max = 0, sum = 0, cnt = 0
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i).normalize()
    const radial = p.clone().sub(c)
    if (Math.abs(radial.length() - r) > 0.05 || !keep(p)) continue
    const d = THREE.MathUtils.radToDeg(n.angleTo(radial.normalize()))
    max = Math.max(max, d); sum += d; cnt++
  }
  expect(cnt).toBeGreaterThan(20)
  return [sum / cnt, max]
}

type MeshMap = Map<string, { mesh: THREE.Mesh; pivot: THREE.Object3D; helper?: THREE.BoxHelper }>
let lastMap: MeshMap | null = null
/** Настоящий useMeshSync (как во вьюпорте) — сцена без WebGL. */
function Harness(props: { objects: SceneObject[] }) {
  const sceneRef: MutableRefObject<THREE.Scene | null> = useRef(new THREE.Scene())
  const mapRef: MutableRefObject<MeshMap> = useRef(new Map())
  useMeshSync(props.objects, true, sceneRef, mapRef, new Set<string>())
  lastMap = mapRef.current
  return null
}
/** Закрытый меш куба (ребро `s`) для addRawMesh — «импорт». */
function cubeMesh(s: number): { vertices: number[]; indices: number[] } {
  const h = s / 2
  const vertices = [-h, -h, -h, h, -h, -h, h, h, -h, -h, h, -h, -h, -h, h, h, -h, h, h, h, h, -h, h, h]
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { vertices, indices }
}
async function rawMesh(name: string, s: number, tr: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  const m = cubeMesh(s)
  await st().addRawMesh(name, m.vertices, m.indices)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, tr)
  return id
}
/** Привязка линейки: луч сверху в мировую точку `world` на объекте `obj` (меш — как во вьюпорте). */
function snapAt(obj: SceneObject, world: THREE.Vector3) {
  const mesh = new THREE.Mesh(buildObjectGeometry(obj), new THREE.MeshBasicMaterial())
  const pivot = new THREE.Object3D()
  pivot.position.set(obj.transform.x, obj.transform.y, obj.transform.z)
  pivot.add(mesh)
  mesh.userData.objectId = obj.id
  pivot.updateMatrixWorld(true)
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000)
  cam.position.set(world.x, world.y, world.z + 50); cam.lookAt(world); cam.updateMatrixWorld()
  const rc = new THREE.Raycaster()
  rc.set(cam.position.clone(), world.clone().sub(cam.position).normalize())
  return findNearestSnap(rc, { current: new Map([[obj.id, { mesh, pivot }]]) }, cam, new THREE.Vector2(0, 0))
}

// ════════════════════════════════════════════════════════════
// ✅ O–T: сценарии оправдались — регрессия фиксов 11–20
// ════════════════════════════════════════════════════════════

describe('UX-прогон 3 — O. Текст после UX-AUDIT-18', () => {
  it('O1: «Привет», «Дом», «Федя», «Hello» — буквы без предупреждения; «Д», «д», «Ф» — замкнутый меш', async () => {
    for (const text of ['Привет', 'Дом', 'Федя', 'Hello', 'ДдФ']) {
      const m = await buildTextMesh(text, { size: 10, depth: 2 })
      expect(m.missing, text).toEqual([])
      expect(openEdges(m.indices), text).toBe(0)
    }
    // кириллица — буквами, а не «?»: геометрия «Дом» ≠ «???»
    const dom = await buildTextMesh('Дом', { size: 10, depth: 2 })
    const q = await buildTextMesh('???', { size: 10, depth: 2 })
    expect(dom.indices.length).not.toBe(q.indices.length)
  })
  it('O2: мелкий текст (1–2 мм) с «Д», «д», «Ф» — замкнут; куб − «ДдФ» и куб ∪ «Федя» — CSG без уведомлений', async () => {
    for (const size of [1, 2]) for (const text of ['ДдФ', 'Федя']) {
      expect(openEdges((await buildTextMesh(text, { size, depth: 1 })).indices), `${text} ${size}`).toBe(0)
    }
    for (const [text, op] of [['ДдФ', 'subtract'], ['Федя', 'union']] as const) {
      useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [] })
      clearSnapshots(); clearTree()
      const cube = await shape('cube', { width: 60, height: 60, depth: 20 }, at(0))
      expect(await addTextObject(text, { size: 10, depth: 15 })).toBe(true)
      const txt = Object.keys(st().objects).find((k) => k !== cube)!
      await csg(cube, txt, op)
      expect(Object.values(st().objects).map((o) => o.shapeType), text).toEqual(['csg'])
      expect(notes(), text).toEqual([])
    }
  })
  it('O3: иероглифы и emoji — текст создан, предупреждение называет символы', async () => {
    for (const [text, chars] of [['漢字', '漢字'], ['Hi 😀', '😀']] as const) {
      useNotifications.setState({ notifications: [] })
      expect(await addTextObject(text, { size: 10, depth: 2 })).toBe(true)
      const warn = notes().filter((n) => n.type === 'warning')
      expect(warn, text).toHaveLength(1)
      expect(warn[0].message).toContain(chars)
    }
  })
})

describe('UX-прогон 3 — P. Затенение после UX-AUDIT-20', () => {
  it('P1: сфера − куб и сфера ∩ куб — сфера гладкая (нормали ≈ радиальные)', async () => {
    for (const op of ['subtract', 'intersect'] as const) {
      useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [] })
      clearSnapshots(); clearTree()
      const s = await shape('sphere', { radius: 10, segments: 32 }, at(0))
      const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(12))
      const gid = await csg(s, c, op)
      const g = st().objects[gid]
      // pivot = операнд A (сфера в 0): локальные координаты = мировые; срез куба — плоскость x = 2
      const [mean, max] = sphereShading(buildObjectGeometry(g), new THREE.Vector3(0, 0, 0), 10, (p) => (op === 'subtract' ? p.x < 0 : p.x > 4))
      expect(mean, op).toBeLessThan(1)
      expect(max, op).toBeLessThan(4)
    }
  })
  it('P2: импорт STL-сферы (32×16) — гладко; импорт куба — грани острые', async () => {
    const vertices: number[] = [], indices: number[] = []
    const R = 10, rings = 16, segs = 32
    for (let i = 0; i <= rings; i++) for (let j = 0; j < segs; j++) {
      const th = (Math.PI * i) / rings, ph = (2 * Math.PI * j) / segs
      vertices.push(R * Math.sin(th) * Math.cos(ph), R * Math.sin(th) * Math.sin(ph), R * Math.cos(th))
    }
    const v = (i: number, j: number) => i * segs + (j % segs)
    for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
      if (i !== 0) indices.push(v(i, j), v(i + 1, j), v(i, j + 1))
      if (i !== rings - 1) indices.push(v(i + 1, j), v(i + 1, j + 1), v(i, j + 1))
    }
    const sphere = { shapeType: 'import_mesh' as const, params: {}, vertices: new Float32Array(vertices), indices: new Uint32Array(indices), normals: null }
    const [mean, max] = sphereShading(buildObjectGeometry(sphere), new THREE.Vector3(), R, (p) => Math.abs(p.z) < 9)
    expect(mean).toBeLessThan(2)
    expect(max).toBeLessThan(6)
    const m = cubeMesh(20)
    const cube = { shapeType: 'import_mesh' as const, params: {}, vertices: new Float32Array(m.vertices), indices: new Uint32Array(m.indices), normals: null }
    for (const n of cornerNormals(buildObjectGeometry(cube), (p) => Math.abs(p.z - 10) < 1e-4)) expect(n.angleTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-4)
  })
})

describe('UX-прогон 3 — T. История после UX-AUDIT-11/13', () => {
  it('T1: вставка импорта — «Вставить импорт»; объединение / вычитание / пересечение — свои подписи', async () => {
    const op = { type: 'import_mesh', id: 'obj_9', name: 'a.stl', color: '#fff', transform: ID, vertices: [], indices: [], pasted: true } as unknown as TinkerCraftOperation
    expect(opLabel(op, t)).toBe('Вставить импорт')
    const labels: string[] = []
    for (const kind of ['union', 'subtract', 'intersect'] as const) {
      await cubeSphere(kind)
      labels.push(opLabel(st().operations[st().historyIndex - 1], t))
    }
    expect(labels).toEqual(['Объединение', 'Вычитание', 'Пересечение'])
  })
})

// ════════════════════════════════════════════════════════════
// 🐞 Новые баги прогона 3 (логика) — it.fails «ожидание»
// ════════════════════════════════════════════════════════════

describe('UX-AUDIT-21 — CSG и импорт: геометрия вьюпорта не пересобирается при чужих изменениях', () => {
  // Было: UX-AUDIT-20 дал CSG/импорту неиндексированную геометрию (toCreasedNormals), а проверка
  // «вершины изменились» в useMeshSync сравнивала obj.indices.length с geometry.index?.count
  // (= 0) → всегда «изменились»: нормали по излому и рёбра пересчитывались на каждый рендер
  // (импорт 100k в сцене → сдвиг другого куба — долгая задача 155–194 мс). Исправлено в
  // fix-all-3: сверка с источником геометрии (userData меша, пишется и при создании).
  it('сдвиг другого объекта не пересобирает геометрию CSG и импорта (и куба — уже с первого раза)', async () => {
    const g = await cubeSphere('union')
    const imp = await rawMesh('box.stl', 20, at(60))
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(-60))
    mount(<Harness objects={Object.values(st().objects)} />)
    const step = async (x: number) => {
      await st().moveObject(c, { ...st().objects[c].transform, x })
      act(() => root!.render(<Harness objects={Object.values(st().objects)} />))
      return [lastMap!.get(g)!.mesh.geometry, lastMap!.get(imp)!.mesh.geometry, lastMap!.get(c)!.mesh.geometry]
    }
    const created = [lastMap!.get(g)!.mesh.geometry, lastMap!.get(imp)!.mesh.geometry, lastMap!.get(c)!.mesh.geometry]
    const before = await step(-70)
    const after = await step(-80)
    expect(before).toEqual(created)         // первое обновление — тоже без пересборки
    expect(after[2]).toBe(before[2])        // куб
    expect(after[0]).toBe(before[0])        // CSG
    expect(after[1]).toBe(before[1])        // импорт
    // UX-AUDIT-20 не сломан: геометрия CSG — по излому (гладкая сфера), правка самого CSG — пересобирает
    expect(after[0].getAttribute('normal')).toBeTruthy()
  })
  it('правка самого объекта (размер куба, CSG после правки ребёнка) — геометрия пересобирается', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    mount(<Harness objects={Object.values(st().objects)} />)
    const g0 = lastMap!.get(c)!.mesh.geometry
    await st().resizeObject(c, { width: 30 })
    act(() => root!.render(<Harness objects={Object.values(st().objects)} />))
    const g1 = lastMap!.get(c)!.mesh.geometry
    expect(g1).not.toBe(g0)
    g1.computeBoundingBox()
    expect(g1.boundingBox!.max.x).toBeCloseTo(15, 3)
    // та же длина массивов, другие значения — тоже пересборка (хэш вершин)
    const obj = st().objects[c]
    const moved = { ...obj, vertices: obj.vertices.map((v, i) => (i % 3 === 2 ? v + 1 : v)) }
    act(() => root!.render(<Harness objects={[moved]} />))
    expect(lastMap!.get(c)!.mesh.geometry).not.toBe(g1)
  })
})

describe('UX-AUDIT-22 — привязка линейки к ребру CSG и импорта', () => {
  // Было: snap-utils.collectWorldEdges брал рёбра только из geometry.index; у CSG/импорта после
  // UX-AUDIT-20 индекса нет → рёбер не было. Исправлено в fix-all-3: без индекса вершина ребра —
  // позиция (общее ребро соседних треугольников — один раз). Куб-примитив — как раньше.
  it('курсор в 0,5 мм от ребра верхней грани CSG (куб ∪ куб) и импорта → привязка «ребро»', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const cubeSnap = snapAt(st().objects[a], new THREE.Vector3(0, -9.5, 10))
    expect(cubeSnap?.type).toBe('edge')
    const b = await shape('cube', { width: 20, height: 20, depth: 20 }, at(15))
    const gid = await csg(a, b, 'union')
    const impId = await rawMesh('box.stl', 20, at(60))
    const g = st().objects[gid], imp = st().objects[impId]
    const sg = snapAt(g, new THREE.Vector3(0, -9.5, 10))
    expect(sg?.type).toBe('edge')
    expect(sg!.point.y).toBeCloseTo(-10, 4)                 // точка — на ребре
    const si = snapAt(imp, new THREE.Vector3(60, -9.5, 10))
    expect(si?.type).toBe('edge')
    expect(si!.point.y).toBeCloseTo(-10, 4)
    // у вершины — «вершина», как у куба; геометрия CSG по-прежнему без индекса (затенение UX-AUDIT-20)
    expect(snapAt(g, new THREE.Vector3(-9.6, -9.6, 10))?.type).toBe('vertex')
    expect(buildObjectGeometry(g).getIndex()).toBeNull()
  })
})

describe('UX-AUDIT-25 — дерево: корень CSG — с иконкой своей операции', () => {
  // Было: ComponentTree рисовал корень CSG `<Glyph shapeType="csg" />` без операции → всегда значок
  // объединения. Исправлено в fix-all-3: операция корня — из Build Tree (иначе — из объекта).
  it('строка корня вычитания — иконка вычитания, пересечения — пересечения, объединения — объединения', async () => {
    const u = await cubeSphere('union')
    const s = await cubeSphere('subtract')
    const i = await cubeSphere('intersect')
    const h = mount(<ComponentTree objects={Object.values(st().objects)} selectedIds={new Set()} onSelect={noop} onRename={noop} onToggleVis={noop} onDelete={noop} />)
    const icon = (id: string) => h.querySelector(`.ct-item[data-object-id="${id}"] .ct-icon`)!.innerHTML
    expect(icon(s)).toBe(renderToStaticMarkup(<SubtractIcon size={32} />))
    expect(icon(i)).toBe(renderToStaticMarkup(<IntersectIcon size={32} />))
    expect(icon(u)).toBe(renderToStaticMarkup(<UnionIcon size={32} />))
  })
  it('после перестроения из истории (загрузка, перемотка) — та же иконка', async () => {
    const s = await cubeSphere('subtract')
    clearSnapshots(); clearTree()
    const ops = st().operations.slice(0, st().historyIndex)
    const rebuilt = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, rebuilt)                                   // как стор при загрузке/перемотке
    expect(rebuilt[s].operation).toBeUndefined()                     // у объекта операции нет — она из дерева
    const h = mount(<ComponentTree objects={Object.values(rebuilt)} selectedIds={new Set()} onSelect={noop} onRename={noop} onToggleVis={noop} onDelete={noop} />)
    expect(h.querySelector(`.ct-item[data-object-id="${s}"] .ct-icon`)!.innerHTML).toBe(renderToStaticMarkup(<SubtractIcon size={32} />))
  })
})

describe('UX-AUDIT-26 — цилиндр и конус: острая кромка торца, гладкий бок', () => {
  // Было: примитивы «гладкие» — воркер не отдаёт нормалей → computeVertexNormals по общим вершинам:
  // на кромке нормаль усреднена между торцом и боковой (до ≈ 90°), торец выглядел выпуклым; тот же
  // цилиндр в CSG (по излому) — с острой кромкой. Исправлено в fix-all-3: цилиндр и конус — по излому.
  it('у треугольников торца нормаль = нормаль торца (< 1°), как у цилиндра в CSG', async () => {
    for (const type of ['cylinder', 'cone'] as const) {
      const id = await shape(type, undefined, at(0))
      const obj = st().objects[id]
      const geo = buildObjectGeometry(obj)
      geo.computeBoundingBox()
      const zMin = geo.boundingBox!.min.z
      const base = cornerNormals(geo, (p) => Math.abs(p.z - zMin) < 1e-4)
      expect(base.length, type).toBeGreaterThan(0)
      const worst = Math.max(...base.map((n) => THREE.MathUtils.radToDeg(n.angleTo(new THREE.Vector3(0, 0, -1)))))
      expect(worst, type).toBeLessThan(1)
    }
  })
  it('бок цилиндра — гладкий (нормаль ≈ радиальная), а не гранёный; сфера — по-прежнему гладкая по вершинам', async () => {
    const id = await shape('cylinder', undefined, at(0))
    const geo = buildObjectGeometry(st().objects[id])
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal')
    let worst = 0, cnt = 0
    for (let i = 0; i < pos.count; i++) {
      const n = new THREE.Vector3().fromBufferAttribute(nor, i)
      if (Math.abs(n.z) > 0.5) continue                                   // торцы
      const radial = new THREE.Vector3(pos.getX(i), pos.getY(i), 0).normalize()
      worst = Math.max(worst, THREE.MathUtils.radToDeg(n.normalize().angleTo(radial))); cnt++
    }
    expect(cnt).toBeGreaterThan(0)
    expect(worst).toBeLessThan(2)                                        // гранёный бок — до 5,6° (32 сегмента)
    const { shadingOf } = await import('../components/object-geometry')
    expect(shadingOf({ shapeType: 'sphere', params: { radius: 10 } })).toBe('smooth')
  })
})

describe('UX-AUDIT-27 — модалка «3D-текст»: Esc закрывает из любого поля', () => {
  // Было: обработчик Esc — только у поля текста (onKeyDown); фокус в «Размер»/«Глубина» или на
  // кнопке — Esc не действовал. Исправлено в fix-all-3: Esc ловится на окне (как UX-AUDIT-15).
  it('Esc в поле «Размер» и в поле «Глубина» → onClose', () => {
    const onClose = vi.fn()
    const h = mount(<TextModal textInput="Hi" textSize={10} textDepth={2} busy={false} workerOk={true} onTextChange={noop} onSizeChange={noop} onDepthChange={noop} onAdd={noop} onClose={onClose} />)
    const nums = h.querySelectorAll<HTMLInputElement>('.text-modal-num')
    expect(nums).toHaveLength(2)
    for (const el of nums) {
      el.focus()
      act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true })) })
    }
    expect(onClose).toHaveBeenCalledTimes(2)
  })
  it('Esc из поля текста и без фокуса (клик по модалке) — onClose ровно один раз; Enter в поле текста — добавить', () => {
    const onClose = vi.fn(), onAdd = vi.fn()
    const h = mount(<TextModal textInput="Hi" textSize={10} textDepth={2} busy={false} workerOk={true} onTextChange={noop} onSizeChange={noop} onDepthChange={noop} onAdd={onAdd} onClose={onClose} />)
    const input = h.querySelector<HTMLInputElement>('.text-modal-input')!
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(1)                              // не дважды (поле + окно)
    act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(onClose).toHaveBeenCalledTimes(2)
    act(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(onAdd).toHaveBeenCalledTimes(1)
    act(() => root!.unmount()); root = null
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalledTimes(2)                              // после закрытия — слушателя нет
  })
})

describe('UX-AUDIT-28 — вкладка «Список»: имена с номерами, как в «Дереве»', () => {
  // Было: LeftPanel.getShapeLabel — «Куб», «Куб», «CSG результат» (без номера); вкладка «Дерево» —
  // displayName: «Куб 1», «Куб 2», «CSG результат 3». Исправлено в fix-all-3: «Список» — displayName.
  it('имена в «Списке» различимы и совпадают с «Деревом»', async () => {
    await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    await shape('cube', { width: 20, height: 20, depth: 20 }, at(40))
    await cubeSphere('union')
    const objects = Object.values(st().objects)
    const h = mount(
      <LeftPanel shapeSearch="" onShapeSearchChange={noop} workerOk busy={false} onAddShape={noop} onShowTextModal={noop}
        objectList={objects} selSet={new Set()} activeTab="objects" onTabChange={noop} onSelect={noop} onRename={noop}
        onToggleVis={noop} onDeleteObject={noop} historyIndex={0} operations={[]} tlFilters={{}} onFilterChange={noop} onJumpHistory={noop} />,
    )
    const labels = [...h.querySelectorAll('.object-list-label')].map((e) => e.textContent)
    expect(labels).toHaveLength(3)
    expect(labels).toEqual(objects.map((o) => displayName(o, t)))
    expect(new Set(labels).size).toBe(3)
    expect(labels[0]).toMatch(/^Куб \d+$/)
  })
})

describe('UX-AUDIT-29 — фильтр истории: категория = слово шага', () => {
  // Было: фильтр — по op.type: «Повернуть» и «Масштаб» скрывал фильтр «Переместить»; «Вставить куб» —
  // «Добавить», «Вставить CSG» — «CSG», «Вставить импорт» — «Импорт». Исправлено в fix-all-3:
  // категория шага — `filterKeyOf` (фильтры «Вставить», «Повернуть», «Масштаб»).
  it('«Повернуть» не скрывается фильтром «Переместить»; все «Вставить …» — одним фильтром', () => {
    const ops = [
      { type: 'add_shape', id: 'obj_1', shapeType: 'cube', params: {}, color: '#fff', transform: ID },
      { type: 'move', ids: ['obj_1'], delta: { x: 5, y: 0, z: 0 }, kind: 'translate' },
      { type: 'move', ids: ['obj_1'], delta: { x: 0, y: 0, z: 0 }, rotDelta: { x: 0, y: 0, z: 30 }, kind: 'rotate' },
      { type: 'move', ids: ['obj_1'], delta: { x: 0, y: 0, z: 0 }, scaleDelta: { x: 1, y: 0, z: 0 }, kind: 'scale' },
      { type: 'add_shape', id: 'obj_2', shapeType: 'cube', params: {}, color: '#fff', transform: ID, pasted: true },
      { type: 'group', ids: [], resultId: 'obj_3', pasted: true },
      { type: 'import_mesh', id: 'obj_4', name: 'a.stl', color: '#fff', transform: ID, vertices: [], indices: [], pasted: true },
    ] as unknown as TinkerCraftOperation[]
    const labels = ops.map((op) => opLabel(op, t))
    expect(labels).toEqual(['Добавить куб', 'Переместить', 'Повернуть', 'Масштаб', 'Вставить куб', 'Вставить CSG', 'Вставить импорт'])
    // какой фильтр (подпись) скрывает шаг
    const hiddenBy = new Map<string, string[]>()
    for (const key of Object.keys(OP_FILTER_LABELS)) {
      const h = mount(<Timeline operations={ops} historyIndex={ops.length} busy={false} onJump={noop} filters={{ [key]: false }} />)
      const shown = new Set([...h.querySelectorAll('.tl-label')].map((e) => e.textContent))
      for (const l of labels) if (!shown.has(l)) hiddenBy.set(l, [...(hiddenBy.get(l) ?? []), t(`filters.${key}`)])
      act(() => root!.unmount()); host!.remove(); root = null; host = null
    }
    expect(hiddenBy.get('Повернуть')).not.toContain(t('filters.move'))
    const paste = labels.filter((l) => l.startsWith('Вставить')).map((l) => (hiddenBy.get(l) ?? []).join())
    expect(new Set(paste).size).toBe(1)
    // каждый шаг прячет ровно один фильтр — тот, что назван его словом
    expect(Object.fromEntries(labels.map((l) => [l, hiddenBy.get(l)]))).toEqual({
      'Добавить куб': ['Добавить'], 'Переместить': ['Переместить'], 'Повернуть': ['Повернуть'], 'Масштаб': ['Масштаб'],
      'Вставить куб': ['Вставить'], 'Вставить CSG': ['Вставить'], 'Вставить импорт': ['Вставить'],
    })
  })
  it('CSG и выдавливание (старые проекты) — «CSG»; старая вставка CSG (`ids: []` без признака) — «Вставить»', () => {
    const ops = [
      { type: 'group', ids: ['a', 'b'], resultId: 'c', treeOperation: 'subtract' },
      { type: 'group', ids: [], resultId: 'd' },
      { type: 'group', ids: ['a', 's'], resultId: 'e', source: { kind: 'extrude', baseId: 'a', slabId: 's', axis: 'z', depth: 5 } },
      { type: 'move', ids: ['a'], delta: { x: 1, y: 0, z: 0 } },
    ] as unknown as TinkerCraftOperation[]
    expect(ops.map(filterKeyOf)).toEqual(['group', 'paste', 'group', 'move'])
    expect(Object.keys(OP_FILTER_LABELS)).toEqual(expect.arrayContaining(['paste', 'rotate', 'scale']))
    expect(i18n.getResource('en', 'translation', 'filters.paste')).toBe('Paste')
  })
})

describe('UX-AUDIT-31 — 3D-текст в истории — «Добавить текст: …», в свойствах — «Текст»', () => {
  // Было: текст добавляется импортом (addRawMesh → шаг import_mesh): в истории «Импорт Текст: Привет»
  // с иконкой импорта, в свойствах «Тип: Импорт», в фильтре — «Импорт». Исправлено в fix-all-3: у шага
  // и объекта — исходная строка `text` (store/text-object.ts); старые проекты — по id `txt_N`.
  it('шаг истории текста «Привет» — «Добавить текст: Привет», иконка текста, фильтр «Добавить»; объект — текст', async () => {
    expect(await addTextObject('Привет', { size: 10, depth: 2 })).toBe(true)
    const op = st().operations[st().historyIndex - 1]
    expect(opLabel(op, t)).toBe('Добавить текст: Привет')
    expect(renderToStaticMarkup(<>{opIcon(op)}</>)).toBe(renderToStaticMarkup(<TextIcon size={32} />))
    expect(filterKeyOf(op)).toBe('add_shape')
    const obj = Object.values(st().objects)[0]
    expect(obj.text).toBe('Привет')
    expect(isTextObject(obj)).toBe(true)
    // дерево — иконка текста
    const h = mount(<ComponentTree objects={[obj]} selectedIds={new Set()} onSelect={noop} onRename={noop} onToggleVis={noop} onDelete={noop} />)
    expect(h.querySelector('.ct-item[data-object-id] .ct-icon')!.innerHTML).toBe(renderToStaticMarkup(<TextIcon size={32} />))
    await i18n.changeLanguage('en')
    expect(opLabel(op, t)).toBe('Add Text: Привет')
  })
  it('живое = rebuild и .3dtc: строка текста у объекта; копия — «Вставить текст», тоже текст', async () => {
    await addTextObject('Дом', { size: 10, depth: 2 })
    const id = Object.keys(st().objects)[0]
    // копия
    st().selectObjects([id], false); st().copySelected(); await st().pasteClipboard()
    const pasteOp = st().operations[st().historyIndex - 1]
    expect(opLabel(pasteOp, t)).toBe('Вставить текст')
    expect(filterKeyOf(pasteOp)).toBe('paste')
    const copy = Object.values(st().objects).find((o) => o.id !== id)!
    expect([copy.text, copy.name, isTextObject(copy)]).toEqual(['Дом', 'Текст: Дом', true])
    // перестроение из истории и файл
    const ops = st().operations.slice(0, st().historyIndex)
    const live = st().objects
    clearSnapshots(); clearTree()
    const rebuilt = await rebuildFromHistory(ops)
    for (const k of Object.keys(live)) expect([rebuilt[k].text, rebuilt[k].name], k).toEqual([live[k].text, live[k].name])
    const doc = await parse3dtc(await serialize3dtc({ objects: live, operations: ops, operationsTrimmed: false }))
    expect(doc.operations.map((o) => (o.type === 'import_mesh' ? o.text : null))).toEqual(['Дом', 'Дом'])
  })
  it('импорт STL — по-прежнему «Импорт …» и тип «Импорт»; старый проект (без поля, id txt_N) — текст', async () => {
    const stl = { type: 'import_mesh', id: 'stl_3', name: 'a.stl', color: '#fff', transform: ID, vertices: [], indices: [] } as unknown as TinkerCraftOperation
    expect(opLabel(stl, t)).toBe('Импорт a.stl')
    expect(filterKeyOf(stl)).toBe('import_mesh')
    expect(isTextObject({ id: 'stl_3', shapeType: 'import_mesh' })).toBe(false)
    const legacy = { type: 'import_mesh', id: 'txt_5', name: 'Текст: Дом', color: '#fff', transform: ID, vertices: [], indices: [] } as unknown as TinkerCraftOperation
    expect(opLabel(legacy, t)).toBe('Добавить текст: Дом')
    const legacyEn = { ...legacy, name: 'Text: Hi' } as TinkerCraftOperation
    expect(opLabel(legacyEn, t)).toBe('Добавить текст: Hi')
    expect(isTextObject({ id: 'txt_5', shapeType: 'import_mesh' })).toBe(true)
    expect(isTextObject({ id: 'csg_5', shapeType: 'csg' })).toBe(false)
  })
})
