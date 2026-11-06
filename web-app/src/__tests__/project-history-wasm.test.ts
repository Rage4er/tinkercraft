// ============================================================
// project-history-wasm.test.ts — Фаза 9.5.0: эффективная история на реальном WASM
// ============================================================
// Каскада ещё нет (9.5.1+): замены для edit_step берутся из «свежего» сценария,
// выполненного сразу с новыми значениями, — ровно то, что должен вернуть каскад.
// Проверяется путь проекция → стор (undo/redo, перемотка) → воркер → дерево → .3dtc,
// а также что вынесенное ядро computeCsgResult = прежний csgBoolean.

import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../csg/worker-client', async () => {
  const bridge = await import('./worker-bridge')
  return {
    workerBuildShape: bridge.workerBuildShape,
    workerApplyFillet: bridge.workerApplyFillet,
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
import { computeRSMatrix } from '../csg/worker-matrix'
import { meshVolume, checkRootConsistency } from '../store/edit-child'
import { rebuildFromHistory } from '../store/rebuild'
import { stepFingerprint, projectHistoryDetailed } from '../store/project-history'
import { computeCsgResult, groupReplacementFromResult } from '../store/csg-result'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import type {
  SceneObject, TransformNR, ShapeParams, ShapeType, TinkerCraftOperation, GroupOperation,
  EditStepOperation, StepPatch, StepReplacement, MoveOperation, MirrorPlane,
} from '../csg/types'

const st = () => useDocumentStore.getState()
const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })

function reset(): void {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots(); clearTree()
}
beforeEach(reset)

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
function bbox(v: Float32Array): number[] {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) }
  return [...mn, ...mx]
}
const volume = (o: SceneObject) => meshVolume(worldVerts(o), o.indices)
function expectSameWorld(a: SceneObject, b: SceneObject): void {
  const ba = bbox(worldVerts(a)), bb = bbox(worldVerts(b))
  expect(Math.max(...ba.map((v, i) => Math.abs(v - bb[i])))).toBeLessThan(5e-3)
  const va = volume(a), vb = volume(b)
  expect(Math.abs(va - vb) / Math.max(va, vb)).toBeLessThan(1e-3)
}
function expectDifferentWorld(a: SceneObject, b: SceneObject): void {
  const ba = bbox(worldVerts(a)), bb = bbox(worldVerts(b))
  const va = volume(a), vb = volume(b)
  expect(Math.max(...ba.map((v, i) => Math.abs(v - bb[i]))) > 1e-2 || Math.abs(va - vb) / Math.max(va, vb) > 1e-3).toBe(true)
}

async function shape(type: ShapeType, params: ShapeParams, t: TransformNR): Promise<string> {
  await st().addShape(type, params)
  const ids = Object.keys(st().objects)
  const id = ids[ids.length - 1]
  await st().moveObject(id, t)
  return id
}
async function union(a: string, b: string): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean('union')
  return st().selectedIds[0]
}

/** Снимок результата сценария (копия: стор будет сброшен). */
interface Run {
  ops: TinkerCraftOperation[]
  rootId: string
  /** операнд A (куб или зеркальная копия) */
  cubeId: string
  root: SceneObject
  groupIdx: number
}
function captureRun(rootId: string, cubeId: string): Run {
  const ops = [...st().operations]
  const groupIdx = ops.findIndex((o) => o.type === 'group' && o.resultId === rootId)
  expect(groupIdx).toBeGreaterThan(0)
  return { ops, rootId, cubeId, root: st().objects[rootId], groupIdx }
}
/** Замена group из свежего сценария (поля, которые запишет каскад). */
function replacementFrom(fresh: Run, stepIndex: number): StepReplacement {
  const g = fresh.ops[fresh.groupIdx] as GroupOperation
  return {
    stepIndex, kind: 'group',
    resultVertices: g.resultVertices, resultIndices: g.resultIndices, resultNormals: g.resultNormals,
    resultCenter: g.resultCenter, resultRotation: g.resultRotation, resultScale: g.resultScale,
    originalBboxSize: g.originalBboxSize,
  }
}
function editStep(ops: TinkerCraftOperation[], stepIndex: number, patch: StepPatch, replacements: StepReplacement[]): EditStepOperation {
  const fp = stepFingerprint(ops[stepIndex])
  expect(fp).not.toBeNull()
  return { type: 'edit_step', stepIndex, stepFingerprint: fp!, patch, replacements }
}
/** Дописать edit_step в историю и перейти к ней обычным путём стора (без снимка). */
async function appendAndJump(op: EditStepOperation): Promise<void> {
  const ops = [...st().operations.slice(0, st().historyIndex), op]
  useDocumentStore.setState({ operations: ops })
  await st().jumpToHistory(ops.length)
  expect(st().historyIndex).toBe(ops.length)
}

