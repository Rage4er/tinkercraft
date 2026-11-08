// ============================================================
// ux-audit-6.test.tsx — UX-прогон 6 (H–N + O–T + U–Y повторно, проверка фиксов 32-followup, 36–40):
// логика на реальном WASM
// ============================================================
// ✅ — проверки фиксов fix-all-5, которых нет в ux-audit-5 (текст en → ru, правило 37 в «Множественном»);
// 🐞 — новые баги: `it.fails` «ожидание» — тест проверяет ожидание пользователя и сейчас падает
//      (баг воспроизводится; каждый проверен — падает на своей проверке). После фикса (fix-all-6):
//      `it.fails` → `it`. Браузерная часть — e2e/ux-audit-6.mjs (`knownBug`).
// Описание и шаги — DEVELOPMENT_PLAN.md › «UX-AUDIT-6».

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
import { displayName } from '../components/ComponentTree'
import StepPanel from '../components/StepPanel'
import type { MoveOperation, SceneObject, ShapeParams, ShapeType, TransformNR, TinkerCraftOperation } from '../csg/types'
import { alignRotationCenter, computeAABB, computeWorldAABB } from '../store/helpers'

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
// ✅ Фиксы fix-all-5 на месте — проверки, которых нет в ux-audit-5
// ════════════════════════════════════════════════════════════

describe('UX-прогон 6 — U. Имя текста на языке интерфейса в обе стороны (UX-AUDIT-36)', () => {
  it('U1: текст «Hi», созданный в en («Text: Hi»), в ru — «Текст: Hi»; переименованный — «Логотип» на обоих языках', async () => {
    await i18n.changeLanguage('en')
    await addTextObject('Hi', { size: 10, depth: 2 })
    const id = Object.keys(st().objects)[0]
    expect(st().objects[id].name).toBe('Text: Hi')                                    // хранится на языке создания
    expect(displayName(st().objects[id], t)).toBe('Text: Hi')
    await i18n.changeLanguage('ru')
    expect(displayName(st().objects[id], t)).toBe('Текст: Hi')
    st().renameObject(id, 'Логотип')
    expect(displayName(st().objects[id], t)).toBe('Логотип')
    await i18n.changeLanguage('en')
    expect(displayName(st().objects[id], t)).toBe('Логотип')
  })
})

describe('UX-прогон 6 — K. «Множественное»: правило 37 и поворот на месте для каждой грани B (UX-AUDIT-32-followup, 37)', () => {
  it('K1: плоскость Y; три куба Y 40 с гранями под 85° / 90° / 95° — в ту же сторону / в ту же / встречно, каждый на своём X', async () => {
    const cubes: { id: string; theta: number; x: number; y: number; dir: number }[] = []
    for (const [theta, x, y, dir] of [[95, -40, -10, 1], [90, 0, -10, 1], [85, 40, 10, -1]] as const) {
      cubes.push({ id: await shape('cube', { width: 20, height: 20, depth: 20 }, { ...at(x, 40), rotZ: theta }), theta, x, y, dir })
    }
    const picks = cubes.map((c) => { const th = THREE.MathUtils.degToRad(c.theta); return face(c.id, (n) => n.distanceTo(new THREE.Vector3(Math.sin(th), -Math.cos(th), 0)) < 1e-4) })
    await align('Y', ...picks)
    cubes.forEach((c, i) => {
      const o = st().objects[c.id]
      expect(triNormal(worldTri(o, picks[i].triangleIndex)).y * c.dir, `θ ${c.theta}`).toBeGreaterThan(COS1)
      expect([o.transform.x, o.transform.z], `θ ${c.theta}`).toEqual([c.x, 0])          // на месте
      expect(o.transform.y, `θ ${c.theta}`).toBeCloseTo(c.y, 4)                         // сдвиг только по Y
    })
    expect(st().operations.slice(-3).every((op) => op.type === 'move')).toBe(true)     // три шага
  })
})

