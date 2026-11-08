// ============================================================
// align-plane-resolve.test.ts — ALIGN-PLANE-RESOLVE (реальный WASM)
// ============================================================
// Режим «Выровнять» (ALIGN-UI-REVIT) пишет шаг `align` с плоскостью (`plane`: плоскость A — в
// системе объекта A или ось X/Y/Z, грань B — в системе цели, результат — сдвиг + поворот), а не
// move. Правка прошлого шага (9.5) пересчитывает такой шаг (каскад, `solvePlaneAlignMove`):
// объект остаётся выровненным — не «съезжает» после правки, без уведомлений. Обычный align
// (9 кнопок, ось) — как раньше.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return { ...bridge }
})

import '../__mocks__/indexeddb'
import { _resetMockIndexedDB } from '../__mocks__/indexeddb'
import * as THREE from 'three'
import i18n from '../i18n'
import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { useUiStore } from '../store/ui-store'
import { useAlignModeStore } from '../store/align-mode'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { computeRSMatrix } from '../csg/worker-matrix'
import { rebuildFromHistory, buildRebuildMeta } from '../store/rebuild'
import { projectHistory } from '../store/project-history'
import { isStepEditable } from '../store/edit-step'
import { faceToLocal, faceToWorld, computeWorldAABB } from '../store/helpers'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { opLabel } from '../components/Timeline'
import type { AlignOperation, MoveOperation, SceneObject, ShapeParams, ShapeType, TransformNR, TinkerCraftOperation } from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })
const CUBE = { width: 20, height: 20, depth: 20 }
const t = (key: string, o?: Record<string, unknown>) => i18n.t(key, o)
const warnings = () => useNotifications.getState().notifications.filter((n) => n.type === 'warning' || n.type === 'error')
const COS1 = Math.cos(THREE.MathUtils.degToRad(1))

beforeEach(async () => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, modified: false, clipboard: [], clearedDocument: null })
  useNotifications.setState({ notifications: [] })
  useUiStore.setState({ expandedTreeIds: {}, selectedChild: null, selectedStep: null })
  useAlignModeStore.setState({ alignMode: null })
  clearSnapshots(); clearTree(); _resetMockIndexedDB()
  await i18n.changeLanguage('ru')
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
/** Грань объекта (первый треугольник с нормалью `accept`): индекс, мировые нормаль и точка. */
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
const dir = (deg: number) => new THREE.Vector3(Math.cos(THREE.MathUtils.degToRad(deg)), Math.sin(THREE.MathUtils.degToRad(deg)), 0)
/** Индекс шага move объекта `id` (первого). */
const moveStepOf = (id: string) => st().operations.findIndex((op) => op.type === 'move' && op.ids[0] === id)
/** Правка шага move объекта `id` (shape(): появление → move): после шага объект в `to`. */
const editMove = (id: string, to: TransformNR) => {
  const k = moveStepOf(id)
  const before = buildRebuildMeta(st().operations.slice(0, k)).meta[id].transform     // до шага — место появления
  return st().editStepParams(k, {
    kind: 'move',
    delta: { x: to.x - before.x, y: to.y - before.y, z: to.z - before.z },
    rotDelta: { x: to.rotX - before.rotX, y: to.rotY - before.rotY, z: to.rotZ - before.rotZ },
  })
}
const sameTr = (a: TransformNR, b: TransformNR, d = 6) => {
  for (const k of ['x', 'y', 'z', 'rotX', 'rotY', 'rotZ', 'scaleX', 'scaleY', 'scaleZ'] as const) expect(a[k], k).toBeCloseTo(b[k], d)
}

