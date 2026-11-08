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
import { worldProjectionRange } from '../store/helpers'
import { buildObjectGeometry } from '../components/object-geometry'
import { findNearestSnap, closestVertex, closestEdge } from '../components/snap-utils'
import { applyTransformToPivot } from '../components/viewport-hooks'
import { addTextObject } from '../store/add-text'
import { isTextObject } from '../store/text-object'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import ComponentTree from '../components/ComponentTree'
import { opLabel, filterKeyOf } from '../components/Timeline'
import { TextIcon } from '../components/icons'
import { renderToStaticMarkup } from 'react-dom/server'
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

describe('UX-AUDIT-32 — «Выровнять»: непараллельная грань B поворачивается в плоскость A', () => {
  // Было: solvePlaneAlignDelta (ALIGN-UI-REVIT) — только сдвиг вдоль нормали плоскости: непараллельная
  // грань — сдвиг до касания крайней точкой (куб + призма: ничего). Исправлено в fix-all-4:
  // solvePlaneAlignTransform — поворот по кратчайшей дуге (нормаль B → нормаль A, в ту же сторону)
  // вокруг точки клика + сдвиг; параллельная/встречная грань и грань гладкой поверхности (цилиндр,
  // сфера — isSmoothSurfaceAt) — только сдвиг, как раньше (ALIGN-REVIT).
  /** Боковая (или любая с `accept`) грань объекта: индекс треугольника, мировые нормаль и точка. */
  function face(id: string, accept: (n: THREE.Vector3) => boolean) {
    const o = st().objects[id]
    const k = Array.from({ length: o.indices.length / 3 }, (_, i) => i).find((i) => accept(triNormal(worldTri(o, i))))!
    const n = triNormal(worldTri(o, k)), q = worldTri(o, k)[0]
    return { objectId: id, triangleIndex: k, normal: { x: n.x, y: n.y, z: n.z }, point: { x: q.x, y: q.y, z: q.z } }
  }
  async function align(a: ReturnType<typeof face>, b: ReturnType<typeof face>) {
    useAlignModeStore.getState().startAlignMode()
    await useAlignModeStore.getState().clickFace(a)
    await useAlignModeStore.getState().clickFace(b)
  }
  const COS1 = Math.cos(THREE.MathUtils.degToRad(1))
  /** UX-AUDIT-37: куда смотрит грань B после выравнивания — +1 в ту же сторону, что нормаль A (угол ≤ 90°), −1 встречно (> 90°). */
  const sideOf = (nb: { x: number; y: number; z: number }, nA: { x: number; y: number; z: number }) =>
    nb.x * nA.x + nb.y * nA.y + nb.z * nA.z < -Math.sin(THREE.MathUtils.degToRad(1)) ? -1 : 1

  it('куб — верхняя грань (A), призма — боковая грань (B) → призма повёрнута, нормаль B = нормаль A (в ту же сторону), грань B — в плоскости A', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const prism = await shape('prism', undefined, at(40))
    expect(st().objects[prism].params.sides).toBe(6)
    const b = face(prism, (n) => Math.abs(n.z) < 0.01)
    await align(face(cube, (n) => n.z > 0.99), b)
    const after = worldTri(st().objects[prism], b.triangleIndex)
    expect(triNormal(after).z).toBeGreaterThan(COS1)                                  // dot > 0: в ту же сторону
    for (const v of after) expect(v.z).toBeCloseTo(10, 3)                             // грань B — в плоскости A
    expect(lastOp().type).toBe('move')                                                 // один шаг истории
    expect(opLabel(lastOp(), t)).toBe('Повернуть')
    expect(useAlignModeStore.getState().alignMode).toBeNull()                          // режим закрыт (без «Множественного»)
  })

  it('призма уже повёрнута (rotX 20, rotZ 17) и растянута (scaleX 2); плоскость A — боковая грань куба (+X)', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const prism = await shape('prism', undefined, { ...at(50, 10, 5), rotX: 20, rotZ: 17, scaleX: 2 })
    const b = face(prism, (n) => Math.abs(n.dot(new THREE.Vector3(1, 0, 0))) < 0.9 && Math.abs(n.z) < 0.95)
    await align(face(cube, (n) => n.x > 0.99), b)
    const o = st().objects[prism]
    const after = worldTri(o, b.triangleIndex)
    // UX-AUDIT-37 (fix-all-5): угол с нормалью A ≤ 90° — в ту же сторону, > 90° — встречно
    expect(triNormal(after).x * sideOf(b.normal, { x: 1, y: 0, z: 0 })).toBeGreaterThan(COS1)
    for (const v of after) expect(v.x).toBeCloseTo(10, 3)
    expect([o.transform.scaleX, o.transform.scaleY, o.transform.scaleZ]).toEqual([2, 1, 1])  // масштаб — в локальных осях
  })

  it('параллельная грань (верх призмы) и встречная (низ призмы) — только сдвиг, без поворота, как раньше', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const prism = await shape('prism', undefined, at(40, 0, 25))
    await align(face(cube, (n) => n.z > 0.99), face(prism, (n) => n.z > 0.99))
    let o = st().objects[prism]
    expect([o.transform.rotX, o.transform.rotY, o.transform.rotZ]).toEqual([0, 0, 0])
    expect(o.transform.z).toBeCloseTo(0, 6)                                            // верх призмы — z = 10
    await align(face(cube, (n) => n.z > 0.99), face(prism, (n) => n.z < -0.99))
    o = st().objects[prism]
    expect([o.transform.rotX, o.transform.rotY, o.transform.rotZ]).toEqual([0, 0, 0])  // встречная — не переворачивается
    expect(o.transform.z).toBeCloseTo(20, 6)                                           // низ призмы — z = 10
  })

  it('живое = rebuild (перестроение из истории), undo возвращает призму, повтор — снова в плоскости', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const prism = await shape('prism', undefined, { ...at(40), rotZ: 10 })
    const b = face(prism, (n) => Math.abs(n.z) < 0.01)
    const before = { ...st().objects[prism].transform }
    await align(face(cube, (n) => n.z > 0.99), b)
    const live = st().objects[prism]
    const ops = st().operations.slice(0, st().historyIndex)
    clearSnapshots(); clearTree()
    const rebuilt = (await rebuildFromHistory(ops))[prism]
    const lw = worldTri(live, b.triangleIndex), rw = worldTri(rebuilt, b.triangleIndex)
    for (let i = 0; i < 3; i++) expect(rw[i].distanceTo(lw[i])).toBeLessThan(1e-4)
    await st().undo()
    expect(st().objects[prism].transform).toEqual(before)
    await st().redo()
    for (const v of worldTri(st().objects[prism], b.triangleIndex)) expect(v.z).toBeCloseTo(10, 3)
  })

  it('гладкая поверхность (бок цилиндра) — касание крайней точкой без поворота; плоская (торец наклонённого цилиндра, грань повёрнутого куба) — поворот', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const cyl = await shape('cylinder', { radius: 5, height: 20, segments: 48 }, { ...at(40, 0, 30), rotY: 45 })
    // бок цилиндра (нормаль наклонная) → только сдвиг: нижняя точка цилиндра — в z = 10
    const axis = new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2)                     // ось цилиндра после rotY 45
    await align(face(cube, (n) => n.z > 0.99), face(cyl, (n) => Math.abs(n.dot(axis)) < 0.01 && n.z < -0.2))
    let o = st().objects[cyl]
    expect([o.transform.rotX, o.transform.rotY, o.transform.rotZ]).toEqual([0, 45, 0])
    expect(worldProjectionRange(o, { x: 0, y: 0, z: 1 }).min).toBeCloseTo(10, 3)
    // торец (плоский, нормаль под 45° или 135° к +Z) → поворот: торец в z = 10 — смотрит вверх
    // (45°) или вниз (135° — встречно, UX-AUDIT-37)
    const cap = face(cyl, (n) => Math.abs(n.dot(new THREE.Vector3(Math.SQRT1_2, 0, Math.SQRT1_2))) > 0.999)
    await align(face(cube, (n) => n.z > 0.99), cap)
    o = st().objects[cyl]
    const after = worldTri(o, cap.triangleIndex)
    expect(triNormal(after).z * sideOf(cap.normal, { x: 0, y: 0, z: 1 })).toBeGreaterThan(COS1)
    for (const v of after) expect(v.z).toBeCloseTo(10, 3)
    // повёрнутый куб (rotX 45) к плоскости XY по грани, смотрящей вверх → куб выпрямлен, грань — в z = 0
    const k2 = await shape('cube', { width: 20, height: 20, depth: 20 }, { ...at(-40, 0, 20), rotX: 45 })
    const kf = face(k2, (n) => n.z > 0.1 && n.z < 0.95)
    useAlignModeStore.getState().startAlignMode()
    useAlignModeStore.getState().setPlane({ axis: 'Z' })
    await useAlignModeStore.getState().clickFace(kf)
    const ka = worldTri(st().objects[k2], kf.triangleIndex)
    expect(triNormal(ka).z).toBeGreaterThan(COS1)
    for (const v of ka) expect(v.z).toBeCloseTo(0, 3)
    expect(st().objects[k2].transform.z).toBeCloseTo(-10, 3)
  })

  it('isSmoothSurfaceAt: грань куба и торец цилиндра — плоские, бок цилиндра и сфера — гладкие; порог = порогу затенения', async () => {
    const { isSmoothSurfaceAt, ALIGN_SMOOTH_DEG } = await import('../store/helpers')
    const { CREASE_ANGLE_DEG } = await import('../components/object-geometry')
    expect(ALIGN_SMOOTH_DEG).toBe(CREASE_ANGLE_DEG)
    const ids = [await shape('cube', { width: 20, height: 20, depth: 20 }, at(0)), await shape('cylinder', { radius: 5, height: 20, segments: 48 }, at(30)), await shape('sphere', { radius: 10, segments: 32 }, at(60))]
    const [cube, cyl, sph] = ids.map((id) => st().objects[id])
    const tris = (o: SceneObject, accept: (n: THREE.Vector3) => boolean) => Array.from({ length: o.indices.length / 3 }, (_, k) => k).filter((k) => accept(triNormal(worldTri(o, k))))
    expect(tris(cube, () => true).every((k) => !isSmoothSurfaceAt(cube, k))).toBe(true)
    expect(tris(cyl, (n) => Math.abs(n.z) > 0.99).every((k) => !isSmoothSurfaceAt(cyl, k))).toBe(true)
    expect(tris(cyl, (n) => Math.abs(n.z) < 0.01).every((k) => isSmoothSurfaceAt(cyl, k))).toBe(true)
    expect(tris(sph, () => true).filter((k) => isSmoothSurfaceAt(sph, k)).length).toBeGreaterThan(sph.indices.length / 3 * 0.95)
  })

  it('eulerXYZFromMatrix — обратная к computeRSMatrix (углы ±180°, «замок» rotY ±90°)', async () => {
    const { eulerXYZFromMatrix } = await import('../store/helpers')
    for (const r of [{ rotX: 10, rotY: 20, rotZ: 30 }, { rotX: -170, rotY: 45, rotZ: 120 }, { rotX: 0, rotY: 90, rotZ: 0 }, { rotX: 33, rotY: -60, rotZ: -150 }]) {
      const m = computeRSMatrix(r, { scaleX: 1, scaleY: 1, scaleZ: 1 })
      const back = computeRSMatrix(eulerXYZFromMatrix(m), { scaleX: 1, scaleY: 1, scaleZ: 1 })
      for (let i = 0; i < 9; i++) expect(back[i]).toBeCloseTo(m[i], 9)
    }
  })
})

