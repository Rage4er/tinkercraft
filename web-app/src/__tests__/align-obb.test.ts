// ============================================================
// align-obb.test.ts — ALIGN-REVIT: выравнивание по реальной геометрии с поворотом
// ============================================================
// Реальный WASM. Рамка выравнивания — проекция реальной геометрии (вершины через
// полный TRS; без вершин — OBB по 8 углам), а не params + позиция:
//  - повёрнутый цилиндр выравнивается по основанию (раньше — как сфера радиуса r);
//  - повёрнутый куб — по реальной грани / ребру (раньше — по ±w/2 без поворота);
//  - re-solve каскада правки шага (move / mirror / extrude) — тем же решателем.

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
import { useNotifications } from '../store/notifications'
import { clearSnapshots } from '../store/snapshots'
import { clearTree } from '../csg/history-tree'
import { rebuildFromHistory } from '../store/rebuild'
import {
  computeWorldAABB, worldVerticesAABB, obbCorners, obbWorldAABB, localParamsBox, solveAlignDeltas,
} from '../store/helpers'
import type {
  SceneObject, ShapeParams, ShapeType, TransformNR, MoveOperation, AlignOperation, EditStepOperation, MirrorPlane,
} from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })
const box = (o: SceneObject) => worldVerticesAABB(o.vertices, o.transform)
const warnings = () => useNotifications.getState().notifications.filter((n) => n.type === 'warning' || n.type === 'error')
const lastEdit = () => st().operations[st().operations.length - 1] as EditStepOperation

function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  useNotifications.setState({ notifications: [] })
  clearSnapshots(); clearTree()
}
beforeEach(reset)

async function shape(type: ShapeType, params: ShapeParams, t: TransformNR): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  await st().addShape(type, params)
  const id = Object.keys(st().objects).find((k) => !before.has(k))!
  await st().moveObject(id, t)
  return id
}
/** Выравнивание: якорь — последний выбранный. */
async function align(target: string, anchor: string, axis: 'X' | 'Y' | 'Z', a: 'min' | 'center' | 'max'): Promise<void> {
  st().selectObjects([target, anchor], false)
  await st().alignSelected(axis, a)
}
const moveIdxOf = (id: string) =>
  st().operations.findIndex((o) => o.type === 'move' && o.ids.length === 1 && o.ids[0] === id)

const CYL = { radius: 5, height: 20, segments: 48 }
const CUBE10 = { width: 10, height: 10, depth: 10 }

describe('OBB — 8 углов, поворот, проекция', () => {
  it('куб 10 повёрнут на 45° вокруг Z: проекция OBB на X = ±5√2, а не ±5', () => {
    const b = obbWorldAABB({ min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } }, at(100, 0, 0, { rotZ: 45 }))
    expect(b.min.x).toBeCloseTo(100 - 5 * Math.SQRT2, 6)
    expect(b.max.y).toBeCloseTo(5 * Math.SQRT2, 6)
    expect(b.max.z).toBeCloseTo(5, 6)
  })
  it('8 углов с масштабом: scaleX 2 удваивает протяжённость по X', () => {
    const c = obbCorners({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 } }, at(0, 0, 0, { scaleX: 2 }))
    expect(c).toHaveLength(8)
    expect(Math.min(...c.map((v) => v.x))).toBeCloseTo(-2, 6)
  })
  it('без вершин — OBB из params: цилиндр не «сфера» (Z = ±h/2), поворот учитывается', () => {
    const obj: SceneObject = {
      id: 'c', shapeType: 'cylinder', params: CYL, color: '#fff', transform: at(0, 0, 0, { rotY: 90 }),
      visible: true, locked: false, vertices: new Float32Array(), indices: new Uint32Array(),
    }
    expect(localParamsBox(obj).max.z).toBe(10)
    const b = computeWorldAABB(obj)
    expect(b.min.x).toBeCloseTo(-10, 6)                     // ось цилиндра → X: основание
    expect(b.max.z).toBeCloseTo(5, 6)
  })
})