describe('ALIGN-PLANE-RESOLVE — режим «Выровнять» пишет шаг align с плоскостью', () => {
  it('1. грань A (верх куба) → нижняя грань B: шаг align (не move) — плоскость в системе A, грань — в системе B, результат — сдвиг', async () => {
    const a = await shape('cube', CUBE, at(0))
    const b = await shape('cube', CUBE, at(40, 0, 30))
    const n = st().operations.length
    await align(face(a, (v) => v.z > 0.99), face(b, (v) => v.z < -0.99))
    expect(st().operations).toHaveLength(n + 1)
    const op = st().operations[n] as AlignOperation
    expect([op.type, op.ids, op.anchorId, op.axis]).toEqual(['align', [b], a, 'Z'])
    expect(op.deltas).toEqual({})
    expect(op.plane!.normal.z).toBeCloseTo(1, 9)                                          // верх A в системе A
    expect(op.plane!.point.z).toBeCloseTo(10, 9)
    expect(op.plane!.faces[b].normal.z).toBeCloseTo(-1, 9)                               // низ B в системе B
    expect(op.plane!.moves[b].delta.z).toBeCloseTo(-10, 6)                               // низ B (Z 20) → Z 10
    expect(st().objects[b].transform.z).toBeCloseTo(20, 6)
    expect(opLabel(op, t)).toBe('Выровнять по грани')
    expect(isStepEditable(op)).toBe(false)                                                // ✎ нет — как у обычного align
    expect(warnings()).toHaveLength(0)
    sameTr((await rebuildFromHistory(st().operations))[b].transform, st().objects[b].transform)   // живое = воспроизведение
  })

  it('2. плоскость по оси (Y) — без якоря, подпись «Выровнять по плоскости XZ»', async () => {
    const b = await shape('cube', CUBE, at(0, 40))
    await align('Y', face(b, (v) => v.y < -0.99))
    const op = st().operations.at(-1) as AlignOperation
    expect([op.type, op.anchorId]).toEqual(['align', ''])
    expect(opLabel(op, t)).toBe('Выровнять по плоскости XZ')
    expect(st().objects[b].transform.y).toBeCloseTo(10, 6)
  })

  it('3. faceToLocal / faceToWorld — обратные (поворот, неравномерный масштаб)', () => {
    const tr: TransformNR = { x: 3, y: -7, z: 11, rotX: 20, rotY: -35, rotZ: 70, scaleX: 2, scaleY: 0.5, scaleZ: 1.5 }
    const n = new THREE.Vector3(0.3, -0.5, 0.8).normalize()
    const p = { x: 9, y: 4, z: -2 }
    const l = faceToLocal(tr, { x: n.x, y: n.y, z: n.z }, p)
    const w = faceToWorld(tr, l.normal, l.point)
    expect([w.point.x, w.point.y, w.point.z].map((v) => +v.toFixed(9))).toEqual([p.x, p.y, p.z])
    expect([w.normal.x, w.normal.y, w.normal.z].map((v) => +v.toFixed(9))).toEqual([n.x, n.y, n.z].map((v) => +v.toFixed(9)))
  })
})

