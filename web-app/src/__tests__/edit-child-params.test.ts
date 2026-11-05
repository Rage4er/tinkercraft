// ============================================================
// edit-child-params.test.ts — Фаза 9.2/9.3: правка параметров ребёнка CSG
// ============================================================
// Настоящий manifold-WASM через worker-bridge (как csg-preserve-rs).
// Эталон: «свежий» CSG, собранный с теми же операндами и новыми params —
// мировой меш отредактированного результата обязан с ним совпасть.

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
import { clearTree, getNode } from '../csg/history-tree'
import { getTreeView } from '../csg/tree-view'
import { computeRSMatrix } from '../csg/worker-matrix'
import { meshVolume, checkChildEditable } from '../store/edit-child'
import { serialize3dtc, parse3dtc } from '../io/3dtc-io'
import { rebuildFromHistory } from '../store/rebuild'
import { useNotifications } from '../store/notifications'
import type { SceneObject, TransformNR, EditChildParamsOperation, TinkerCraftOperation } from '../csg/types'

const st = () => useDocumentStore.getState()

const ID: TransformNR = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 }
const at = (x: number, y = 0, z = 0, extra: Partial<TransformNR> = {}): TransformNR => ({ ...ID, x, y, z, ...extra })

beforeEach(() => {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots()
  clearTree()
})

/** world = pos + R·S·v */
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
  for (let i = 0; i < v.length; i += 3) {
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) }
  }
  return [...mn, ...mx]
}

function expectSameWorld(a: SceneObject, b: SceneObject): void {
  const ba = bbox(worldVerts(a)), bb = bbox(worldVerts(b))
  for (let i = 0; i < 6; i++) expect(ba[i]).toBeCloseTo(bb[i], 2)
  // объём в мировых координатах: (RS не меняет сравнение между a и b при равных transform)
  const va = meshVolume(worldVerts(a), a.indices), vb = meshVolume(worldVerts(b), b.indices)
  expect(Math.abs(va - vb) / Math.max(va, vb)).toBeLessThan(1e-3)
}

/** Создать фигуру и сразу задать transform. */
async function shape(type: 'cube' | 'sphere' | 'cylinder', params: Record<string, number>, t: TransformNR): Promise<string> {
  await st().addShape(type, params)
  const ids = Object.keys(st().objects)
  const id = ids[ids.length - 1]
  await st().moveObject(id, t)
  return id
}

async function csg(a: string, b: string, op: 'union' | 'subtract' | 'intersect'): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean(op)
  return st().selectedIds[0]
}

/** Эталон: cube(width) ∪ sphere(r) с теми же transform (первым — куб = операнд A). */
async function freshUnion(width: number, cubeT: TransformNR, sphereT: TransformNR): Promise<SceneObject> {
  useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
  clearSnapshots(); clearTree()
  const c = await shape('cube', { width, height: 20, depth: 20 }, cubeT)
  const s = await shape('sphere', { radius: 8, segments: 32 }, sphereT)
  const r = await csg(c, s, 'union')
  return st().objects[r]
}