describe('UX-AUDIT-33 — зеркальная копия 3D-текста — тоже текст (живое = rebuild)', () => {
  // Было: mirrorObject (mirror-store) переносил в копию `name`, но не `text` (UX-AUDIT-31): живая копия —
  // «Тип: Импорт», после перезагрузки (rebuild копирует метаданные источника целиком) — «Текст».
  // Исправлено в fix-all-4: копия текста получает `text` (у старого текста — из имени).
  it('зеркальная копия текста «Дом» — тоже текст, и живая, и после перестроения из истории', async () => {
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
    expect([copy.text, isTextObject(copy)]).toEqual(['Дом', true])                      // живая — тоже
    expect(rebuilt[copy.id].text).toBe(copy.text)
  })
  it('старый текст (txt_N без поля `text`) — копия тоже текст, строка — из имени', async () => {
    await addTextObject('Hi', { size: 10, depth: 2 })
    const id = Object.keys(st().objects)[0]
    const { text: _drop, ...legacy } = st().objects[id]
    void _drop
    useDocumentStore.setState({ objects: { [id]: legacy } })
    expect(isTextObject(st().objects[id])).toBe(true)                                   // по id txt_N
    st().selectObjects([id], false)
    await st().mirrorSelected('XZ')
    const copy = Object.values(st().objects).find((o) => o.id !== id)!
    expect([copy.text, isTextObject(copy)]).toEqual(['Hi', true])
  })
})