// ════════════════════════════════════════════════════════════
// 🐞 Новые баги прогона 6 (логика) — it.fails «ожидание»
// ════════════════════════════════════════════════════════════

describe('UX-AUDIT-41 — «Выровнять» с поворотом: CSG поворачивается на месте — вокруг центра рамки, а не опорной точки (✅ fix-all-6)', () => {
  // UX-AUDIT-32-followup (fix-all-5): поворот — вокруг опорной точки объекта (X/Y/Z в свойствах). У
  // примитивов это центр, у CSG — позиция операнда A (Фаза 8.5): CSG куб X 0 ∪ куб X 60 (центр X 30)
  // торцом +X к верху куба поворачивался вокруг X 0 — тело уходило на 30 мм вбок (e2e, экспорт STL).
  // Фикс (fix-all-6): центр поворота CSG — центр её рамки (`alignRotationCenter`); у примитивов —
  // по-прежнему опорная точка. Опорная точка CSG (операнд A) поворачивается вместе с телом.
  it('ожидание: CSG (куб X 0 ∪ куб X 60) торцом +X к верху куба C — центр тела X 30, Y 0 (сдвиг только по Z)', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(-80))
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const b = await shape('cube', { width: 20, height: 20, depth: 20 }, at(60))
    st().selectObjects([a, b], false); await st().csgBoolean('union')
    const g = Object.keys(st().objects).find((k) => st().objects[k].shapeType === 'csg')!
    const box0 = computeWorldAABB(st().objects[g])
    expect([(box0.min.x + box0.max.x) / 2, st().objects[g].transform.x]).toEqual([30, 0])  // центр X 30, опорная точка — A
    const fB = face(g, (n) => n.x > 0.9999)
    await align(face(c, (n) => n.z > 0.99), fB)
    const o = st().objects[g]
    for (const v of worldTri(o, fB.triangleIndex)) expect(v.z).toBeCloseTo(10, 3)      // торец — в плоскости A
    expect(triNormal(worldTri(o, fB.triangleIndex)).z).toBeGreaterThan(COS1)          // поворот — есть
    const box = computeWorldAABB(o)
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(30, 3)                            // было 0 (вокруг опорной точки A)
    expect((box.min.y + box.max.y) / 2).toBeCloseTo(0, 3)
    // кубы не пересекаются: грань B — +X куба A (x 10); тело встало вертикально, A — внизу, под центром,
    // его верх — в плоскости A: опорная точка (операнд A) повернулась вместе с телом — X 0 → 30, Z 0
    expect([o.transform.x, o.transform.y, o.transform.z].map((v) => +v.toFixed(3))).toEqual([30, 0, 0])
    expect(o.transform.rotY).toBeCloseTo(-90, 4)
  })

  it('регресс: уже повёрнутая и растянутая CSG — поворот вокруг центра рамки через полный TRS (центр X/Y на месте)', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(-80))
    const a = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const b = await shape('cube', { width: 20, height: 20, depth: 20 }, at(60))
    st().selectObjects([a, b], false); await st().csgBoolean('union')
    const g = Object.keys(st().objects).find((k) => st().objects[k].shapeType === 'csg')!
    await st().moveObject(g, { ...at(0, 0), rotZ: 90, scaleX: 1.5 })                   // тело вдоль Y: Y −15…105
    const box0 = computeWorldAABB(st().objects[g])
    const c0 = [(box0.min.x + box0.max.x) / 2, (box0.min.y + box0.max.y) / 2]
    expect(c0.map((v) => +v.toFixed(3))).toEqual([0, 45])
    const fB = face(g, (n) => n.y > 0.9999)                                             // бывший торец +X
    await align(face(c, (n) => n.z > 0.99), fB)
    const o = st().objects[g]
    for (const v of worldTri(o, fB.triangleIndex)) expect(v.z).toBeCloseTo(10, 3)
    const box = computeWorldAABB(o)
    expect((box.min.x + box.max.x) / 2).toBeCloseTo(c0[0], 3)
    expect((box.min.y + box.max.y) / 2).toBeCloseTo(c0[1], 3)
    expect([o.transform.scaleX, o.transform.scaleY, o.transform.scaleZ]).toEqual([1.5, 1, 1])   // масштаб — в локальных осях
  })

  it('регресс (32-followup): примитивы — центр поворота = опорная точка; конус и пирамида (центр масс ≠ центр рамки) — тоже', async () => {
    const cube = await shape('cube', { width: 20, height: 20, depth: 20 }, { ...at(5, 6, 7), rotZ: 33, scaleX: 2 })
    const cone = await shape('cone', undefined, { ...at(-30, 4, 2), rotX: 40 })
    const pyr = await shape('pyramid', undefined, { ...at(30, -4, 1), rotY: 25 })
    for (const id of [cube, cone, pyr]) {
      const o = st().objects[id]
      expect(alignRotationCenter(o)).toEqual({ x: o.transform.x, y: o.transform.y, z: o.transform.z })
    }
    // центр рамки конуса не в опорной точке — у примитива он не используется
    const cb = computeAABB(st().objects[cone].vertices)
    expect((cb.min.z + cb.max.z) / 2).toBeGreaterThan(1)
    // конус гранью основания к плоскости X: поворот вокруг опорной точки — Y/Z опорной точки на месте
    const k = await shape('cone', undefined, { ...at(0, 40, 0), rotX: 30 })
    const base = face(k, (n) => n.dot(new THREE.Vector3(0, Math.sin(THREE.MathUtils.degToRad(30)), -Math.cos(THREE.MathUtils.degToRad(30)))) > 0.9999)
    await align('X', base)
    const o = st().objects[k]
    expect([o.transform.y, o.transform.z].map((v) => +v.toFixed(4))).toEqual([40, 0])
    expect(triNormal(worldTri(o, base.triangleIndex)).x).toBeGreaterThan(COS1)
  })
})

