// ============================================================
// align-csg.test.ts — ALIGN-CSG-AABB (исправлено в 9.5.2): живой alignSelected с CSG
// ============================================================
// Реальный WASM, без каскада правки шага: два CSG-объекта с pivot ≠ 0 → align X → мировые
// рамки совпадают; воспроизведение из истории даёт то же положение.

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
import { rebuildFromHistory } from '../store/rebuild'
import { worldVerticesAABB } from '../store/helpers'
import type { SceneObject, ShapeParams, ShapeType, TransformNR } from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })
const box = (o: SceneObject) => worldVerticesAABB(o.vertices, o.transform)

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots(); clearTree()
})

async function shape(type: ShapeType, params: ShapeParams, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape(type, params)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}
async function union(a: string, b: string): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean('union')
  return st().selectedIds[0]
}

/** CSG 1: куб в x=20 ∪ сфера; CSG 2: повёрнутый куб в x=60 ∪ сфера. */
async function twoCsg() {
  const a1 = await shape('cube', { width: 10, height: 10, depth: 10 }, at(20, 20, 20))
  const b1 = await shape('sphere', { radius: 6, segments: 32 }, at(26, 20, 20))
  const c1 = await union(a1, b1)
  const a2 = await shape('cube', { width: 8, height: 8, depth: 8 }, at(60, 20, 20, { rotZ: 30 }))
  const b2 = await shape('sphere', { radius: 5, segments: 32 }, at(55, 20, 20))
  const c2 = await union(a2, b2)
  return { c1, c2 }
}

describe('ALIGN-CSG-AABB — живой alignSelected с CSG', () => {
  for (const anchor of ['min', 'center', 'max'] as const) {
    it(`два CSG, X ${anchor}: рамка цели совпадает с рамкой якоря; воспроизведение — то же`, async () => {
      const { c1, c2 } = await twoCsg()
      const anchorBox0 = box(st().objects[c1])
      const targetBox0 = box(st().objects[c2])
      st().selectObjects([c2, c1], false)                    // якорь — последний выбранный (c1)
      await st().alignSelected('X', anchor)
      const pick = (b: ReturnType<typeof box>) =>
        anchor === 'min' ? b.min.x : anchor === 'max' ? b.max.x : (b.min.x + b.max.x) / 2
      const a = st().objects[c1], t = st().objects[c2]
      expect(box(a)).toEqual(anchorBox0)                     // якорь не двигается
      expect(pick(box(t))).toBeCloseTo(pick(box(a)), 5)
      expect(box(t).min.y).toBeCloseTo(targetBox0.min.y, 6)  // другие оси не тронуты
      expect(box(t).min.z).toBeCloseTo(targetBox0.min.z, 6)
      // пересборка из истории (загрузка, undo/redo без снимков) — то же положение
      const replay = await rebuildFromHistory(st().operations)
      expect(replay[c2].transform.x).toBeCloseTo(t.transform.x, 5)
      expect(pick(box(replay[c2]))).toBeCloseTo(pick(box(replay[c1])), 5)
    })
  }
})