describe('ALIGN-PLANE-RESOLVE — правка прошлого шага пересчитывает выравнивание (объект не съезжает)', () => {
  it('4. правка move A (якоря) до выравнивания: A выше на 7 → B снова стоит на A; без уведомлений', async () => {
    const a = await shape('cube', CUBE, at(0, 5))
    const b = await shape('cube', CUBE, at(40, 0, 30))
    await align(face(a, (v) => v.z > 0.99), face(b, (v) => v.z < -0.99))
    expect(await editMove(a, at(0, 5, 7))).toBe(true)
    expect(computeWorldAABB(st().objects[a]).max.z).toBeCloseTo(17, 6)
    expect(computeWorldAABB(st().objects[b]).min.z).toBeCloseTo(17, 6)                   // стоит на A
    expect([st().objects[b].transform.x, st().objects[b].transform.y]).toEqual([40, 0])  // X/Y — свои
    expect(warnings()).toHaveLength(0)
    const eff = projectHistory(st().operations)
    const al = eff.find((op) => op.type === 'align') as AlignOperation
    expect(al.plane!.moves[b].delta.z).toBeCloseTo(-3, 6)                                 // пересчитано: 30 → 27
  })

  it('5. правка move B (цели) до выравнивания: B выше и правее → снова на A, сдвиг вдоль плоскости сохранён', async () => {
    const a = await shape('cube', CUBE, at(0, 5))
    const b = await shape('cube', CUBE, at(40, 0, 30))
    await align(face(a, (v) => v.z > 0.99), face(b, (v) => v.z < -0.99))
    expect(await editMove(b, at(55, 5, 80))).toBe(true)
    const o = st().objects[b]
    expect([o.transform.x, o.transform.y]).toEqual([55, 5])                               // вдоль плоскости — правка
    expect(computeWorldAABB(o).min.z).toBeCloseTo(10, 6)                                 // поперёк — выравнивание
  })

  it('6. с поворотом (UX-AUDIT-32): призма боковой гранью к верху куба; куб выше на 5 → грань призмы в Z 15, поворот прежний', async () => {
    const cube = await shape('cube', CUBE, at(0, 5))
    const prism = await shape('prism', undefined, at(40))
    const fB = face(prism, (v) => Math.abs(v.z) < 0.01)
    await align(face(cube, (v) => v.z > 0.99), fB)
    const r0 = { ...st().objects[prism].transform }
    expect(Math.max(Math.abs(r0.rotX), Math.abs(r0.rotY))).toBeGreaterThan(89.9)          // повёрнута
    expect(await editMove(cube, at(0, 5, 5))).toBe(true)
    const o = st().objects[prism]
    for (const v of worldTri(o, fB.triangleIndex)) expect(v.z).toBeCloseTo(15, 3)
    expect(triNormal(worldTri(o, fB.triangleIndex)).z).toBeGreaterThan(COS1)
    expect([o.transform.rotX, o.transform.rotY, o.transform.rotZ]).toEqual([r0.rotX, r0.rotY, r0.rotZ].map((v) => expect.closeTo(v, 6)))
    expect([o.transform.x, o.transform.y]).toEqual([r0.x, r0.y].map((v) => expect.closeTo(v, 6)))   // на месте
  })

  it('7. правка поворота A до выравнивания (rotZ 0 → 30): плоскость A повернулась — B доворачивается к ней', async () => {
    const a = await shape('cube', CUBE, at(0, 5))
    const b = await shape('cube', CUBE, at(60))
    const fB = face(b, (v) => v.x < -0.99)
    await align(face(a, (v) => v.x > 0.99), fB)                                           // параллельна: только сдвиг
    expect(computeWorldAABB(st().objects[b]).min.x).toBeCloseTo(10, 6)
    expect(await editMove(a, at(0, 5, 0, { rotZ: 30 }))).toBe(true)
    const o = st().objects[b]
    const nB = triNormal(worldTri(o, fB.triangleIndex))
    expect(nB.dot(dir(30))).toBeLessThan(-COS1)                                           // грань B встречна новой нормали A
    for (const v of worldTri(o, fB.triangleIndex)) expect(v.dot(dir(30))).toBeCloseTo(12.5, 3) // в плоскости A: 10 + 5·sin 30°
  })

  it('8. ось (плоскость XZ): правка move B — снова на плоскости Y 0', async () => {
    const b = await shape('cube', CUBE, at(0, 40))
    await align('Y', face(b, (v) => v.y < -0.99))
    expect(await editMove(b, at(15, 70, 3))).toBe(true)
    const o = st().objects[b]
    expect([o.transform.x, o.transform.z]).toEqual([15, 3])
    expect(computeWorldAABB(o).min.y).toBeCloseTo(0, 6)
  })

  it('9. «Множественное»: два шага align; правка A — обе цели снова на A', async () => {
    const a = await shape('cube', { width: 60, height: 60, depth: 20 }, at(0, 5))
    const b1 = await shape('cube', CUBE, at(-15, 0, 40))
    const b2 = await shape('sphere', { radius: 8, segments: 32 }, at(15, 0, 50))
    await align(face(a, (v) => v.z > 0.99), face(b1, (v) => v.z < -0.99), face(b2, (v) => v.z < -0.5))
    expect(st().operations.slice(-2).map((op) => op.type)).toEqual(['align', 'align'])
    expect(await editMove(a, at(0, 5, -4))).toBe(true)
    expect(computeWorldAABB(st().objects[b1]).min.z).toBeCloseTo(6, 4)
    expect(computeWorldAABB(st().objects[b2]).min.z).toBeCloseTo(6, 4)                    // сфера — касанием (гладкая)
  })

  it('10. каскад через CSG: B выровнен, потом B ∪ C; правка A — B снова на A, CSG пересчитан', async () => {
    const a = await shape('cube', CUBE, at(0, 5))
    const b = await shape('cube', CUBE, at(40, 0, 30))
    await align(face(a, (v) => v.z > 0.99), face(b, (v) => v.z < -0.99))
    const c = await shape('cube', CUBE, at(55, 0, 20))
    st().selectObjects([b, c], false)
    const g = await newId(() => st().csgBoolean('union'))
    expect(computeWorldAABB(st().objects[g]).min.z).toBeCloseTo(10, 4)
    expect(await editMove(a, at(0, 5, 6))).toBe(true)
    expect(computeWorldAABB(st().objects[g]).min.z).toBeCloseTo(10, 4)                   // C (Z 10…30) — низ CSG по-прежнему
    const live = st().objects[g]
    clearSnapshots(); clearTree()
    const rebuilt = (await rebuildFromHistory(st().operations))[g]
    sameTr(rebuilt.transform, live.transform, 4)
    // низ B — на верху A (Z 16): у объединения на высоте Z 16 есть вершины B над A
    const bz = computeWorldAABB({ ...live, vertices: live.vertices }).max.z
    expect(bz).toBeCloseTo(36, 4)                                                         // верх B: 16 + 20
  })
})