describe('editChildParams (Фаза 9.3)', () => {
  it('смена params куба = свежий CSG с новыми params; pivot не меняется', async () => {
    const cubeT = at(0), sphereT = at(14)
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, cubeT)
    const s = await shape('sphere', { radius: 8, segments: 32 }, sphereT)
    const root = await csg(c, s, 'union')
    const before = st().objects[root]
    const opsBefore = st().operations.length

    await st().editChildParams(root, c, { width: 30 })

    const after = st().objects[root]
    expect(after.transform).toEqual(before.transform)
    expect(after.vertices).not.toEqual(before.vertices)
    expect(st().operations.length).toBe(opsBefore + 1)
    const op = st().operations[st().operations.length - 1] as EditChildParamsOperation
    expect(op.type).toBe('edit_child_params')
    expect(op.rootId).toBe(root)
    expect(op.nodeId).toBe(c)
    expect(op.params.width).toBe(30)
    expect(st().historyIndex).toBe(st().operations.length)
    expect(getNode(c)?.params?.width).toBe(30)

    const fresh = await freshUnion(30, cubeT, sphereT)
    expectSameWorld(after, fresh)
  })

  it('те же значения — правка не создаёт операцию', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const root = await csg(c, s, 'union')
    const opsBefore = st().operations.length
    const objBefore = st().objects[root]
    await st().editChildParams(root, c, { width: 20 })
    expect(st().operations.length).toBe(opsBefore)
    expect(st().objects[root]).toBe(objBefore)
  })

  it('aabb и originalBboxSize пересчитаны', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const root = await csg(c, s, 'union')
    const before = st().objects[root].originalBboxSize!
    await st().editChildParams(root, c, { width: 40 })
    const after = st().objects[root]
    expect(before.x).toBeCloseTo(32, 1)
    expect(after.originalBboxSize!.x).toBeCloseTo(42, 1)
    expect(after.aabb!.max.x - after.aabb!.min.x).toBeCloseTo(after.originalBboxSize!.x, 4)
  })

  it('операнд A с вращением и масштабом (RS un-bake)', async () => {
    const cubeT = at(10, 5, 0, { rotX: 20, rotY: 30, rotZ: 10, scaleZ: 0.5 })
    const sphereT = at(24, 5, 0)
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, cubeT)
    const s = await shape('sphere', { radius: 8, segments: 32 }, sphereT)
    const root = await csg(c, s, 'union')

    await st().editChildParams(root, c, { width: 26 })
    const after = st().objects[root]
    const fresh = await freshUnion(26, cubeT, sphereT)
    expectSameWorld(after, fresh)
  })

  it('корень перемещён после CSG — правка всё равно корректна (pivot корня сохраняется)', async () => {
    const cubeT = at(0), sphereT = at(14)
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, cubeT)
    const s = await shape('sphere', { radius: 8, segments: 32 }, sphereT)
    const root = await csg(c, s, 'union')
    const moved = { ...st().objects[root].transform, x: 100, y: 7 }
    await st().moveObject(root, moved)

    await st().editChildParams(root, c, { width: 32 })

    const after = st().objects[root]
    const fresh = await freshUnion(32, cubeT, sphereT)
    expect(after.transform.x).toBe(100)
    // сдвигаем эталон на тот же pivot-сдвиг, что получил корень
    const shifted: SceneObject = { ...fresh, transform: { ...fresh.transform, x: fresh.transform.x + 100 - cubeT.x, y: fresh.transform.y + 7 } }
    expectSameWorld(after, shifted)
  })

  it('subtract: правка вычитаемого', async () => {
    const c = await shape('cube', { width: 30, height: 30, depth: 30 }, at(0))
    const s = await shape('sphere', { radius: 5, segments: 32 }, at(0))
    const root = await csg(c, s, 'subtract')
    const volBefore = meshVolume(st().objects[root].vertices, st().objects[root].indices)
    await st().editChildParams(root, s, { radius: 10 })
    const volAfter = meshVolume(st().objects[root].vertices, st().objects[root].indices)
    // больший шар вычитает больше → объём меньше
    expect(volAfter).toBeLessThan(volBefore - 1000)
  })

  it('вложенный CSG: правка внутреннего примитива', async () => {
    const cubeT = at(0), sphereT = at(14), cylT = at(-14)
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, cubeT)
    const s = await shape('sphere', { radius: 8, segments: 32 }, sphereT)
    const inner = await csg(c, s, 'union')
    const cyl = await shape('cylinder', { radius: 6, height: 24 }, cylT)
    const outer = await csg(inner, cyl, 'union')

    const view = getTreeView(outer)!
    expect(view.children[0].type).toBe('boolean')
    await st().editChildParams(outer, c, { width: 28 })
    expect(st().operations[st().operations.length - 1].type).toBe('edit_child_params')
    const edited = st().objects[outer]

    // эталон: те же операнды, но куб шире
    useDocumentStore.setState({ objects: {}, operations: [], historyIndex: 0, selectedIds: [], busy: false })
    clearSnapshots(); clearTree()
    const c2 = await shape('cube', { width: 28, height: 20, depth: 20 }, cubeT)
    const s2 = await shape('sphere', { radius: 8, segments: 32 }, sphereT)
    const inner2 = await csg(c2, s2, 'union')
    const cyl2 = await shape('cylinder', { radius: 6, height: 24 }, cylT)
    const outer2 = await csg(inner2, cyl2, 'union')
    expectSameWorld(edited, st().objects[outer2])
  })

  it('пустой результат отклоняется: состояние не меняется, показывается уведомление', async () => {
    const c = await shape('cube', { width: 10, height: 10, depth: 10 }, at(0))
    const s = await shape('sphere', { radius: 2, segments: 32 }, at(0))
    const root = await csg(c, s, 'subtract')
    const objBefore = st().objects[root]
    const opsBefore = st().operations.length
    const notesBefore = useNotifications.getState().notifications.length

    await st().editChildParams(root, s, { radius: 50 })

    expect(st().objects[root]).toBe(objBefore)
    expect(st().operations.length).toBe(opsBefore)
    expect(getNode(s)?.params?.radius).toBe(2)
    expect(st().busy).toBe(false)
    expect(useNotifications.getState().notifications.length).toBeGreaterThan(notesBefore)
  })

  it('не редактируемый узел (вложенный boolean) отклоняется без изменений', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const inner = await csg(c, s, 'union')
    const cyl = await shape('cylinder', { radius: 6, height: 24 }, at(-14))
    const outer = await csg(inner, cyl, 'union')
    const opsBefore = st().operations.length
    await st().editChildParams(outer, inner, { width: 5 })
    expect(st().operations.length).toBe(opsBefore)
  })

  it('вложенный CSG, сдвинутый до объединения: дерево не совпадает с мешем → правка отклонена', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const inner = await csg(c, s, 'union')
    await st().moveObject(inner, { ...st().objects[inner].transform, x: 60, z: 10 })
    const cyl = await shape('cylinder', { radius: 6, height: 24 }, at(40))
    const outer = await csg(inner, cyl, 'union')
    const objBefore = st().objects[outer]
    const opsBefore = st().operations.length

    await st().editChildParams(outer, c, { width: 40 })

    expect(st().operations.length).toBe(opsBefore)
    expect(st().objects[outer]).toBe(objBefore)
    expect(getNode(c)?.params?.width).toBe(20)
  })
})