describe('UX-AUDIT-34 — дерево: 3D-текст внутри CSG — «Текст: …»', () => {
  // Было: ComponentTree.childLabel — запечённый ребёнок без shapeType — «Импорт» (текст в CSG тоже).
  // Исправлено в fix-all-4: строка текста узла — из истории (store/text-object `textsByObjectId`:
  // шаги import_mesh с текстом, зеркальные копии; узлы копий CSG — по источнику).
  it('куб − текст «Дом» → в раскрытом дереве ребёнок — «Текст: Дом», с иконкой текста; после перестроения — так же', async () => {
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
    expect(children[1]).toBe('Текст: Дом')
    const icons = [...h.querySelectorAll('.ct-child .ct-icon')].map((e) => e.innerHTML)
    expect(icons[1]).toBe(renderToStaticMarkup(<TextIcon size={32} />))
    // после перестроения из истории (загрузка .3dtc) — так же
    const ops = st().operations.slice(0, st().historyIndex)
    clearSnapshots(); clearTree()
    const rebuilt = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, rebuilt)
    act(() => root!.render(<ComponentTree objects={Object.values(rebuilt)} selectedIds={new Set()} onSelect={noop} onRename={noop} onToggleVis={noop} onDelete={noop} />))
    expect([...h.querySelectorAll('.ct-child .ct-name')].map((e) => e.textContent ?? '')[1]).toBe('Текст: Дом')
  })
  it('копия CSG с текстом (Ctrl+C/V) и зеркальная копия текста в CSG — тоже «Текст: …»; STL в CSG — «Импорт»', async () => {
    const cube = await shape('cube', { width: 60, height: 60, depth: 20 }, at(0))
    await addTextObject('Дом', { size: 10, depth: 15 })
    const txt = Object.keys(st().objects).find((k) => k !== cube)!
    st().selectObjects([txt], false)
    await st().mirrorSelected('YZ')
    const mir = Object.keys(st().objects).find((k) => k !== cube && k !== txt)!
    st().selectObjects([cube, mir], false)
    await st().csgBoolean('subtract')
    const g = Object.keys(st().objects).find((k) => st().objects[k].shapeType === 'csg')!
    st().selectObjects([g], false); st().copySelected(); await st().pasteClipboard()
    const copy = Object.keys(st().objects).find((k) => st().objects[k].shapeType === 'csg' && k !== g)!
    useUiStore.setState({ expandedTreeIds: { [g]: true, [copy]: true } })
    const h = mount(<ComponentTree objects={Object.values(st().objects)} selectedIds={new Set()} onSelect={noop} onRename={noop} onToggleVis={noop} onDelete={noop} />)
    const names = [...h.querySelectorAll('.ct-child .ct-name')].map((e) => e.textContent ?? '')
    expect(names.filter((n) => n.startsWith('Текст: Дом'))).toHaveLength(2)          // в оригинале и в копии CSG
    expect(names.some((n) => n.startsWith('Импорт'))).toBe(false)
    // не текст — «Импорт» по-прежнему
    const { textOfNode, textsByObjectId } = await import('../store/text-object')
    const stl = { type: 'import_mesh', id: 'stl_5', name: 'a.stl', color: '#fff', transform: ID, vertices: [], indices: [] } as unknown as TinkerCraftOperation
    expect(textOfNode('stl_5', textsByObjectId([stl]))).toBeUndefined()
    expect(textOfNode(`csg_9:${txt}`, textsByObjectId(st().operations))).toBe('Дом')
  })
})

