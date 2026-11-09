// ============================================================
// n-ary-csg.test.ts — N-ARY-CSG: union N, subtract/intersect A vs B, плоское дерево
// ============================================================
// Реальный WASM (worker-bridge). UX-ожидания:
//   - union: выбрал 10 → ОДИН CSG, 10 детей (плоский список, без вложенности);
//   - subtract/intersect: группа A (5) против группы B (5) → ОДИН CSG, A и B — группы детей
//     (union(A) op union(B));
//   - правка ребёнка (9.2/9.3) — ребёнок из плоского списка; каскад 9.5 — N операндов;
//   - undo/redo, .3dtc; мягкий лимит 30 (предупреждение, не блокирует);
//   - старые бинарные `[a, b]` — как раньше.
// Эталон правок — «свежий» сценарий с новым параметром с самого начала.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerBuildImportedMesh: bridge.workerBuildImportedMesh,
    workerSyncObjects: bridge.workerSyncObjects,
    workerSyncMesh: bridge.workerSyncMesh,
    workerCsgBoolean: bridge.workerCsgBoolean,
    workerCsgBooleanWithSync: bridge.workerCsgBooleanWithSync,
    workerCsgBooleanMulti: bridge.workerCsgBooleanMulti,
    workerMirrorObject: bridge.workerMirrorObject,
    workerRebuildScene: bridge.workerRebuildScene,
    workerDeleteObjects: bridge.workerDeleteObjects,
    workerClearAll: bridge.workerClearAll,
    workerRebuildNode: bridge.workerRebuildNode,
    isWorkerReady: bridge.isWorkerReady,
    disposeWorker: bridge.disposeWorker,
  }
})

import { useDocumentStore } from '../store/document-store'
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, getNode } from '../csg/history-tree'
import { getTreeView, viewGroupSplit } from '../csg/tree-view'
import { computeRSMatrix } from '../csg/worker-matrix'
import { meshVolume, checkChildEditable, checkRootConsistency } from '../store/edit-child'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { resolveCsgOperands, aliveGroups, type CsgGroups } from '../store/csg-operands'
import { clampGroupA } from '../csg/worker-handlers'
import { CSG_SOFT_LIMIT } from '../constants'
import i18n from '../i18n'
import type {
  SceneObject, ShapeParams, ShapeType, TransformNR, TinkerCraftOperation, GroupOperation, MoveOperation,
  StepPatch, EditStepOperation,
} from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })
const warnings = () => useNotifications.getState().notifications.filter((n) => n.type === 'warning' || n.type === 'error')

function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false, clipboard: [] })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
}
beforeEach(reset)

/** world = pos + R·S·v */
function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ }, { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
  )
  const out = new Float32Array(obj.vertices.length)
  for (let i = 0; i < out.length; i += 3) {
    const x = obj.vertices[i], y = obj.vertices[i + 1], z = obj.vertices[i + 2]
    out[i] = r00 * x + r01 * y + r02 * z + t.x
    out[i + 1] = r10 * x + r11 * y + r12 * z + t.y
    out[i + 2] = r20 * x + r21 * y + r22 * z + t.z
  }
  return out
}
function box(v: Float32Array): number[] {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) }
  return [...mn, ...mx]
}
const volume = (o: SceneObject) => meshVolume(worldVerts(o), o.indices)
/** Тот же мировой меш: габарит (1e-4) и объём (1e-5 отн.). */
function expectSameWorld(a: SceneObject, b: SceneObject): void {
  const ba = box(worldVerts(a)), bb = box(worldVerts(b))
  for (let i = 0; i < 6; i++) expect(Math.abs(ba[i] - bb[i])).toBeLessThan(1e-4)
  expect(Math.abs(volume(a) - volume(b)) / volume(b)).toBeLessThan(1e-5)
}

