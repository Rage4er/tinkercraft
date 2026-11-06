// ============================================================
// import-mesh-csg.test.ts — IMPORT-MESH-CSG: CSG для замкнутых STL
// ============================================================
// Импортированный меш допускается к CSG по замкнутости (manifold построился в воркере),
// а не отсекается по типу. Замкнутый STL ∪ куб → работает; незамкнутый → уведомление
// errors.csgNonManifold (ru/en), объекты/история не меняются. Реальный WASM.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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

import { useDocumentStore } from '../store/document-store'
import { clearSnapshots } from '../store/snapshots'
import { clearTree, getNode } from '../csg/history-tree'
import { getTreeView } from '../csg/tree-view'
import { useNotifications } from '../store/notifications'
import { meshVolume, checkRootConsistency } from '../store/edit-child'
import { computeRSMatrix } from '../csg/worker-matrix'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { rebuildFromHistory, rebuildBuildTree } from '../store/rebuild'
import i18n from '../i18n'
import ru from '../i18n/locales/ru/translation.json'
import en from '../i18n/locales/en/translation.json'
import type { SceneObject, TinkerCraftOperation } from '../csg/types'

const st = () => useDocumentStore.getState()

function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
}
beforeEach(reset)
afterEach(async () => { await i18n.changeLanguage('ru') })

/** Один треугольник — заведомо незамкнутый меш. */
const TRIANGLE = { v: [0, 0, 0, 10, 0, 0, 0, 10, 0], i: [0, 1, 2] }
/** Замкнутый куб 10³ (8 вершин, 12 треугольников, нормали наружу). */
const CLOSED_CUBE = {
  v: [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10],
  i: [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3],
}

async function newId(add: () => Promise<void>): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await add()
  return Object.keys(st().objects).find((k) => !before.has(k))!
}
const importMesh = (name: string, m: { v: number[]; i: number[] }) => newId(() => st().addRawMesh(name, m.v, m.i))
const warnings = () => useNotifications.getState().notifications.filter((n) => n.type === 'warning' || n.type === 'error')

/** Куб-примитив 10³, центр = центр STL-куба + dx по X. */
async function cubeNextTo(stl: string, dx: number): Promise<string> {
  const c = await newId(() => st().addShape('cube', { width: 10, height: 10, depth: 10 }))
  const t = st().objects[stl].transform
  await st().moveObject(c, { ...st().objects[c].transform, x: t.x + dx, y: t.y, z: t.z })
  return c
}

async function csg(a: string, b: string, op: 'union' | 'subtract' | 'intersect' = 'union'): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean(op)
  return st().selectedIds[0]
}

function worldVerts(obj: SceneObject): Float32Array {
  const t = obj.transform
  const [r00, r01, r02, r10, r11, r12, r20, r21, r22] = computeRSMatrix(
    { rotX: t.rotX, rotY: t.rotY, rotZ: t.rotZ },
    { scaleX: t.scaleX, scaleY: t.scaleY, scaleZ: t.scaleZ },
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

function worldBox(obj: SceneObject): number[] {
  const v = worldVerts(obj)
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) {
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) }
  }
  return [...mn, ...mx]
}