describe('ALIGN-PLANE-RESOLVE — undo / redo, .3dtc, обычный align', () => {
  it('11. undo правки — прежнее выравнивание; redo — пересчитанное; без снимков — то же', async () => {
    const a = await shape('cube', CUBE, at(0, 5))
    const b = await shape('cube', CUBE, at(40, 0, 30))
    await align(face(a, (v) => v.z > 0.99), face(b, (v) => v.z < -0.99))
    await editMove(a, at(0, 5, 7))
    const zEdited = st().objects[b].transform.z
    expect(zEdited).toBeCloseTo(27, 6)
    await st().undo()
    expect(st().objects[b].transform.z).toBeCloseTo(20, 6)
    await st().redo()
    expect(st().objects[b].transform.z).toBeCloseTo(27, 6)
    clearSnapshots(); clearTree()
    await st().undo(); await st().redo()
    expect(st().objects[b].transform.z).toBeCloseTo(27, 6)
  })

  it('12. .3dtc: шаг align с плоскостью и правка — сохранить → открыть → то же; правка после открытия пересчитывает', async () => {
    const cube = await shape('cube', CUBE, at(0, 5))
    const prism = await shape('prism', undefined, at(40))
    const fB = face(prism, (v) => Math.abs(v.z) < 0.01)
    await align(face(cube, (v) => v.z > 0.99), fB)
    await editMove(cube, at(0, 5, 5))
    const live = { ...st().objects[prism].transform }
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0 }); clearSnapshots(); clearTree()
    const ops = (await parse3dtc(blob)).operations as TinkerCraftOperation[]
    const al = ops.find((op) => op.type === 'align') as AlignOperation
    expect(al.plane!.faces[prism]).toBeDefined()
    const objects = await rebuildFromHistory(ops)
    sameTr(objects[prism].transform, live, 4)
    useDocumentStore.setState({ operations: ops, historyIndex: ops.length, objects })
    // ещё одна правка того же шага после открытия — выравнивание снова пересчитано
    expect(await editMove(cube, at(0, 5, -3))).toBe(true)
    for (const v of worldTri(st().objects[prism], fB.triangleIndex)) expect(v.z).toBeCloseTo(7, 3)
  })

  it('13. обычный align (кнопки, ось Z max) — как раньше: шаг без plane, правка якоря — re-solve по рамке', async () => {
    const a = await shape('cube', CUBE, at(0, 5))
    const b = await shape('cube', CUBE, at(40, 0, 30))
    st().selectObjects([b, a], false)                                                     // якорь — последний
    await st().alignSelected('Z', 'max')
    const op = st().operations.at(-1) as AlignOperation
    expect([op.type, op.plane, op.anchorId]).toEqual(['align', undefined, a])
    expect(op.deltas[b]).toBeCloseTo(-30, 6)
    expect(opLabel(op, t)).toBe('Выровнять Z → max')
    expect(await editMove(a, at(0, 5, 4))).toBe(true)
    expect(computeWorldAABB(st().objects[b]).max.z).toBeCloseTo(14, 6)
  })

  it('14. поворот полем и перемещение — по-прежнему move (режим «Выровнять» их не меняет)', async () => {
    const k = await shape('cube', CUBE, at(0))
    await st().moveObject(k, { ...st().objects[k].transform, rotZ: 30 })
    const op = st().operations.at(-1) as MoveOperation
    expect([op.type, op.kind]).toEqual(['move', 'rotate'])
    expect(isStepEditable(op)).toBe(true)
  })
})