describe('ALIGN-REVIT — живой alignSelected по реальной геометрии', () => {
  it('повёрнутый цилиндр (ось → X) → align X min → по круглому основанию, не как сфера', async () => {
    const anchor = await shape('cube', CUBE10, at(50, 0, 0))          // X min якоря = 45
    const cyl = await shape('cylinder', CYL, at(0, 30, 0, { rotY: 90 }))
    await align(cyl, anchor, 'X', 'min')
    expect(warnings()).toHaveLength(0)
    const c = st().objects[cyl]
    expect(box(c).min.x).toBeCloseTo(45, 4)                           // основание у плоскости
    expect(c.transform.x).toBeCloseTo(55, 4)                          // pivot = основание + h/2
    // старая рамка (params как сфера: x ± r) поставила бы pivot в 50 — основание в 40
    const op = st().operations[st().operations.length - 1] as AlignOperation
    expect(op.deltas[cyl]).toBeCloseTo(55, 4)
    // воспроизведение из истории — то же положение
    const replay = await rebuildFromHistory(st().operations)
    expect(box(replay[cyl]).min.x).toBeCloseTo(45, 4)
  })

  it('повёрнутый цилиндр (произвольный поворот) — по реальному ободу; OBB описанного бокса не точнее', async () => {
    const anchor = await shape('cube', CUBE10, at(50, 0, 0))
    const cyl = await shape('cylinder', CYL, at(0, 30, 0, { rotX: 30, rotY: 40, rotZ: 15 }))
    await align(cyl, anchor, 'X', 'min')
    const c = st().objects[cyl]
    expect(box(c).min.x).toBeCloseTo(45, 4)
    // граница по геометрии лежит внутри проекции OBB (8 углов описанного бокса)
    const obb = obbWorldAABB(localParamsBox(c), c.transform)
    expect(obb.min.x).toBeLessThanOrEqual(box(c).min.x + 1e-6)
  })

  it('повёрнутый куб → align Z max → по реальной грани (ребру), не по ±w/2', async () => {
    const anchor = await shape('cube', CUBE10, at(50, 0, 20))         // Z max якоря = 25
    const cube = await shape('cube', CUBE10, at(0, 30, 0, { rotX: 45 }))
    await align(cube, anchor, 'Z', 'max')
    expect(warnings()).toHaveLength(0)
    const k = st().objects[cube]
    expect(box(k).max.z).toBeCloseTo(25, 4)
    expect(k.transform.z).toBeCloseTo(25 - 5 * Math.SQRT2, 4)         // раньше: 25 − 5
    // для бокса реальная грань = проекция OBB (8 углов)
    expect(obbWorldAABB(localParamsBox(k), k.transform).max.z).toBeCloseTo(box(k).max.z, 4)
  })

  it('повёрнутый якорь: цель выравнивается по его реальной грани', async () => {
    const anchor = await shape('cylinder', CYL, at(50, 0, 0, { rotY: 90 }))   // X max якоря = 60
    const cube = await shape('cube', CUBE10, at(0, 30, 0))
    await align(cube, anchor, 'X', 'max')
    expect(box(st().objects[cube]).max.x).toBeCloseTo(60, 4)
  })

  it('масштаб учитывается: куб scaleX 2 → align X min', async () => {
    const anchor = await shape('cube', CUBE10, at(50, 0, 0))
    const cube = await shape('cube', CUBE10, at(0, 30, 0, { scaleX: 2 }))
    await align(cube, anchor, 'X', 'min')
    expect(box(st().objects[cube]).min.x).toBeCloseTo(45, 4)
    expect(st().objects[cube].transform.x).toBeCloseTo(55, 4)        // раньше: 50 (без масштаба)
  })
})