async function shape(type: ShapeType, params: ShapeParams, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape(type, params)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}
async function csgOf(ids: string[], op: 'union' | 'subtract' | 'intersect', groups?: CsgGroups): Promise<string> {
  st().selectObjects(ids, false)
  const n = Object.keys(st().objects).length
  await st().csgBoolean(op, groups)
  expect(Object.keys(st().objects).length).toBe(n - ids.length + 1)
  return st().selectedIds[0]
}
const cube = (s: number, h = s) => ({ width: s, height: s, depth: h })
const csgArgs = (rootId: string) => ({ rootId, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex })

/** 10 разнесённых кубов 10³ (5 мм зазор): union = сумма объёмов. `w4` — ширина 5-го. */
async function tenCubes(w4 = 10): Promise<string[]> {
  const ids: string[] = []
  for (let i = 0; i < 10; i++) ids.push(await shape('cube', i === 4 ? { width: w4, height: 10, depth: 10 } : cube(10), at(i * 15, 5)))
  return ids
}

/**
 * A — 5 кубов 20³ по X (шаг 30); B — 5 столбиков 10×10×30 по центрам A (сквозные отверстия).
 * subtract: 5·(8000 − 10·10·20) = 30000. `bW` — ширина столбика B[2].
 */
async function fiveVsFive(bW = 10, bDx = 0): Promise<{ a: string[]; b: string[] }> {
  const a: string[] = [], b: string[] = []
  for (let i = 0; i < 5; i++) a.push(await shape('cube', cube(20), at(i * 30, 5)))
  for (let i = 0; i < 5; i++) {
    b.push(await shape('cube', i === 2 ? { width: bW, height: 10, depth: 30 } : cube(10, 30), at(i * 30 + (i === 2 ? bDx : 0), 5)))
  }
  return { a, b }
}

describe('N-ARY-CSG — union N', () => {
  it('union 10 → ОДИН CSG, 10 детей; объём = сумма; без уведомлений', async () => {
    const ids = await tenCubes()
    const root = await csgOf(ids, 'union')
    expect(warnings()).toEqual([])
    expect(Object.keys(st().objects)).toEqual([root])
    const obj = st().objects[root]
    expect(obj.shapeType).toBe('csg')
    expect(obj.children).toEqual(ids)
    expect(Math.abs(volume(obj) - 10 * 1000)).toBeLessThan(1e-3)
    const g = st().operations.at(-1) as GroupOperation
    expect(g.type).toBe('group')
    expect(g.ids).toEqual(ids)
    expect(g.groupA).toBeUndefined()                                   // union — без групп
    expect(st().operations.filter((o) => o.type === 'group')).toHaveLength(1)  // не 9 бинарных шагов
  })

  it('дерево плоское: один boolean-узел, 10 детей-примитивов, вложенных boolean нет', async () => {
    const ids = await tenCubes()
    const root = await csgOf(ids, 'union')
    const node = getNode(root)!
    expect(node.type).toBe('boolean')
    expect(node.operation).toBe('union')
    expect(node.children).toEqual(ids)
    for (const id of ids) {
      expect(getNode(id)?.type).toBe('primitive')
      expect(getNode(id)?.parentId).toBe(root)
    }
    const view = getTreeView(root)!
    expect(view.children.map((c) => c.id)).toEqual(ids)
    expect(view.children.every((c) => c.type === 'primitive' && c.children.length === 0)).toBe(true)
    expect(viewGroupSplit(view)).toBeNull()                            // union — без заголовков групп
    expect(await checkRootConsistency(csgArgs(root))).toBeNull()       // дерево = меш (замков нет)
  })
})