describe('undo/redo и сериализация правки', () => {
  async function editedScene() {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const root = await csg(c, s, 'union')
    const original = st().objects[root]
    await st().editChildParams(root, c, { width: 30 })
    const edited = st().objects[root]
    return { c, s, root, original, edited }
  }

  it('undo возвращает меш и params дерева; redo — отредактированные (со сброшенными снимками)', async () => {
    const { c, root, original, edited } = await editedScene()
    clearSnapshots() // принудительный rebuild из истории (WASM-путь)

    await st().undo()
    expect(st().objects[root].vertices.length).toBe(original.vertices.length)
    expect(Array.from(st().objects[root].vertices)).toEqual(Array.from(original.vertices))
    expect(getNode(c)?.params?.width).toBe(20)

    await st().redo()
    expect(Array.from(st().objects[root].vertices)).toEqual(Array.from(edited.vertices))
    expect(st().objects[root].transform).toEqual(edited.transform)
    expect(getNode(c)?.params?.width).toBe(30)
  })

  it('undo/redo со снимками (мгновенный путь)', async () => {
    const { c, root, original, edited } = await editedScene()
    await st().undo()
    expect(st().objects[root].vertices).toBe(original.vertices)
    expect(getNode(c)?.params?.width).toBe(20)
    await st().redo()
    expect(st().objects[root].vertices).toBe(edited.vertices)
    expect(getNode(c)?.params?.width).toBe(30)
  })

  it('после undo повторная правка работает (дерево воспроизведено по истории)', async () => {
    const { c, root } = await editedScene()
    clearSnapshots()
    await st().undo()
    await st().editChildParams(root, c, { width: 24 })
    expect(st().operations[st().operations.length - 1].type).toBe('edit_child_params')
    expect((st().operations[st().operations.length - 1] as EditChildParamsOperation).params.width).toBe(24)
  })

  it('две правки подряд: итог = последняя', async () => {
    const { c, root } = await editedScene()
    await st().editChildParams(root, c, { width: 36 })
    clearSnapshots()
    const ops = st().operations
    const rebuilt = await rebuildFromHistory(ops.slice(0, st().historyIndex))
    expect(Array.from(rebuilt[root].vertices)).toEqual(Array.from(st().objects[root].vertices))
  })

  it('.3dtc round-trip: правка переживает сохранение/загрузку', async () => {
    const { c, root, edited } = await editedScene()
    const blob = await serialize3dtc({
      objects: st().objects,
      operations: st().operations,
      operationsTrimmed: false,
    })
    const parsed = await parse3dtc(blob)
    const editOp = parsed.operations.find((o): o is EditChildParamsOperation => o.type === 'edit_child_params')
    expect(editOp).toBeDefined()
    expect(Array.isArray(editOp!.resultVertices)).toBe(true)

    const rebuilt = await rebuildFromHistory(parsed.operations as TinkerCraftOperation[])
    const o = rebuilt[root]
    expect(o.vertices.length).toBe(edited.vertices.length)
    for (let i = 0; i < o.vertices.length; i += 97) {
      expect(o.vertices[i]).toBeCloseTo(edited.vertices[i], 4)
    }
    expect(o.transform).toEqual(edited.transform)
    expect(c).toBeTruthy()
  })

  it('CSG поверх отредактированного корня использует новую геометрию (кэш воркера синхронизирован)', async () => {
    const { root } = await editedScene()
    const big = await shape('sphere', { radius: 3, segments: 16 }, at(-30))
    const merged = await csg(root, big, 'union')
    const rootObj = st().objects[merged]
    // правка расширила куб до 30 → bbox объединения шире, чем у исходного 20
    expect(rootObj.originalBboxSize!.x).toBeGreaterThan(30 + 14)
  })
})