describe('ALIGN-REVIT — re-solve каскада 9.5.2 по реальной геометрии', () => {
  it('move: правка поворота цилиндра в шаге move → align X min перерешён по основанию', async () => {
    const anchor = await shape('cube', CUBE10, at(50, 0, 0))
    const cyl = await shape('cylinder', CYL, at(0, 30, 0))            // ось вдоль Z: X min = x − r
    await align(cyl, anchor, 'X', 'min')
    expect(box(st().objects[cyl]).min.x).toBeCloseTo(45, 4)
    const idx = moveIdxOf(cyl)
    const m = st().operations[idx] as MoveOperation
    const patch = { kind: 'move' as const, delta: { ...m.delta }, rotDelta: { x: 0, y: 90, z: 0 } }
    expect(await st().editStepParams(idx, patch)).toBe(true)
    expect(warnings()).toHaveLength(0)
    expect(lastEdit().replacements.map((r) => r.kind)).toContain('align')
    const c = st().objects[cyl]
    expect(c.transform.rotY).toBeCloseTo(90, 6)
    expect(box(c).min.x).toBeCloseTo(45, 4)                           // основание, а не «сфера»
    expect(c.transform.x).toBeCloseTo(55, 4)
  })

  it('mirror: правка плоскости зеркала → копия-конус (повёрнут) перевыровнена по реальной геометрии', async () => {
    const anchor = await shape('cube', CUBE10, at(50, 0, 0))
    const cone = await shape('cone', { radius: 5, height: 20, segments: 48 }, at(10, 30, 0, { rotY: 90 }))
    const before = new Set(Object.keys(st().objects))
    st().selectObjects([cone], false)
    await st().mirrorSelected('YZ')
    const copy = Object.keys(st().objects).find((k) => !before.has(k))!
    await align(copy, anchor, 'X', 'min')
    expect(box(st().objects[copy]).min.x).toBeCloseTo(45, 4)
    const idx = st().operations.findIndex((o) => o.type === 'mirror' && o.ids.includes(copy))
    expect(await st().editStepParams(idx, { kind: 'mirror', plane: 'XY' as MirrorPlane })).toBe(true)
    expect(warnings()).toHaveLength(0)
    expect(lastEdit().replacements.map((r) => r.kind)).toContain('align')
    expect(box(st().objects[copy]).min.x).toBeCloseTo(45, 4)
  })

  it('extrude: правка глубины якоря → наклонённый цилиндр перевыровнен по реальному ободу к Z max', async () => {
    const base = await shape('cube', CUBE10, at(50, 0, 0))
    st().selectObjects([base], false)
    await st().extrudeSelected('Z', 5)
    const ext = st().selectedIds[0]
    expect(box(st().objects[ext]).max.z).toBeCloseTo(10, 4)
    const cyl = await shape('cylinder', CYL, at(0, 30, 0, { rotX: 30 }))   // наклонён: по Z не ±r (как «сфера»)
    await align(cyl, ext, 'Z', 'max')
    expect(box(st().objects[cyl]).max.z).toBeCloseTo(10, 4)
    const idx = st().operations.findIndex((o) => o.type === 'group' && !!o.source)
    expect(await st().editStepParams(idx, { kind: 'extrude', depth: 12 })).toBe(true)
    expect(warnings()).toHaveLength(0)
    expect(lastEdit().replacements.map((r) => r.kind)).toContain('align')
    expect(box(st().objects[cyl]).max.z).toBeCloseTo(17, 4)
    expect(box(st().objects[cyl]).max.z).toBeCloseTo(box(st().objects[ext]).max.z, 4)
  })

  it('solveAlignDeltas — та же рамка, что живой align (одна семантика)', async () => {
    const anchor = await shape('cube', CUBE10, at(50, 0, 0))
    const cyl = await shape('cylinder', CYL, at(0, 30, 0, { rotY: 90 }))
    const d = solveAlignDeltas(st().objects, [cyl], 'X', 'min', anchor)
    expect(d[cyl]).toBeCloseTo(55, 4)
    await align(cyl, anchor, 'X', 'min')
    expect((st().operations[st().operations.length - 1] as AlignOperation).deltas[cyl]).toBeCloseTo(d[cyl], 6)
  })
})