describe('IMPORT-MESH-CSG: замкнутый STL допускается к CSG', () => {
  it('замкнутый STL ∪ куб → CSG-результат, шаг group, меш = объединение (объём 1500), без уведомлений', async () => {
    const stl = await importMesh('cube.stl', CLOSED_CUBE)
    expect(st().objects[stl].shapeType).toBe('import_mesh')
    const p = st().objects[stl].transform
    const c = await cubeNextTo(stl, 5) // перекрытие 5×10×10
    const n = st().operations.length

    const root = await csg(stl, c)

    expect(warnings()).toEqual([])
    expect(st().busy).toBe(false)
    expect(st().operations).toHaveLength(n + 1)
    expect(st().operations[n].type).toBe('group')
    const r = st().objects[root]
    expect(r.shapeType).toBe('csg')
    expect(st().objects[stl]).toBeUndefined()
    expect(st().objects[c]).toBeUndefined()
    // меш — настоящий STL, а не примитив-заглушка: объединение 10³ и 10³ со сдвигом 5
    expect(meshVolume(worldVerts(r), r.indices)).toBeCloseTo(1500, 1)
    const box = worldBox(r)
    const want = [p.x - 5, p.y - 5, p.z - 5, p.x + 10, p.y + 5, p.z + 5]
    for (let i = 0; i < 6; i++) expect(box[i]).toBeCloseTo(want[i], 3)
  })

  it('куб − замкнутый STL (импорт — операнд B) → вычитание работает (объём 500)', async () => {
    const stl = await importMesh('cube.stl', CLOSED_CUBE)
    const c = await cubeNextTo(stl, 5)
    const root = await csg(c, stl, 'subtract')
    expect(warnings()).toEqual([])
    const r = st().objects[root]
    expect(r.shapeType).toBe('csg')
    expect(meshVolume(worldVerts(r), r.indices)).toBeCloseTo(500, 1)
  })

  it('дерево: импорт — baked 🔒, куб рядом правится; правка куба пересчитывает CSG', async () => {
    const stl = await importMesh('cube.stl', CLOSED_CUBE)
    const c = await cubeNextTo(stl, 5)
    const root = await csg(stl, c)
    const view = getTreeView(root)!
    expect(view.children.map((ch) => [ch.id, ch.type, ch.notEditableReason])).toEqual([
      [stl, 'baked', 'baked'],
      [c, 'primitive', null],
    ])
    expect(await checkRootConsistency({ rootId: root, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex })).toBeNull()

    await st().editChildParams(root, c, { width: 20 }) // куб 20×10×10, центр в +5 → x ∈ [−5, 15] от центра STL
    expect(warnings()).toEqual([])
    const r = st().objects[root]
    expect(meshVolume(worldVerts(r), r.indices)).toBeCloseTo(2000, 1)
  })

  it('импорт сдвинут до CSG; перемотка без снимков и .3dtc: дерево с импортом, куб правится', async () => {
    const stl = await importMesh('cube.stl', CLOSED_CUBE)
    await st().moveObject(stl, { ...st().objects[stl].transform, y: 7, z: 3 })
    const c = await cubeNextTo(stl, 5)
    const root = await csg(stl, c)
    const live = st().objects[root]

    clearSnapshots()
    await st().undo()
    expect(st().objects[root]).toBeUndefined()
    expect(st().objects[stl]).toBeDefined()
    await st().redo()
    expect(worldBox(st().objects[root]).map((x) => +x.toFixed(3))).toEqual(worldBox(live).map((x) => +x.toFixed(3)))

    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    reset()
    const ops = (await parse3dtc(blob)).operations as TinkerCraftOperation[]
    const objects = await rebuildFromHistory(ops)
    rebuildBuildTree(ops, objects) // чистое дерево — как после перезапуска
    useDocumentStore.setState({ operations: ops, historyIndex: ops.length, objects })

    expect(getNode(root)?.type).toBe('boolean')
    expect(getNode(stl)?.type).toBe('baked')
    expect(await checkRootConsistency({ rootId: root, objects, operations: ops, historyIndex: ops.length })).toBeNull()
    await st().editChildParams(root, c, { width: 20 })
    expect(warnings()).toEqual([])
    const r = st().objects[root]
    expect(meshVolume(worldVerts(r), r.indices)).toBeCloseTo(2000, 1)
  })
})

describe('IMPORT-MESH-CSG: незамкнутый STL → уведомление', () => {
  it('незамкнутый STL ∪ куб: отказ с errors.csgNonManifold, объекты и история не меняются, busy сброшен', async () => {
    const tri = await importMesh('open.stl', TRIANGLE)
    const c = await newId(() => st().addShape('cube', { width: 10, height: 10, depth: 10 }))
    st().selectObjects([tri, c], false)
    const before = { objects: st().objects, operations: st().operations, historyIndex: st().historyIndex }
    await st().csgBoolean('union')
    expect(st().objects).toBe(before.objects)
    expect(st().operations).toBe(before.operations)
    expect(st().historyIndex).toBe(before.historyIndex)
    expect(st().busy).toBe(false)
    const w = warnings()
    expect(w).toHaveLength(1)
    expect(w[0].type).toBe('warning')
    expect(w[0].message).toBe(ru.errors.csgNonManifold)
  })

  it('i18n: текст уведомления — из errors.csgNonManifold (ru/en), без захардкоженной строки', async () => {
    expect(ru.errors.csgNonManifold).toBe('Меш не замкнут (non-manifold), CSG невозможен. Проверьте STL.')
    expect(en.errors.csgNonManifold).toBe('Mesh is not closed (non-manifold), CSG is not possible. Check the STL.')
    // старый ключ подсказки удалён вместе с блокировкой по типу
    expect((ru.csg as Record<string, string>).nonManifold).toBeUndefined()

    await i18n.changeLanguage('en')
    const tri = await importMesh('open.stl', TRIANGLE)
    const c = await newId(() => st().addShape('cube', { width: 10, height: 10, depth: 10 }))
    st().selectObjects([c, tri], false)
    await st().csgBoolean('subtract')
    expect(warnings().map((n) => n.message)).toEqual([en.errors.csgNonManifold])
  })

  it('контроль: примитивы ∪ работают как раньше', async () => {
    const c = await newId(() => st().addShape('cube', { width: 10, height: 10, depth: 10 }))
    const s = await newId(() => st().addShape('sphere', { radius: 6, segments: 32 }))
    await st().moveObject(s, { ...st().objects[s].transform, x: st().objects[c].transform.x + 5 })
    const root = await csg(c, s)
    expect(st().objects[root].shapeType).toBe('csg')
    expect(warnings()).toEqual([])
  })
})
