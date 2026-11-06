// ============================================================
// import-mesh-csg-nonmanifold.test.ts — незамкнутый STL → CSG: предсказуемое поведение
// ============================================================
// Реальный WASM. Пользователь видит уведомление, а не пустой результат и не падение;
// объекты и история не меняются, busy сброшен. Контроль — обычный CSG примитивов.
// IMPORT-MESH-CSG: замкнутый STL теперь допускается (тест перевёрнут).

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
import { clearTree } from '../csg/history-tree'
import { useNotifications } from '../store/notifications'

const st = () => useDocumentStore.getState()
beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
})

/** Один треугольник — заведомо не замкнутый (non-manifold) меш. */
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
const cube = () => newId(() => st().addShape('cube', { width: 10, height: 10, depth: 10 }))
const warnings = () => useNotifications.getState().notifications.filter((n) => n.type === 'warning' || n.type === 'error')

/** CSG над [a, b] — снимок состояния до и после. */
async function tryCsg(a: string, b: string, op: 'union' | 'subtract' | 'intersect' = 'union') {
  st().selectObjects([a, b], false)
  const before = { objects: st().objects, operations: st().operations, historyIndex: st().historyIndex }
  let thrown: unknown = null
  try { await st().csgBoolean(op) } catch (e) { thrown = e }
  return { before, thrown }
}

describe('import_mesh → CSG: предсказуемое поведение', () => {
  it('незамкнутый STL (треугольник) ∪ куб: не падает, уведомление, объекты и история не изменились', async () => {
    const tri = await importMesh('open.stl', TRIANGLE)
    expect(st().objects[tri].shapeType).toBe('import_mesh')
    const c = await cube()
    for (const [a, b] of [[tri, c], [c, tri]]) {             // оба порядка операндов
      useNotifications.setState({ notifications: [] })
      for (const op of ['union', 'subtract', 'intersect'] as const) {
        const { before, thrown } = await tryCsg(a, b, op)
        expect(thrown).toBeNull()
        expect(st().objects).toBe(before.objects)
        expect(st().operations).toBe(before.operations)
        expect(st().historyIndex).toBe(before.historyIndex)
        expect(st().busy).toBe(false)
        expect(Object.values(st().objects).some((o) => o.shapeType === 'csg')).toBe(false)
      }
      const w = warnings()
      expect(w).toHaveLength(3)
      expect(w[0].type).toBe('warning')
      expect(w[0].message).toMatch(/non-manifold/i)
    }
  })

  it('замкнутый STL ∪ куб — работает (IMPORT-MESH-CSG: проверка по замкнутости, а не по типу)', async () => {
    // Раньше («текущее ограничение») csgBoolean отсекал ЛЮБОЙ import_mesh. Подробно — import-mesh-csg.test.ts.
    const closed = await importMesh('cube.stl', CLOSED_CUBE)
    const c = await cube()
    const { before, thrown } = await tryCsg(closed, c)
    expect(thrown).toBeNull()
    expect(st().objects).not.toBe(before.objects)
    expect(st().operations).toHaveLength(before.operations.length + 1)
    expect(st().objects[st().selectedIds[0]].shapeType).toBe('csg')
    expect(warnings()).toHaveLength(0)
  })

  it('контроль: куб ∪ сфера работает как раньше (CSG-результат, шаг истории, без уведомлений)', async () => {
    const c = await cube()
    const s = await newId(() => st().addShape('sphere', { radius: 6, segments: 32 }))
    await st().moveObject(s, { ...st().objects[s].transform, x: 5 })
    const n = st().operations.length
    const { thrown } = await tryCsg(c, s)
    expect(thrown).toBeNull()
    expect(st().operations).toHaveLength(n + 1)
    expect(st().operations[n].type).toBe('group')
    const root = st().objects[st().selectedIds[0]]
    expect(root.shapeType).toBe('csg')
    expect(root.indices.length).toBeGreaterThan(0)
    expect(st().objects[c]).toBeUndefined()
    expect(warnings()).toHaveLength(0)
    expect(st().busy).toBe(false)
  })
})