describe('N-ARY-CSG — subtract / intersect: группа A против группы B', () => {
  it('subtract A(5) − B(5) → ОДИН CSG, 10 детей, группа A = 5; объём 30000', async () => {
    const { a, b } = await fiveVsFive()
    const root = await csgOf([...a, ...b], 'subtract', { a, b })
    expect(warnings()).toEqual([])
    const obj = st().objects[root]
    expect(obj.children).toEqual([...a, ...b])
    expect(Math.abs(volume(obj) - 30000)).toBeLessThan(1e-2)
    const g = st().operations.at(-1) as GroupOperation
    expect(g.treeOperation).toBe('subtract')
    expect(g.ids).toEqual([...a, ...b])
    expect(g.groupA).toBe(5)
    const node = getNode(root)!
    expect(node.children).toEqual([...a, ...b])
    expect(node.groupA).toBe(5)
    const view = getTreeView(root)!
    expect(viewGroupSplit(view)).toBe(5)                               // «Группа A» — 5, «Группа B» — 5
    expect(view.children).toHaveLength(10)
    expect(await checkRootConsistency(csgArgs(root))).toBeNull()
  })

  it('intersect A(5) ∩ B(5) = union(A) ∩ union(B), не цепочка a1 ∩ a2 ∩ …', async () => {
    // A — 5 кубов 20³ (шаг 30), B — те же кубы со сдвигом 10 по X: пары перекрываются 10×20×20
    const a: string[] = [], b: string[] = []
    for (let i = 0; i < 5; i++) a.push(await shape('cube', cube(20), at(i * 30, 5)))
    for (let i = 0; i < 5; i++) b.push(await shape('cube', cube(20), at(i * 30 + 10, 5)))
    const root = await csgOf([...a, ...b], 'intersect', { a, b })
    expect(warnings()).toEqual([])
    expect(Math.abs(volume(st().objects[root]) - 5 * 4000)).toBeLessThan(1e-2)
    expect((st().operations.at(-1) as GroupOperation).groupA).toBe(5)
    expect(getNode(root)?.groupA).toBe(5)
  })

  it('без групп: 3 выбранных, вычитание — первый против остальных (без уведомлений «нельзя»)', async () => {
    const big = await shape('cube', cube(30), at(0, 5))
    const h1 = await shape('cube', cube(10, 40), at(-8, 5))
    const h2 = await shape('cube', cube(10, 40), at(8, 5))
    const root = await csgOf([big, h1, h2], 'subtract')
    expect(warnings()).toEqual([])
    expect(Math.abs(volume(st().objects[root]) - (27000 - 2 * 100 * 30))).toBeLessThan(1e-2)
    const g = st().operations.at(-1) as GroupOperation
    expect(g.ids).toEqual([big, h1, h2])
    expect(g.groupA).toBeUndefined()                                   // группа A = 1 — поле не пишется
  })

  it('задана только группа A — группа B = текущее выделение', async () => {
    const { a, b } = await fiveVsFive()
    st().selectObjects(b, false)                                        // выделены объекты B
    await st().csgBoolean('subtract', { a, b: [] })
    const root = st().selectedIds[0]
    expect(Object.keys(st().objects)).toEqual([root])
    expect(Math.abs(volume(st().objects[root]) - 30000)).toBeLessThan(1e-2)
    expect(st().objects[root].children).toEqual([...a, ...b])
  })
})

describe('N-ARY-CSG — правка ребёнка (9.2/9.3) из плоского списка', () => {
  it('union 10: правка ширины 5-го куба = свежий сценарий; без уведомлений', async () => {
    const freshId = await csgOf(await tenCubes(14), 'union')
    const fresh = st().objects[freshId]
    reset()
    const ids = await tenCubes()
    const root = await csgOf(ids, 'union')
    expect(await checkChildEditable({ ...csgArgs(root), nodeId: ids[4] })).toBeNull()
    const n = st().operations.length
    await st().editChildParams(root, ids[4], { width: 14 })
    expect(warnings()).toEqual([])
    expect(st().operations).toHaveLength(n + 1)
    expect(st().operations[n].type).toBe('edit_child_params')
    expect(getNode(ids[4])?.params?.width).toBe(14)
    expectSameWorld(st().objects[root], fresh)
    expect(st().objects[root].transform).toEqual(fresh.transform)    // pivot = первый операнд
  })

  it('subtract 5 vs 5: правка ребёнка группы B (ширина столбика) = свежий сценарий', async () => {
    const f = await fiveVsFive(14)
    const freshId = await csgOf([...f.a, ...f.b], 'subtract', f)
    const fresh = st().objects[freshId]
    reset()
    const s = await fiveVsFive()
    const root = await csgOf([...s.a, ...s.b], 'subtract', s)
    await st().editChildParams(root, s.b[2], { width: 14 })
    expect(warnings()).toEqual([])
    expectSameWorld(st().objects[root], fresh)
    expect(getNode(root)?.groupA).toBe(5)                              // граница групп не съехала
  })
})