// призма (с поворотом) → mirror plane → union зеркальной копии со сферой.
// (Fillet здесь не годится: CSG сейчас теряет fillet куба — FILLET-LOST-IN-CSG, см. отчёт 9.5.0.)
async function mirrorScene(plane: MirrorPlane): Promise<Run> {
  const prism = await shape('prism', { radius: 10, height: 20, sides: 5 }, at(30, 2, 0, { rotY: 25 }))
  const before = new Set(Object.keys(st().objects))
  useDocumentStore.setState({ selectedIds: [prism] })
  await st().mirrorSelected(plane)
  const copy = Object.keys(st().objects).find((k) => !before.has(k))!
  const sphere = await shape('sphere', { radius: 9, segments: 32 }, at(-24, 0, 0))
  return captureRun(await union(copy, sphere), copy)
}
const mirrorIdxOf = (run: Run) => run.ops.findIndex((o) => o.type === 'mirror')

// куб с поворотом/масштабом (pivot CSG = TRS куба) → union со сферой
async function movedScene(t: TransformNR): Promise<Run> {
  const cube = await shape('cube', { width: 10, height: 10, depth: 10 }, t)
  const sphere = await shape('sphere', { radius: 6, segments: 32 }, at(-5, 0, 0))
  return captureRun(await union(cube, sphere), cube)
}
const moveIdxOf = (run: Run) => run.ops.findIndex((o) => o.type === 'move' && o.ids[0] === run.cubeId)

describe('9.5.0 — computeCsgResult = прежний csgBoolean', () => {
  it('pivot = TRS операнда A, вершины un-baked — побайтно как операция group', async () => {
    const cube = await shape('cube', { width: 10, height: 10, depth: 10 }, at(10, 2, 0, { rotY: 30, scaleX: 1.5 }))
    const sphere = await shape('sphere', { radius: 6, segments: 32 }, at(4, 0, 0))
    const objA = st().objects[cube], objB = st().objects[sphere]
    const rootId = await union(cube, sphere)
    const g = st().operations[st().operations.length - 1] as GroupOperation

    const r = await computeCsgResult(objA, objB, 'union', 'csg_recheck')
    expect(r.transform).toEqual(objA.transform)
    expect(Array.from(r.vertices)).toEqual(Array.from(g.resultVertices as Float32Array))
    expect(Array.from(r.indices)).toEqual(Array.from(g.resultIndices as Uint32Array))
    const repl = groupReplacementFromResult(7, r)
    expect(repl).toMatchObject({
      stepIndex: 7, kind: 'group',
      resultCenter: g.resultCenter, resultRotation: g.resultRotation, resultScale: g.resultScale,
      originalBboxSize: g.originalBboxSize,
    })
    expect(st().objects[rootId].transform).toEqual(objA.transform)
  })
})