describe('checkChildEditable (Фаза 9.9)', () => {
  const args = (root: string, node: string) => ({
    rootId: root, nodeId: node, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
  })

  it('null для здорового ребёнка; дерево не мутируется', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const root = await csg(c, s, 'union')
    const nodeBefore = getNode(c)
    expect(await checkChildEditable(args(root, c))).toBeNull()
    expect(getNode(c)).toBe(nodeBefore)
  })

  it('tree_mismatch — сдвинутый до объединения вложенный CSG', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const inner = await csg(c, s, 'union')
    await st().moveObject(inner, { ...st().objects[inner].transform, x: 60, z: 10 })
    const cyl = await shape('cylinder', { radius: 6, height: 24 }, at(40))
    const outer = await csg(inner, cyl, 'union')
    expect(await checkChildEditable(args(outer, c))).toBe('tree_mismatch')
  })

  it('not_editable для вложенного boolean, not_found для неизвестного узла', async () => {
    const c = await shape('cube', { width: 20, height: 20, depth: 20 }, at(0))
    const s = await shape('sphere', { radius: 8, segments: 32 }, at(14))
    const inner = await csg(c, s, 'union')
    const cyl = await shape('cylinder', { radius: 6, height: 24 }, at(-14))
    const outer = await csg(inner, cyl, 'union')
    expect(await checkChildEditable(args(outer, inner))).toBe('not_editable')
    expect(await checkChildEditable(args(outer, 'nope'))).toBe('not_found')
  })
})