/** Индекс шага move объекта `id` (ставит его на место после создания). */
const moveIdxOf = (id: string) =>
  st().operations.findIndex((o) => o.type === 'move' && o.ids.length === 1 && o.ids[0] === id)
function shiftedX(idx: number, dx: number): StepPatch {
  const m = st().operations[idx] as MoveOperation
  return { kind: 'move', delta: { x: m.delta.x + dx, y: m.delta.y, z: m.delta.z } }
}

describe('N-ARY-CSG — каскад 9.5 (N операндов)', () => {
  it('union 10: правка шага move 5-го куба до объединения → CSG пересчитан = свежий сценарий', async () => {
    // свежий: 5-й куб на 3 мм правее
    const fIds: string[] = []
    for (let i = 0; i < 10; i++) fIds.push(await shape('cube', cube(10), at(i * 15 + (i === 4 ? 3 : 0), 5)))
    const freshId = await csgOf(fIds, 'union')
    const fresh = st().objects[freshId]
    reset()
    const ids = await tenCubes()
    const root = await csgOf(ids, 'union')
    const idx = moveIdxOf(ids[4])
    expect(await st().editStepParams(idx, shiftedX(idx, 3))).toBe(true)
    expect(warnings()).toEqual([])
    const e = st().operations.at(-1) as EditStepOperation
    expect(e.type).toBe('edit_step')
    expect(e.replacements.some((r) => r.kind === 'group')).toBe(true)
    expectSameWorld(st().objects[root], fresh)
  })

  it('subtract 5 vs 5: правка шага move столбика B до вычитания = свежий; группы прежние', async () => {
    const f = await fiveVsFive(10, 4)
    const freshId = await csgOf([...f.a, ...f.b], 'subtract', f)
    const fresh = st().objects[freshId]
    reset()
    const s = await fiveVsFive()
    const root = await csgOf([...s.a, ...s.b], 'subtract', s)
    const idx = moveIdxOf(s.b[2])
    expect(await st().editStepParams(idx, shiftedX(idx, 4))).toBe(true)
    expect(warnings()).toEqual([])
    expectSameWorld(st().objects[root], fresh)
    expect(getNode(root)?.children).toEqual([...s.a, ...s.b])          // дети — источник истины — дерево
    expect(getNode(root)?.groupA).toBe(5)
    expect((st().operations.find((o) => o.type === 'group') as GroupOperation).groupA).toBe(5)
  })
})

describe('N-ARY-CSG — undo / redo', () => {
  it('undo → 10 объектов; redo → один CSG; перемотка без снимков — тот же меш и плоское дерево', async () => {
    const { a, b } = await fiveVsFive()
    const root = await csgOf([...a, ...b], 'subtract', { a, b })
    const made = st().objects[root]
    await st().undo()
    expect(Object.keys(st().objects).sort()).toEqual([...a, ...b].sort())
    await st().redo()
    expect(Object.keys(st().objects)).toEqual([root])
    expectSameWorld(st().objects[root], made)
    // без кэша снимков — воспроизведение истории (воркер rebuildScene + дерево)
    clearSnapshots()
    const end = st().operations.length
    await st().jumpToHistory(end - 1)
    expect(Object.keys(st().objects)).toHaveLength(10)
    await st().jumpToHistory(end)
    expectSameWorld(st().objects[root], made)
    expect(getNode(root)?.children).toEqual([...a, ...b])
    expect(getNode(root)?.groupA).toBe(5)
    expect(await checkRootConsistency(csgArgs(root))).toBeNull()
  })
})