describe('UX-AUDIT-35 — линейка: привязка ищется только рядом с курсором (тот же результат)', () => {
  // Было: на каждое движение мыши все вершины и рёбра меша переводились в мир и перебирались (импорт
  // 100k — 60–110 мс на движение). Исправлено в fix-all-4: сетка треугольников геометрии (кэш),
  // кандидаты — треугольники рядом с точкой попадания. Здесь — что результат совпадает с полным
  // перебором (время — e2e/ux-audit-4.mjs, браузер).
  /** Полный перебор (как было): ближайшая вершина ≤ 2, иначе ближайшее ребро ≤ 2. */
  function reference(mesh: THREE.Mesh, hit: THREE.Vector3): { type: string; point: THREE.Vector3 } | null {
    const g = mesh.geometry, pos = g.getAttribute('position'), idx = g.getIndex()
    const tris = (idx ? idx.count : pos.count) / 3
    const w = (i: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld)
    const verts: THREE.Vector3[] = [], edges: { from: THREE.Vector3; to: THREE.Vector3 }[] = []
    for (let t = 0; t < tris; t++) {
      const c = [0, 1, 2].map((k) => w(idx ? idx.getX(t * 3 + k) : t * 3 + k))
      verts.push(...c)
      edges.push({ from: c[0], to: c[1] }, { from: c[1], to: c[2] }, { from: c[2], to: c[0] })
    }
    const v = closestVertex(verts, hit)
    if (v) return { type: 'vertex', point: v.point }
    const e = closestEdge(edges, hit)
    return e ? { type: 'edge', point: e.point } : null
  }
  async function check(obj: SceneObject, pivotT: TransformNR, rays: number) {
    const mesh = new THREE.Mesh(buildObjectGeometry(obj), new THREE.MeshBasicMaterial())
    mesh.userData.objectId = obj.id
    const pivot = new THREE.Object3D()
    applyTransformToPivot(pivot, pivotT)
    pivot.add(mesh); pivot.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(mesh)
    const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3())
    let rng = 7
    const rnd = () => { rng = (rng * 16807) % 2147483647; return rng / 2147483647 }
    let compared = 0
    for (let k = 0; k < rays; k++) {
      const target = new THREE.Vector3(centre.x + (rnd() - 0.5) * size.x, centre.y + (rnd() - 0.5) * size.y, centre.z + (rnd() - 0.5) * size.z)
      const from = target.clone().add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, 1).normalize().multiplyScalar(200))
      const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 1000); cam.position.copy(from); cam.lookAt(target); cam.updateMatrixWorld()
      const rc = new THREE.Raycaster(); rc.set(from, target.clone().sub(from).normalize())
      const hit = rc.intersectObject(mesh, false)[0]
      if (!hit) continue
      const got = findNearestSnap(rc, { current: new Map([[obj.id, { mesh, pivot }]]) }, cam, new THREE.Vector2(0, 0))
      const ref = reference(mesh, hit.point)
      if (ref) {
        expect(got?.type, `луч ${k}`).toBe(ref.type)
        expect(got!.point.distanceTo(ref.point), `луч ${k}`).toBeLessThan(1e-6)
      } else {
        expect(['vertex', 'edge']).not.toContain(got?.type)
      }
      compared++
    }
    expect(compared).toBeGreaterThan(rays / 3)
  }
  it('CSG куб ∪ сфера (без индекса), повёрнутый и растянутый; куб (с индексом); 120 лучей — как полный перебор', async () => {
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const b = await shape('sphere', { radius: 10, segments: 32 }, at(12))
    st().selectObjects([a, b], false); await st().csgBoolean('union')
    const g = st().objects[Object.keys(st().objects)[0]]
    await check(g, { ...g.transform, rotX: 25, rotZ: 40, scaleX: 1.7, scaleZ: 0.6 }, 120)
    const cid = await shape('cube', { width: 20, height: 20, depth: 20 }, at(50))
    const c = st().objects[cid]
    await check(c, { ...c.transform, rotY: 30 }, 60)
  })
})
