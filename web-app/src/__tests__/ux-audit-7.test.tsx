// ============================================================
// ux-audit-7.test.tsx — UX-прогон 7 (H–N + O–T + U–Y повторно, проверка фиксов 41, 42):
// логика на реальном WASM
// ============================================================
// ✅ — проверки фиксов fix-all-6, которых нет в ux-audit-6: CSG после выравнивания с поворотом
// (undo/redo без снимков, правка ребёнка, правка шага, копия, зеркальная копия, вложенный CSG),
// центр поворота импорта и текста — опорная точка (центр масс); углы — правка шага поворота,
// гизмо через 90° по Y (равносильная запись), накопление 350 + 30, ручной ввод 270.
// Новых багов прогон 7 не нашёл — `it.fails` нет. Браузерная часть — e2e/ux-audit-7.mjs.
// Описание — DEVELOPMENT_PLAN.md › «UX-AUDIT-7».

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
import { rebuildFromHistory } from '../store/rebuild'
import StepPanel from '../components/StepPanel'
import { alignRotationCenter, computeAABB, computeWorldAABB, continuousEuler } from '../store/helpers'
import type { AlignOperation, MoveOperation, SceneObject, ShapeParams, ShapeType, TransformNR, TinkerCraftOperation } from '../csg/types'
import { isStepEditable } from '../store/edit-step'
import { projectHistory } from '../store/project-history'
import { opLabel } from '../components/Timeline'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0): TransformNR => ({ ...ID, x, y, z })
const lastOp = (): TinkerCraftOperation => st().operations[st().historyIndex - 1]
const CUBE = { width: 20, height: 20, depth: 20 }

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
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null; host = null
})

const newId = async (fn: () => Promise<unknown> | void): Promise<string> => {
  const before = new Set(Object.keys(st().objects))
  await fn()
  return Object.keys(st().objects).find((k) => !before.has(k))!
}
async function shape(type: ShapeType, params: ShapeParams | undefined, tr: TransformNR): Promise<string> {
  const id = await newId(() => st().addShape(type, params))
  await st().moveObject(id, tr)
  return id
}
/** CSG: куб C (X −80, плоскость A — его верх) и куб X 0 ∪ куб X 60 (центр тела X 30, опорная точка — X 0). */
async function scene(): Promise<{ c: string; a: string; b: string; g: string }> {
  const c = await shape('cube', CUBE, at(-80))
  const a = await shape('cube', CUBE, at(0))
  const b = await shape('cube', CUBE, at(60))
  st().selectObjects([a, b], false)
  const g = await newId(() => st().csgBoolean('union'))
  return { c, a, b, g }
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
/** Грань объекта (первый треугольник, нормаль которого принимает `accept`): индекс, мировые нормаль и точка. */
function face(id: string, accept: (n: THREE.Vector3) => boolean) {
  const o = st().objects[id]
  const k = Array.from({ length: o.indices.length / 3 }, (_, i) => i).find((i) => accept(triNormal(worldTri(o, i))))!
  const n = triNormal(worldTri(o, k)), q = worldTri(o, k)[0]
  return { objectId: id, triangleIndex: k, normal: { x: n.x, y: n.y, z: n.z }, point: { x: q.x, y: q.y, z: q.z } }
}
async function align(a: ReturnType<typeof face> | 'X' | 'Y' | 'Z', ...bs: ReturnType<typeof face>[]) {
  useAlignModeStore.getState().startAlignMode()
  if (bs.length > 1) useAlignModeStore.getState().toggleMultiple()
  if (typeof a === 'string') useAlignModeStore.getState().setPlane({ axis: a })
  else await useAlignModeStore.getState().clickFace(a)
  for (const b of bs) await useAlignModeStore.getState().clickFace(b)
  useAlignModeStore.getState().exitAlignMode()
}
/** Центр мировой рамки объекта. */
const center = (id: string) => {
  const b = computeWorldAABB(st().objects[id])
  return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2]
}
const top = (id: string) => face(id, (n) => n.z > 0.99)
const plusX = (id: string) => face(id, (n) => n.x > 0.9999)

// ════════════════════════════════════════════════════════════
// ✅ 41 — CSG после выравнивания с поворотом
// ════════════════════════════════════════════════════════════