describe('N-ARY-CSG — .3dtc round-trip', () => {
  it('subtract 5 vs 5 → .3dtc → загрузка: ids, groupA, плоское дерево; ребёнок правится', async () => {
    const { a, b } = await fiveVsFive()
    const root = await csgOf([...a, ...b], 'subtract', { a, b })
    const made = st().objects[root]
    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    reset()
    const ops = (await parse3dtc(blob)).operations as TinkerCraftOperation[]
    const g = ops.find((o) => o.type === 'group') as GroupOperation
    expect(g.ids).toEqual([...a, ...b])
    expect(g.groupA).toBe(5)
    const objects = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, objects)
    useDocumentStore.setState({ operations: ops, historyIndex: ops.length, objects })
    expectSameWorld(objects[root], made)
    expect(getNode(root)?.children).toEqual([...a, ...b])
    expect(getNode(root)?.groupA).toBe(5)
    expect(await checkRootConsistency(csgArgs(root))).toBeNull()
    await st().editChildParams(root, b[2], { width: 14 })
    expect(warnings()).toEqual([])
    expect(st().operations.at(-1)?.type).toBe('edit_child_params')
  })
})

describe('N-ARY-CSG — независимые копии (зеркало, вставка)', () => {
  it('зеркало и Ctrl+C/V вычитания 5 vs 5: группы и плоские дети в дереве копии, дерево = меш, ребёнок копии правится', async () => {
    const { a, b } = await fiveVsFive()
    const root = await csgOf([...a, ...b], 'subtract', { a, b })
    const orig = st().objects[root]
    // зеркало
    st().selectObjects([root], false)
    await st().mirrorSelected('YZ')
    const mirror = (st().operations.at(-1) as { ids: string[] }).ids[0]
    expect(getNode(mirror)?.children).toHaveLength(10)
    expect(getNode(mirror)?.groupA).toBe(5)
    expect(Math.abs(volume(st().objects[mirror]) - volume(orig)) / volume(orig)).toBeLessThan(1e-5)
    expect(await checkRootConsistency(csgArgs(mirror))).toBeNull()
    // вставка
    st().selectObjects([root], false)
    st().copySelected()
    await st().pasteClipboard()
    const copy = st().selectedIds[0]
    expect(getNode(copy)?.children).toHaveLength(10)
    expect(getNode(copy)?.groupA).toBe(5)
    expect(await checkRootConsistency(csgArgs(copy))).toBeNull()
    // правка ребёнка группы B копии не трогает оригинал
    await st().editChildParams(copy, `${copy}:${b[2]}`, { width: 14 })
    expect(warnings()).toEqual([])
    expectSameWorld(st().objects[root], orig)
    expect(Math.abs(volume(st().objects[copy]) - (30000 - 4 * 10 * 20))).toBeLessThan(1e-2)  // отверстие 14×10 вместо 10×10
    // перестройка дерева по истории (как после загрузки): копии — с группами
    clearTree()
    rebuildBuildTree(st().operations, st().objects)
    expect(getNode(mirror)?.groupA).toBe(5)
    expect(getNode(copy)?.groupA).toBe(5)
    expect(await checkRootConsistency(csgArgs(copy))).toBeNull()
  })
})

describe(`N-ARY-CSG — мягкий лимит ${CSG_SOFT_LIMIT}`, () => {
  async function row(n: number): Promise<string[]> {
    const ids: string[] = []
    for (let i = 0; i < n; i++) ids.push(await shape('cube', cube(4), at(i * 6, 5)))
    return ids
  }

  it(`${CSG_SOFT_LIMIT + 1} объект → предупреждение «разбейте», CSG всё равно создан`, async () => {
    const ids = await row(CSG_SOFT_LIMIT + 1)
    const root = await csgOf(ids, 'union')
    const w = warnings()
    expect(w).toHaveLength(1)
    expect(w[0].type).toBe('warning')
    expect(w[0].message).toBe(i18n.t('errors.csgTooMany', { count: CSG_SOFT_LIMIT + 1, limit: CSG_SOFT_LIMIT }))
    expect(st().objects[root].children).toHaveLength(CSG_SOFT_LIMIT + 1)
    expect(Math.abs(volume(st().objects[root]) - (CSG_SOFT_LIMIT + 1) * 64)).toBeLessThan(1e-2)
  })

  it(`ровно ${CSG_SOFT_LIMIT} → без предупреждения`, async () => {
    const root = await csgOf(await row(CSG_SOFT_LIMIT), 'union')
    expect(warnings()).toEqual([])
    expect(st().objects[root].children).toHaveLength(CSG_SOFT_LIMIT)
  })
})

