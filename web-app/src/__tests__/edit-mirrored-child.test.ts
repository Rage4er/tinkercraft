// ============================================================
// edit-mirrored-child.test.ts — Фаза 9.8: правка зеркального ребёнка CSG
// ============================================================
// Зеркальный примитив-операнд = primitive-нода с params и списком плоскостей
// (`TreeNode.mirrored`); воркер отражает его в origin ДО TRS. Реальный WASM.

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
import { getTreeView, isChildEditable } from '../csg/tree-view'
import { computeRSMatrix } from '../csg/worker-matrix'
import { meshVolume, checkChildEditable } from '../store/edit-child'
import { rebuildBuildTree } from '../store/rebuild'
import type { SceneObject, TransformNR, ShapeParams } from '../csg/types'

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
const maxBboxDiff = (a: SceneObject, b: SceneObject): number => {
  const ba = bbox(worldVerts(a)), bb = bbox(worldVerts(b))
  return Math.max(...ba.map((v, i) => Math.abs(v - bb[i])))
}
function expectSameWorld(a: SceneObject, b: SceneObject): void {
  expect(maxBboxDiff(a, b)).toBeLessThan(5e-3)
  const va = meshVolume(worldVerts(a), a.indices), vb = meshVolume(worldVerts(b), b.indices)
  expect(Math.abs(va - vb) / Math.max(va, vb)).toBeLessThan(1e-3)
}

async function shape(type: 'sphere' | 'prism', params: ShapeParams, t: TransformNR): Promise<string> {
  await st().addShape(type, params)
  const ids = Object.keys(st().objects)
  const id = ids[ids.length - 1]
  await st().moveObject(id, t)
  return id
}
async function mirrorOf(id: string, plane: 'XY' | 'XZ' | 'YZ'): Promise<string> {
  const before = new Set(Object.keys(st().objects))
  useDocumentStore.setState({ selectedIds: [id] })
  await st().mirrorSelected(plane)
  const added = Object.keys(st().objects).filter((k) => !before.has(k))
  expect(added).toHaveLength(1)
  return added[0]
}
async function union(a: string, b: string): Promise<string> {
  st().selectObjects([a, b], false)
  await st().csgBoolean('union')
  return st().selectedIds[0]
}

const PRISM = (radius: number, height = 20): ShapeParams => ({ radius, height, sides: 5 })

/** призма → mirror YZ → union с сферой. Возвращает id зеркальной копии и корня. */
async function mirroredScene(radius: number, planes: Array<'XY' | 'XZ' | 'YZ'> = ['YZ'], height = 20) {
  const p = await shape('prism', PRISM(radius, height), at(30, 2, 0, { rotY: 25 }))
  let m = p
  for (const pl of planes) m = await mirrorOf(m, pl)
  const s = await shape('sphere', { radius: 9, segments: 32 }, at(-24, 0, 0))
  const rootId = await union(m, s)
  return { mirrored: m, rootId }
}

describe('9.8 — зеркальный ребёнок CSG', () => {
  it('операнд регистрируется как primitive + mirrored и считается редактируемым', async () => {
    const { mirrored, rootId } = await mirroredScene(10)
    const node = getNode(mirrored)!
    expect(node.type).toBe('primitive')
    expect(node.mirrored).toEqual(['YZ'])
    expect(node.params?.radius).toBe(10)
    expect(isChildEditable(mirrored)).toEqual({ editable: true, reason: null })
    const child = getTreeView(rootId)!.children.find((c) => c.id === mirrored)!
    expect(child.editable).toBe(true)
    expect(child.mirrored).toBe(true)
    expect(await checkChildEditable({
      rootId, nodeId: mirrored, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
    })).toBeNull()
  })

  it('правка params зеркального ребёнка = свежий CSG с новыми params (зеркало сохранено)', async () => {
    const { mirrored, rootId } = await mirroredScene(10)
    await st().editChildParams(rootId, mirrored, { radius: 14 })
    expect(st().operations[st().operations.length - 1].type).toBe('edit_child_params')
    expect(getNode(mirrored)?.params?.radius).toBe(14)
    expect(getNode(mirrored)?.mirrored).toEqual(['YZ'])
    const edited = st().objects[rootId]

    reset()
    const fresh = await mirroredScene(14)
    expectSameWorld(edited, st().objects[fresh.rootId])

    // тест различает зеркало: без отражения форма другая
    reset()
    const p = await shape('prism', PRISM(14), at(-30, 2, 0, { rotY: -25 })) // зеркальная позиция, но БЕЗ отражения геометрии
    const s = await shape('sphere', { radius: 9, segments: 32 }, at(-24, 0, 0))
    const unmirroredId = await union(p, s)
    const unmirrored = st().objects[unmirroredId]
    expect(maxBboxDiff(edited, unmirrored)).toBeGreaterThan(0.2)
  })

  it('два зеркала (YZ→XZ): список плоскостей и правка', async () => {
    const { mirrored, rootId } = await mirroredScene(10, ['YZ', 'XZ'])
    expect(getNode(mirrored)?.mirrored).toEqual(['YZ', 'XZ'])
    await st().editChildParams(rootId, mirrored, { height: 26 })
    const edited = st().objects[rootId]
    reset()
    const fresh = await mirroredScene(10, ['YZ', 'XZ'], 26)
    expectSameWorld(edited, st().objects[fresh.rootId])
  })

  it('зеркало переживает перестройку дерева по истории (загрузка проекта: дерево пусто)', async () => {
    const { mirrored, rootId } = await mirroredScene(10, ['YZ', 'XZ'])
    const ops = st().operations.slice(0, st().historyIndex)
    clearTree() // как при загрузке .3dtc: дерево строится заново только из операций
    rebuildBuildTree(ops, st().objects)

    const node = getNode(mirrored)!
    expect(node.type).toBe('primitive')
    expect(node.mirrored).toEqual(['YZ', 'XZ'])
    expect(node.params?.radius).toBe(10)
    // дерево снова воспроизводит меш → правка доступна и корректна
    expect(await checkChildEditable({
      rootId, nodeId: mirrored, objects: st().objects, operations: st().operations, historyIndex: st().historyIndex,
    })).toBeNull()
    await st().editChildParams(rootId, mirrored, { radius: 13 })
    const edited = st().objects[rootId]
    reset()
    const fresh = await mirroredScene(13, ['YZ', 'XZ'])
    expectSameWorld(edited, st().objects[fresh.rootId])
  })

  it('undo/redo (снимки очищены): зеркало и params узла воспроизводятся', async () => {
    const { mirrored, rootId } = await mirroredScene(10)
    await st().editChildParams(rootId, mirrored, { radius: 15 })
    clearSnapshots()
    await st().undo()
    expect(getNode(mirrored)?.params?.radius).toBe(10)
    expect(getNode(mirrored)?.mirrored).toEqual(['YZ'])
    await st().redo()
    expect(getNode(mirrored)?.params?.radius).toBe(15)
    expect(getNode(mirrored)?.mirrored).toEqual(['YZ'])
  })

  it('зеркало CSG с зеркальным ребёнком сохраняет объём (bake учитывает прежнее зеркало)', async () => {
    const { rootId } = await mirroredScene(10)
    const before = st().objects[rootId]
    const volBefore = meshVolume(before.vertices, before.indices)
    const mirroredRoot = await mirrorOf(rootId, 'XY')
    const after = st().objects[mirroredRoot]
    expect(Math.abs(meshVolume(after.vertices, after.indices) - volBefore) / volBefore).toBeLessThan(1e-3)
  })
})