describe('UX-прогон 7 — 41. CSG, повёрнутая выравниванием вокруг центра рамки: дальнейшие действия', () => {
  it('K1: undo / redo без снимков и воспроизведение истории — тот же трансформ и центр тела (X 30, Y 0)', async () => {
    const { c, g } = await scene()
    await align(top(c), plusX(g))
    const live = { ...st().objects[g].transform }
    expect(center(g)[0]).toBeCloseTo(30, 3)
    clearSnapshots()
    await st().undo()
    expect(st().objects[g].transform.x).toBeCloseTo(0, 6)                                 // опорная точка — операнд A
    expect(center(g)[0]).toBeCloseTo(30, 3)
    await st().redo()
    for (const k of ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ'] as const) expect(st().objects[g].transform[k]).toBeCloseTo(live[k], 6)
    clearSnapshots(); clearTree()
    const rebuilt = (await rebuildFromHistory(st().operations.slice(0, st().historyIndex)))[g]
    for (const k of ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ'] as const) expect(rebuilt.transform[k]).toBeCloseTo(live[k], 4)
  })

  it('K2: правка ребёнка (куб B — ширина 20 → 30) — CSG стоит, как стояла: низ и X/Y на месте, растёт вверх', async () => {
    const { c, b, g } = await scene()
    await align(top(c), plusX(g))
    const box0 = computeWorldAABB(st().objects[g])
    await st().editChildParams(g, b, { width: 30, height: 20, depth: 20 })
    const box = computeWorldAABB(st().objects[g])
    expect([box.min.x, box.max.x, box.min.y, box.max.y, box.min.z].map((v) => +v.toFixed(3)))
      .toEqual([box0.min.x, box0.max.x, box0.min.y, box0.max.y, box0.min.z].map((v) => +v.toFixed(3)))
    expect(box.max.z - box0.max.z).toBeCloseTo(5, 3)                                       // куб B — с 50…70 на 45…75
  })

  it('K3 (ALIGN-PLANE-RESOLVE): шаг выравнивания не правится ✎; правка шага move куба C (плоскость A) до него — торец снова в плоскости, центр X/Y на месте', async () => {
    const { c, g } = await scene()
    const fB = plusX(g)
    await align(top(c), fB)
    const alignStep = st().historyIndex - 1
    expect(isStepEditable(st().operations[alignStep])).toBe(false)                          // связь, а не сдвиг
    const c0 = center(g)
    const moveC = st().operations.findIndex((op) => op.type === 'move' && op.ids[0] === c)
    expect(await st().editStepParams(moveC, { kind: 'move', delta: { x: -80, y: 0, z: 5 }, rotDelta: { x: 0, y: 0, z: 0 } })).toBe(true)
    for (const v of worldTri(st().objects[g], fB.triangleIndex)) expect(v.z).toBeCloseTo(15, 3)   // верх C — 15
    const c1 = center(g)
    expect(c1[0]).toBeCloseTo(c0[0], 3)
    expect(c1[1]).toBeCloseTo(c0[1], 3)
    expect(c1[2] - c0[2]).toBeCloseTo(5, 3)
    expect(st().objects[g].transform.rotY).toBeCloseTo(-90, 4)
  })

  it('K4: копия CSG (Ctrl+C/V) и зеркальная копия — центр тела вдоль плоскости на месте', async () => {
    const { c, g } = await scene()
    st().selectObjects([g], false); st().copySelected()
    const k = await newId(() => st().pasteClipboard())
    await st().moveObject(k, { ...st().objects[k].transform, x: 0, y: 60, z: 0 })
    st().selectObjects([g], false)
    const m = await newId(() => st().mirrorSelected('YZ'))
    await st().moveObject(m, { ...st().objects[m].transform, y: -60 })
    for (const id of [k, m]) {
      expect(st().objects[id].shapeType).toBe('csg')
      const c0 = center(id)
      await align(top(c), plusX(id))
      const c1 = center(id)
      expect(c1[0]).toBeCloseTo(c0[0], 3)
      expect(c1[1]).toBeCloseTo(c0[1], 3)
      expect(triNormal(worldTri(st().objects[id], plusX(id).triangleIndex)).x).toBeGreaterThan(0.9999)   // грань осталась своей
    }
  })

  it('K5: вложенный CSG (CSG ∪ сфера) — центр рамки вложенного тела на месте', async () => {
    const { c, g } = await scene()
    const sp = await shape('sphere', { radius: 12, segments: 32 }, at(120))
    st().selectObjects([g, sp], false)
    const g2 = await newId(() => st().csgBoolean('union'))
    const c0 = center(g2)
    expect(c0[0]).toBeCloseTo(61, 3)                                                       // X −10…132
    await align(top(c), plusX(g2))
    const c1 = center(g2)
    expect(c1[0]).toBeCloseTo(c0[0], 3)
    expect(c1[1]).toBeCloseTo(c0[1], 3)
  })
})

describe('UX-прогон 7 — 41. Импорт и текст: центр поворота — опорная точка (центр масс)', () => {
  it('K6: несимметричный импорт (клин) — опорная точка = центр масс, при повороте к боковой плоскости Y/Z на месте', async () => {
    const C = await shape('cube', CUBE, at(-60))
    // клин 40 × 20 × 30: треугольник (0,0) (40,0) (0,20), центр масс X 13,33 / Y 6,67 — не центр рамки (20 / 10)
    const V = [[0, 0, 0], [40, 0, 0], [0, 20, 0], [0, 0, 30], [40, 0, 30], [0, 20, 30]].flat()
    const T = [[0, 2, 1], [3, 4, 5], [0, 1, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 4]].flat()
    const w = await newId(() => st().addRawMesh('клин', V, T))
    const o0 = st().objects[w]
    const lb = computeAABB(o0.vertices)                                                    // вершины — вокруг центра масс
    expect([(lb.min.x + lb.max.x) / 2, (lb.min.y + lb.max.y) / 2, (lb.min.z + lb.max.z) / 2].map((v) => +v.toFixed(2))).toEqual([6.67, 3.33, 0])
    expect(alignRotationCenter(o0)).toEqual({ x: o0.transform.x, y: o0.transform.y, z: o0.transform.z })
    await st().moveObject(w, { ...o0.transform, y: 30 })
    const fA = face(C, (n) => n.x > 0.99)
    const fB = face(w, (n) => n.z > 0.99)
    await align(fA, fB)
    const o = st().objects[w]
    expect([o.transform.y, o.transform.z].map((v) => +v.toFixed(4))).toEqual([30, 15])      // поворот вокруг опорной точки
    for (const v of worldTri(o, fB.triangleIndex)) expect(v.x).toBeCloseTo(-50, 3)        // грань — в плоскости A
  })

  it('K7: текст «Дом» — центр поворота = опорная точка; верхом к боковой плоскости — Y/Z на месте', async () => {
    const C = await shape('cube', CUBE, at(-60))
    const txt = await newId(() => addTextObject('Дом', { size: 10, depth: 2 }))
    await st().moveObject(txt, { ...st().objects[txt].transform, y: 30 })
    const o0 = st().objects[txt]
    expect(alignRotationCenter(o0)).toEqual({ x: o0.transform.x, y: o0.transform.y, z: o0.transform.z })
    await align(face(C, (n) => n.x > 0.99), face(txt, (n) => n.z > 0.9999))
    const o = st().objects[txt]
    expect([o.transform.y, o.transform.z].map((v) => +v.toFixed(4))).toEqual([+o0.transform.y.toFixed(4), +o0.transform.z.toFixed(4)])
    expect(o.transform.rotY).toBeCloseTo(90, 4)
  })
})

// ════════════════════════════════════════════════════════════
// ✅ 42 — углы шага и объекта
// ════════════════════════════════════════════════════════════

describe('UX-прогон 7 — 42. Углы поворота: правка шага, гизмо, накопление, ручной ввод', () => {
  const dir = (deg: number) => new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(deg)), Math.sin(THREE.MathUtils.degToRad(deg)), 0)
  async function rot170(start = 170): Promise<{ k: string; step: number }> {
    const r = await shape('cube', CUBE, { ...at(0), rotZ: 20 })
    const k = await shape('cube', CUBE, { ...at(60), rotZ: start })
    await align(face(r, (n) => n.distanceTo(dir(20)) < 1e-4), face(k, (n) => n.distanceTo(dir(start - 180)) < 1e-4))
    return { k, step: st().historyIndex - 1 }
  }

  it('A1: выравнивание 170 → 200 (шаг 30°); правка поворота куба до выравнивания (170 → 175) — выравнивание пересчитано: снова 200, шаг 25°', async () => {
    const { k, step } = await rot170()
    expect(st().objects[k].transform.rotZ).toBeCloseTo(200, 6)
    expect((lastOp() as AlignOperation).plane!.moves[k].rotDelta.z).toBeCloseTo(30, 6)
    const moveK = st().operations.findIndex((op) => op.type === 'move' && op.ids[0] === k)
    expect(await st().editStepParams(moveK, { kind: 'move', delta: { x: 60, y: 0, z: 0 }, rotDelta: { x: 0, y: 0, z: 175 } })).toBe(true)
    expect(st().objects[k].transform.rotZ).toBeCloseTo(200, 6)                              // грань снова в плоскости A
    const eff = projectHistory(st().operations.slice(0, st().historyIndex))[step] as AlignOperation
    expect(eff.plane!.moves[k].rotDelta.z).toBeCloseTo(25, 6)
    clearSnapshots(); clearTree()
    const rebuilt = (await rebuildFromHistory(st().operations.slice(0, st().historyIndex)))[k]
    expect(rebuilt.transform.rotZ).toBeCloseTo(200, 4)
  })

  it('A2: решение 3 — угол объекта продолжается от прежнего: 350 + 30 → 380, шаг «Выровнять по грани» с поворотом 30°', async () => {
    const { k } = await rot170(350)
    expect(st().objects[k].transform.rotZ).toBeCloseTo(380, 6)
    expect((lastOp() as AlignOperation).plane!.moves[k].rotDelta.z).toBeCloseTo(30, 6)
    expect(opLabel(lastOp(), (key: string, o?: Record<string, unknown>) => i18n.t(key, o))).toBe('Выровнять по грани')
  })

  it('A3: гизмо — rotY 80 повернуть вокруг Y на +40,5° (Three.js отдаёт (180; 59,5; 180)) → (0; 120,5; 0), шаг (0; 40,5; 0)', async () => {
    const k = await shape('cube', CUBE, { ...at(0), rotY: 80 })
    const pivot = new THREE.Object3D()
    pivot.rotation.set(0, THREE.MathUtils.degToRad(80), 0)
    pivot.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(40.5)))
    const gz = { rotX: THREE.MathUtils.radToDeg(pivot.rotation.x), rotY: THREE.MathUtils.radToDeg(pivot.rotation.y), rotZ: THREE.MathUtils.radToDeg(pivot.rotation.z) }
    expect([gz.rotX, gz.rotY, gz.rotZ].map((v) => Math.abs(+v.toFixed(4)))).toEqual([180, 59.5, 180])
    const prev = st().objects[k].transform
    await st().moveObject(k, { ...prev, ...continuousEuler(gz, prev) })                        // App.handleTransformEnd
    const t1 = st().objects[k].transform
    expect([t1.rotX, t1.rotY, t1.rotZ].map((v) => +v.toFixed(4))).toEqual([0, 120.5, 0])
    const op = lastOp() as MoveOperation
    expect([op.rotDelta!.x, op.rotDelta!.y, op.rotDelta!.z].map((v) => +v.toFixed(4))).toEqual([0, 40.5, 0])
  })

  it('A4: ручной ввод 270 — не нормализуется: угол 270, «Исходно» — «поворот (0, 0, 270)°»', async () => {
    const k = await shape('cube', CUBE, at(0))
    await st().moveObject(k, { ...st().objects[k].transform, rotZ: 270 })
    expect(st().objects[k].transform.rotZ).toBe(270)
    useUiStore.setState({ selectedStep: st().historyIndex - 1 })
    const h = mount(<StepPanel />)
    expect(h.querySelector('[data-testid=step-original]')!.textContent!.trim()).toBe('поворот (0, 0, 270)°')
  })
})