describe('N-ARY-CSG — старые бинарные совместимы', () => {
  it('2 выбранных: шаг ids [a, b] без groupA, узел [a, b] — как раньше', async () => {
    const a = await shape('cube', cube(20), at(0, 5))
    const b = await shape('cube', cube(10, 30), at(0, 5))
    const root = await csgOf([a, b], 'subtract')
    const g = st().operations.at(-1) as GroupOperation
    expect(g.ids).toEqual([a, b])
    expect('groupA' in g).toBe(false)
    expect(getNode(root)?.children).toEqual([a, b])
    expect('groupA' in getNode(root)!).toBe(false)
    expect(viewGroupSplit(getTreeView(root)!)).toBeNull()             // в дереве — без заголовков групп
    expect(Math.abs(volume(st().objects[root]) - (8000 - 2000))).toBeLessThan(1e-2)
  })

  it('старый документ: group [a, b] без groupA воспроизводится как a − b', async () => {
    const a = await shape('cube', cube(20), at(0, 5))
    const b = await shape('cube', cube(10, 30), at(0, 5))
    const root = await csgOf([a, b], 'subtract')
    const made = st().objects[root]
    const ops = st().operations.map((o) => ({ ...o })) as TinkerCraftOperation[]
    reset()
    const objects = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, objects)
    useDocumentStore.setState({ operations: ops, historyIndex: ops.length, objects })
    expectSameWorld(objects[root], made)
    expect(getNode(root)?.children).toEqual([a, b])
    expect(await checkRootConsistency(csgArgs(root))).toBeNull()
  })
})

describe('resolveCsgOperands / группы', () => {
  const NO_GROUPS: CsgGroups = { a: [], b: [] }
  const objs = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, { id } as SceneObject]))
  const all = objs(['a1', 'a2', 'b1', 'b2', 'c'])

  it('без групп: < 2 выбранных — null; иначе первый против остальных', () => {
    expect(resolveCsgOperands(['a1'], NO_GROUPS, all)).toBeNull()
    expect(resolveCsgOperands(['a1', 'b1', 'b2'], NO_GROUPS, all)).toEqual({ ids: ['a1', 'b1', 'b2'], groupA: 1 })
  })

  it('обе группы → A, затем B; одна — вторая из выделения; мёртвые id отброшены', () => {
    expect(resolveCsgOperands([], { a: ['a1', 'a2'], b: ['b1', 'b2'] }, all)).toEqual({ ids: ['a1', 'a2', 'b1', 'b2'], groupA: 2 })
    expect(resolveCsgOperands(['a1', 'b1', 'c'], { a: ['a1', 'a2'], b: [] }, all)).toEqual({ ids: ['a1', 'a2', 'b1', 'c'], groupA: 2 })
    expect(resolveCsgOperands(['a1', 'c'], { a: [], b: ['b1'] }, all)).toEqual({ ids: ['a1', 'c', 'b1'], groupA: 2 })
    expect(resolveCsgOperands(['b1'], { a: ['gone', 'a1'], b: [] }, all)).toEqual({ ids: ['a1', 'b1'], groupA: 1 })
    expect(resolveCsgOperands(['a1'], { a: ['a1'], b: [] }, all)).toBeNull()      // B пуста
  })

  it('aliveGroups — без мёртвых и пересечений', () => {
    expect(aliveGroups({ a: ['a1', 'x'], b: ['a1', 'b1'] }, all)).toEqual({ a: ['a1'], b: ['b1'] })
  })

  it('clampGroupA: нет / вне диапазона — в [1, n−1]', () => {
    expect(clampGroupA(undefined, 10)).toBe(1)
    expect(clampGroupA(5, 10)).toBe(5)
    expect(clampGroupA(0, 10)).toBe(1)
    expect(clampGroupA(12, 10)).toBe(9)
    expect(clampGroupA(3, 2)).toBe(1)
  })
})