describe('UX-AUDIT-42 — поворот шага выравнивания через ±180°: −330° вместо 30° (разность углов Эйлера)', () => {
  // moveObject пишет дельту поворота как «углы после − углы до», без приведения к ±180°. Выравнивание
  // поворачивает куб rotZ 170 на +30° (по кратчайшей дуге), углы — 170 → −160 (eulerXYZFromMatrix,
  // (−180°, 180°]), шаг — rotDelta z −330. После UX-AUDIT-38 это видно: «Исходно» — «поворот (0, 0,
  // −330)°», в поле «Поворот Z» — −330 (в браузере и куб rotZ 90 → плоскость Y: −270 вместо 90).
  // Ожидание: дельта углов шага — в (−180°, 180°]: «поворот (0, 0, 30)°».
  it.fails('ожидание: куб rotZ 170, грань под −10° → плоскость A — бок куба rotZ 20 (20°) → шаг «Повернуть» с поворотом (0, 0, 30)°', async () => {
    const r = await shape('cube', { width: 20, height: 20, depth: 20 }, { ...at(0), rotZ: 20 })
    const k = await shape('cube', { width: 20, height: 20, depth: 20 }, { ...at(60), rotZ: 170 })
    const dir = (deg: number) => new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(deg)), Math.sin(THREE.MathUtils.degToRad(deg)), 0)
    const fB = face(k, (n) => n.distanceTo(dir(-10)) < 1e-4)
    await align(face(r, (n) => n.distanceTo(dir(20)) < 1e-4), fB)
    const o = st().objects[k]
    expect(triNormal(worldTri(o, fB.triangleIndex)).dot(dir(20))).toBeGreaterThan(COS1)   // выравнивание — верно
    expect(o.transform.rotZ).toBeCloseTo(-160, 6)                                          // 170 + 30 = 200 ≡ −160
    const op = lastOp() as MoveOperation
    expect(op.kind).toBe('rotate')
    expect(op.rotDelta!.z).toBeCloseTo(30, 6)                                              // ← сейчас −330
  })
})