describe('9.5.0 — эффективная история через стор', () => {
  it('mirror: edit_step = свежий сценарий; undo → исходный (снимок и пересборка); redo → правленый', async () => {
    const fresh = await mirrorScene('XZ')
    reset()
    const orig = await mirrorScene('YZ')
    const mIdx = mirrorIdxOf(orig)
    expectDifferentWorld(orig.root, fresh.root)

    await appendAndJump(editStep(orig.ops, mIdx, { kind: 'mirror', plane: 'XZ' }, [replacementFrom(fresh, orig.groupIdx)]))
    const edited = st().objects[orig.rootId]
    expectSameWorld(edited, fresh.root)
    expect(edited.transform).toEqual(fresh.root.transform)
    // зеркальный операнд в дереве — с новой плоскостью; дерево воспроизводит меш
    expect(getNode(orig.cubeId)?.mirrored).toEqual(['XZ'])
    expect(await checkRootConsistency({
      rootId: orig.rootId, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
    })).toBeNull()

    // undo — снимок индекса до правки (префикс не менялся): исходный меш побайтно
    await st().undo()
    expect(Array.from(st().objects[orig.rootId].vertices)).toEqual(Array.from(orig.root.vertices))
    expect(getNode(orig.cubeId)?.mirrored).toEqual(['YZ'])
    // redo
    await st().redo()
    expectSameWorld(st().objects[orig.rootId], fresh.root)
    // без снимков: перемотка пересобирает из эффективной истории
    clearSnapshots()
    await st().jumpToHistory(orig.ops.length)
    expect(Array.from(st().objects[orig.rootId].vertices)).toEqual(Array.from(orig.root.vertices))
    clearSnapshots()
    await st().jumpToHistory(orig.ops.length + 1)
    expectSameWorld(st().objects[orig.rootId], fresh.root)
  })

  it('move операнда A до union: pivot CSG, дерево и калибровка 9.9 — из эффективной истории', async () => {
    const tNew = at(25, 3, 0, { rotY: 45, scaleX: 1.2 })
    const fresh = await movedScene(tNew)
    const freshMove = fresh.ops[moveIdxOf(fresh)] as MoveOperation
    reset()
    const orig = await movedScene(at(10, 0, 0, { rotY: 30 }))
    const mIdx = moveIdxOf(orig)
    expect(mIdx).toBeGreaterThan(0)

    const patch: StepPatch = { kind: 'move', delta: freshMove.delta, rotDelta: freshMove.rotDelta, scaleDelta: freshMove.scaleDelta }
    await appendAndJump(editStep(orig.ops, mIdx, patch, [replacementFrom(fresh, orig.groupIdx)]))

    const edited = st().objects[orig.rootId]
    expect(edited.transform).toEqual(fresh.root.transform)
    expect(edited.transform).toMatchObject({ x: 25, y: 3, rotY: 45, scaleX: 1.2 })
    expectSameWorld(edited, fresh.root)

    // Build Tree: корень и операнд — в новом положении
    expect(getNode(orig.rootId)?.localTransform).toMatchObject({ x: 25, y: 3, rotY: 45, scaleX: 1.2 })
    expect(getNode(orig.cubeId)?.localTransform).toMatchObject({ x: 25, y: 3, rotY: 45, scaleX: 1.2 })
    // дерево воспроизводит меш (калибровка 9.3 / замки 9.9 видят эффективный pivot)
    expect(await checkRootConsistency({
      rootId: orig.rootId, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
    })).toBeNull()

    // undo — исходный pivot и дерево
    await st().undo()
    expect(st().objects[orig.rootId].transform).toEqual(orig.root.transform)
    expect(getNode(orig.cubeId)?.localTransform).toMatchObject({ x: 10, rotY: 30, scaleX: 1 })
    expect(await checkRootConsistency({
      rootId: orig.rootId, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
    })).toBeNull()
  })

  it('.3dtc round-trip: edit_step с заменами сохраняется и воспроизводится', async () => {
    const fresh = await mirrorScene('XZ')
    reset()
    const orig = await mirrorScene('YZ')
    await appendAndJump(editStep(orig.ops, mirrorIdxOf(orig), { kind: 'mirror', plane: 'XZ' }, [replacementFrom(fresh, orig.groupIdx)]))

    const blob = await serialize3dtc({ objects: st().objects, operations: st().operations, operationsTrimmed: false })
    const parsed = await parse3dtc(blob)
    const last = parsed.operations[parsed.operations.length - 1]
    expect(last.type).toBe('edit_step')
    if (last.type !== 'edit_step') return
    expect(Array.isArray(last.replacements[0].resultVertices)).toBe(true)
    expect(projectHistoryDetailed(parsed.operations).ignored).toEqual([])

    const objs = await rebuildFromHistory(parsed.operations)
    expectSameWorld(objs[orig.rootId], fresh.root)
  })

  it('правка с неверным отпечатком игнорируется — сцена как без неё', async () => {
    const fresh = await mirrorScene('XZ')
    reset()
    const orig = await mirrorScene('YZ')
    const bad = editStep(orig.ops, mirrorIdxOf(orig), { kind: 'mirror', plane: 'XZ' }, [replacementFrom(fresh, orig.groupIdx)])
    bad.stepFingerprint = { type: 'mirror', targetId: 'чужой' }
    await appendAndJump(bad)
    expect(Array.from(st().objects[orig.rootId].vertices)).toEqual(Array.from(orig.root.vertices))
  })
})
